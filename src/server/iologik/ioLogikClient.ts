import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';
import http from 'node:http';

export type DeviceReading = {
  model: string | null; firmware: string | null; firmwareRaw: string | null;
  do00Safe: string | null; do00PeerSafe: string | null; watchdogSeconds: number | null;
};
export class IoLogikError extends Error {
  constructor(readonly code: string) { super(code); }
}
const decode = (text: string) => text.replace(/&(?:amp|quot|apos|lt|gt|#39|#34|#38);/gi, value =>
  ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#34;': '"', '&#38;': '&' }[value.toLowerCase()] || value));
export function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return result;
}
const inputs = (html: string) => [...html.matchAll(/<input\b[^>]*>/gi)].map(match => attributes(match[0]));
export function tokenFrom(html: string): string | null {
  return inputs(html).find(input => input.name?.toLowerCase() === 'token')?.value || null;
}
export function uploadForm(html: string): { action: string; field: string; hidden: Record<string, string> } {
  for (const form of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
    const controls = inputs(form[2]), field = controls.find(input => input.type?.toLowerCase() === 'file')?.name;
    if (!field) continue;
    return {
action: attributes(form[1]).action || '', field, hidden: Object.fromEntries(controls
        .filter(input => input.type?.toLowerCase() === 'hidden' && input.name)
        .map(input => [input.name, input.value || '']))
};
  }
  throw new IoLogikError('upload_form_missing');
}
export function parseReading(info: string, config: string): DeviceReading {
  const row = (label: string) => info.match(new RegExp(label + '\\s*</t[dh]>\\s*<td[^>]*>([\\s\\S]*?)</td>', 'i'))?.[1]?.replace(/<[^>]+>/g, '').trim() || null;
  const firmwareRaw = row('Firmware Version');
  const firmware = firmwareRaw?.match(/\b[Vv]?(\d+\.\d+(?:\.\d+)*)/)?.[1] || null;
  const model = config.match(/^\s*MOD_TYPE\s*=\s*(.+)$/m)?.[1]?.trim() || row('Model(?: Name)?');
  const watchdog = config.match(/^\s*CONNECTION_WATCHDOG\s*=\s*(\d+)/m)?.[1];
  return {
model, firmware, firmwareRaw, do00Safe: config.match(/^\s*DO00=.*?DO00_SAFE=(\d+)/m)?.[1] ?? null,
    do00PeerSafe: peerSafeValue(config),
    watchdogSeconds: watchdog === undefined ? null : Number(watchdog)
};
}
const peerSafeLines = (text: string) => text.match(/^[ \t]*Peer_DO_SM_STATUS00[^\r\n]*/gm) || [];
const peerSafePattern = /^([ \t]*Peer_DO_SM_STATUS00[ \t]*=[ \t]*)([012])([ \t]*,[ \t]*)\((?:Off|On|Hold Last)\)[ \t]*$/;
function peerSafeValue(text: string): string | null {
  const lines = peerSafeLines(text);
  return lines.length === 1 ? lines[0].match(peerSafePattern)?.[2] ?? null : null;
}
function normalizePeerSafe(text: string, required: boolean): string {
  const lines = peerSafeLines(text);
  if (!lines.length && !required) return text;
  if (peerSafeValue(text) === null) throw new IoLogikError('device_peer_do00_configuration_unsupported');
  // The device's own DO settings form updates this companion field as well.
  // Preserve its existing native formatting and every other channel.
  return text.replace(/^[ \t]*Peer_DO_SM_STATUS00[^\r\n]*/m,
    line => line.replace(peerSafePattern, (_match, prefix: string, _value: string, separator: string) => `${prefix}0${separator}(Off)`));
}
export function stageConfiguration(text: string): { text: string; watchdogSeconds: number } {
  if (!/^\s*MOD_TYPE\s*=.*\bE1242\b/im.test(text)) throw new IoLogikError('configuration_model_not_e1242');
  const watchdog = Number(text.match(/^\s*CONNECTION_WATCHDOG\s*=\s*(\d+)/m)?.[1]);
  if (!Number.isInteger(watchdog) || watchdog < 30 || watchdog > 3600) throw new IoLogikError('configuration_watchdog_invalid');
  if (!/^\s*DO00=.*DO00_SAFE=\d+,\([^)]+\)/m.test(text)) throw new IoLogikError('configuration_do00_missing');
  const staged = normalizePeerSafe(text, false).split(/\r?\n/).filter(line => !/^\s*NET_/i.test(line))
    .map(line => /^\s*DO00=/.test(line) ? line.replace(/DO00_SAFE=\d+,\([^)]+\)/, 'DO00_SAFE=0,(Off)') : line).join('\r\n');
  return { text: staged, watchdogSeconds: watchdog };
}

export function prepareDeviceConfiguration(golden: string, current: string, expectedIp: string): string {
  const { watchdogSeconds } = stageConfiguration(golden);
  // The golden export supplies policy values, never a replacement device image.
  // Keep the target's version-specific fields, security settings and line endings.
  const oneLine = (key: string, spaced = false): string => {
    const lines = current.match(new RegExp(`^${key}${spaced ? '[ \\t]*' : ''}=[^\\r\\n]*`, 'gm')) || [];
    if (lines.length !== 1) throw new IoLogikError(`device_configuration_field_missing_or_duplicate_${key}`);
    return lines[0];
  };
  if (!/\bE1242\b/.test(oneLine('MOD_TYPE'))) throw new IoLogikError('device_model_not_verified_e1242');
  if (!/<END>[\r\n]*$/.test(current)) throw new IoLogikError('device_configuration_incomplete');
  if (oneLine('NET_IP', true).split('=')[1].trim() !== expectedIp) throw new IoLogikError('device_network_identity_mismatch');
  const output = oneLine('DO00');
  if (!/^DO00=0,\(DO\),/.test(output) || (output.match(/DO00_SAFE=/g) || []).length !== 1 || !/DO00_SAFE=[012],\([^)]+\)/.test(output)) {
    throw new IoLogikError('device_do00_configuration_unsupported');
  }
  const watchdog = oneLine('CONNECTION_WATCHDOG');
  if (!/^CONNECTION_WATCHDOG=\d+,\(sec\)$/.test(watchdog)) throw new IoLogikError('device_watchdog_configuration_unsupported');
  const overwrite = oneLine('NET_CONFIG_OVERWRITE');
  if (!/^NET_CONFIG_OVERWRITE=[01]$/.test(overwrite)) throw new IoLogikError('device_network_overwrite_unsupported');
  return normalizePeerSafe(current, true)
    .replace(/^DO00=[^\r\n]*/m, () => output.replace(/DO00_SAFE=[012],\([^)]+\)/, 'DO00_SAFE=0,(Off)'))
    .replace(/^CONNECTION_WATCHDOG=[^\r\n]*/m, () => watchdog.replace(/=\d+/, `=${watchdogSeconds}`))
    .replace(/^NET_CONFIG_OVERWRITE=[^\r\n]*/m, 'NET_CONFIG_OVERWRITE=0');
}
export function validateUploadResponse(kind:'configuration'|'firmware',html:string):void {
  const text=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  if(/Input Password|FAIL_MSG|invalid[_ ]token/i.test(html))throw new IoLogikError('upload_authentication_rejected');
  if(/import\s+config(?:uration)?\s+fail/i.test(text))throw new IoLogikError('configuration_import_rejected');
  if(/file process fails|file not found|invalid file format|read file fail|(?:upload|import|upgrade)\s+(?:process\s+|has\s+)?failed/i.test(text))throw new IoLogikError('upload_file_rejected');
  const confirmed=kind==='configuration'?/system configuration file imported and restart successfully/i.test(text):/firmware upgrade was successful/i.test(text);
  if(!confirmed)throw new IoLogikError('upload_response_unrecognized');
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
// Older Moxa HTTP implementations reject requests emitted by undici/fetch.
// Explicit HTTP/1.1 framing and conventional header casing work on the observed E1242.
export const deviceHttp: Fetcher = async (url, init = {}) => {
  const encoded = new Request(url, init);
  const body = init.body ? Buffer.from(await encoded.arrayBuffer()) : undefined;
  const headers: Record<string, string> = { Connection: 'close' };
  encoded.headers.forEach((value, key) => { headers[key.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('-')] = value; });
  if (body) headers['Content-Length'] = String(body.length);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: init.method || 'GET', headers, agent: false, signal: init.signal || undefined }, res => {
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2 * 1024 * 1024) { req.destroy(new IoLogikError('device_response_too_large')); return; } chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => {
        const received = new Headers();
        for (let index = 0;index < res.rawHeaders.length;index += 2)received.append(res.rawHeaders[index], res.rawHeaders[index + 1]);
        const status = res.statusCode || 500;
        resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: received }));
      });
    });
    req.on('error', reject); req.end(body);
  });
};
export class IoLogikClient {
  private readonly origin: string;
  private readonly cookies = new Map<string, string>();
  constructor(ip: string, private readonly password: string, private readonly fetcher: Fetcher = deviceHttp) {
    if (!isIPv4(ip)) throw new IoLogikError('invalid_device_ip');
    this.origin = `http://${ip}`;
  }
  private url(relative: string, base = '/'): string {
    const url = new URL(relative, new URL(base, this.origin));
    if (url.origin !== this.origin || url.username || url.password) throw new IoLogikError('cross_origin_device_link');
    return url.href;
  }
  private async request(relative: string, init: RequestInit = {}, timeout = 8000): Promise<string> {
    let url = this.url(relative);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      for (let redirects = 0;redirects < 4;redirects++) {
        const headers = new Headers(init.headers);
        if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
        if (!headers.has('Referer')) headers.set('Referer', this.origin + '/home.htm');
        const response = await this.fetcher(url, { ...init, headers, redirect: 'manual', signal: controller.signal });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0], split = pair.indexOf('=');
          if (split > 0) this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
        }
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          // Never replay a multipart write across a redirect.
          if (init.method && init.method !== 'GET') throw new IoLogikError('write_redirect_unverified');
          const location = response.headers.get('location');
          if (!location) throw new IoLogikError('redirect_without_location');
          url = this.url(location, url); continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new IoLogikError(`http_${response.status}`); }
        const reader = response.body?.getReader(); if (!reader) return '';
        const chunks: Uint8Array[] = []; let size = 0;
        try {
while (true) {
const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
            if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new IoLogikError('device_response_too_large'); } chunks.push(value);
}
}
        finally { reader.releaseLock(); }
        return Buffer.concat(chunks).toString('utf8');
      }
      throw new IoLogikError('redirect_limit');
    } catch (error) {
      if (error instanceof IoLogikError) throw error;
      throw new IoLogikError(controller.signal.aborted ? 'request_timeout' : 'device_connection_failed');
    } finally { clearTimeout(timer); }
  }
  async discover(): Promise<boolean> { try { await this.request('/contents.htm'); return true; } catch { return false; } }
  async login(): Promise<void> {
    this.cookies.clear();
    const root = await this.request('/');
    let token = tokenFrom(root);
    if (!token) token = tokenFrom(await this.request('/home.htm'));
    if (!token) for (const frame of [...root.matchAll(/<(?:i?frame)\b[^>]*>/gi)].slice(0, 8)) {
      const src = attributes(frame[0]).src; if (!src) continue;
      const html = await this.request(this.url(src)); token = tokenFrom(html); if (token) break;
    }
    if (!token) throw new IoLogikError('login_token_missing');
    const hash = createHash('md5').update(this.password + token).digest('hex'); // Device challenge protocol, not password storage.
    const html = await this.request('/home.htm', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': this.origin + '/' }, body: new URLSearchParams({ Token: token, Password: hash, Submit: 'Submit' }) });
    if (/Input Password|FAIL_MSG/i.test(html)) throw new IoLogikError('login_rejected');
    const info = await this.request('/01.htm');
    if (!parseReading(info, '').firmware) throw new IoLogikError('login_not_verified');
  }
  async read(): Promise<DeviceReading> {
    const info = await this.request('/01.htm');
    let config = ''; try { config = await this.request('/ik1242.txt'); } catch {/* Unknown settings stay unknown. */ }
    const reading = parseReading(info, config);
    if (!reading.firmware) throw new IoLogikError('firmware_not_reported');
    return reading;
  }
  async readConfiguration():Promise<string> {
    await this.request('/06_6.htm');
    return this.request('/ik1242.txt');
  }
  async upload(kind: 'configuration' | 'firmware', bytes: Uint8Array, fileName: string): Promise<void> {
    const page = kind === 'firmware' ? '/06_4.htm' : '/06_5.htm';
    const form = uploadForm(await this.request(page));
    const action = this.url(form.action || (kind === 'firmware' ? page : '/06_5_1.htm'), page);
    if (!Object.keys(form.hidden).some(key => key.toLowerCase() === 'token')) throw new IoLogikError('upload_token_missing');
    const body = new FormData();
    for (const [key, value] of Object.entries(form.hidden)) body.set(key, value);
    // An unchecked checkbox is omitted by the device GUI. Never enable network overwrite.
    body.delete('NetConfig_OverWrite');
    body.set(form.field, new Blob([new Uint8Array(bytes)], { type: kind === 'firmware' ? 'application/octet-stream' : 'text/plain' }), fileName);
    body.set(kind === 'configuration' ? 'import' : 'update', kind === 'configuration' ? 'Import' : 'Update');
    const response = await this.request(action, { method: 'POST', headers: { Referer: this.origin + page }, body }, kind === 'firmware' ? 300000 : 30000);
    validateUploadResponse(kind,response);
  }
  async setWatchdog(seconds: number): Promise<void> {
    const html = await this.request('/04_1.htm');
    const token = tokenFrom(html);
    const fields = new URLSearchParams();
    for (const tag of html.matchAll(/<input\b[^>]*>/gi)) {
      const input = attributes(tag[0]); if (!input.name || ['file', 'password', 'button'].includes(input.type?.toLowerCase())) continue;
      if (['checkbox', 'radio'].includes(input.type?.toLowerCase()) && !/\bchecked\b/i.test(tag[0])) continue;
      fields.set(input.name, input.value || '');
    }
    for (const select of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
      const name = attributes(select[1]).name, options = [...select[2].matchAll(/<option\b([^>]*)>([^<]*)/gi)];
      const option = options.find(o => /\bselected\b/i.test(o[1])) || options[0];
      if (name && option) fields.set(name, attributes(option[1]).value ?? decode(option[2]));
    }
    if (!token || !fields.has('WDTime')) throw new IoLogikError('watchdog_form_missing');
    fields.set('token', token); fields.set('WDTime', String(seconds)); fields.set('EnableWD', '1'); fields.set('Submit', 'Submit'); fields.set('code', '41');
    // Preserve unrelated settings from the device form; never replace them with script defaults.
    await this.request('/set.htm?' + fields.toString());
  }
}
