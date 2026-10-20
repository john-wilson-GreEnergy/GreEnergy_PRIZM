/** Offline PKI preparation only. Does not install trust, start services, or change networking. */
import {mkdir, writeFile, readFile, chmod, stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {X509Certificate, createPublicKey, randomBytes} from 'node:crypto';
import {isIPv4} from 'node:net';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const run = promisify(execFile);
const privateIp = value => typeof value === 'string' && isIPv4(value) &&
  (/^(10\.|192\.168\.)/.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value));
export function validateTlsPlan(plan) {
  if (!plan || typeof plan !== 'object' || Object.keys(plan).some(k => !['fleetIp', 'ss3Ip', 'ss4Ip'].includes(k)) ||
      ![plan.fleetIp, plan.ss3Ip, plan.ss4Ip].every(privateIp) ||
      new Set([plan.fleetIp, plan.ss3Ip, plan.ss4Ip]).size !== 3) throw new Error('Three distinct private IPv4 certificate identities required');
  return {...plan};
}

export async function provisionFleetTls(directory, input) {
  const plan = validateTlsPlan(input);
  if (process.platform === 'win32') throw new Error('Windows private-key ACL provisioning is not yet validated');
  if (!path.isAbsolute(directory) || path.dirname(directory) === directory) throw new Error('New absolute output directory required');
  await run('openssl', ['version'], {timeout: 10000});
  // Exclusive creation; never replace a CA or leaf key from a previous run.
  await mkdir(directory, {mode: 0o700});
  const previousUmask = process.umask(0o077);
  const command = args => run('openssl', args, {timeout: 30000, maxBuffer: 1024 * 1024});
  const save = (file, value) => writeFile(file, value, {flag: 'wx', mode: 0o600});
  const key = async file => {
    await command(['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', file]);
    await chmod(file, 0o600);
  };
  try {
    const caDir = path.join(directory, 'authority'); await mkdir(caDir, {mode: 0o700});
    const caKey = path.join(caDir, 'ca-key.pem'), caCert = path.join(directory, 'ca-cert.pem');
    const caConfig = path.join(caDir, 'ca.conf');
    await save(caConfig, '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=PRIZM Fleet Private Root\n[ext]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
    await key(caKey);
    await command(['req', '-new', '-x509', '-sha256', '-days', '1825', '-key', caKey, '-out', caCert, '-config', caConfig, '-set_serial', '0x' + randomBytes(16).toString('hex')]);
    await chmod(caCert, 0o600);
    const authority = new X509Certificate(await readFile(caCert));
    const certificates = [];
    for (const [name, ip] of [['fleet', plan.fleetIp], ['ss3', plan.ss3Ip], ['ss4', plan.ss4Ip]]) {
      const leafDir = path.join(directory, name); await mkdir(leafDir, {mode: 0o700});
      const keyFile = path.join(leafDir, 'key.pem'), certFile = path.join(leafDir, 'cert.pem');
      const csr = path.join(leafDir, 'request.pem'), extensions = path.join(leafDir, 'extensions.conf');
      await key(keyFile);
      await command(['req', '-new', '-sha256', '-key', keyFile, '-out', csr, '-subj', '/CN=PRIZM ' + name]);
      await save(extensions, `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${ip}\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`);
      await command(['x509', '-req', '-sha256', '-days', '365', '-in', csr, '-CA', caCert, '-CAkey', caKey, '-set_serial', '0x' + randomBytes(16).toString('hex'), '-extfile', extensions, '-out', certFile]);
      await chmod(certFile, 0o600);
      await command(['verify', '-purpose', 'sslserver', '-CAfile', caCert, certFile]);
      const cert = new X509Certificate(await readFile(certFile));
      const publicKey = createPublicKey(await readFile(keyFile)).export({type: 'spki', format: 'der'});
      if (cert.ca || !cert.verify(authority.publicKey) || cert.checkIP(ip) !== ip ||
          !cert.publicKey.export({type: 'spki', format: 'der'}).equals(publicKey)) throw new Error('Certificate identity/key verification failed');
      if (((await stat(keyFile)).mode & 0o077) !== 0) throw new Error('Private key permissions failed');
      certificates.push({name, ip, sha256: cert.fingerprint256, validTo: cert.validTo});
    }
    const manifest = {createdAt: new Date().toISOString(), status: 'prepared-not-installed',
      ca: {sha256: authority.fingerprint256, validTo: authority.validTo}, certificates};
    await save(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  } catch (error) {
    throw new Error(`PKI preparation failed; retain and inspect the private partial directory ${directory}. No existing credentials were replaced.`, {cause: error});
  } finally {process.umask(previousUmask);}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, fleetIp, ss3Ip, ss4Ip, ...extra] = process.argv.slice(2);
  if (!directory || extra.length) {console.error('Usage: node scripts/security/provisionFleetTls.mjs NEW_ABSOLUTE_DIRECTORY FLEET_IP SS3_INTERNAL_IP SS4_INTERNAL_IP');process.exitCode = 1;}
  else provisionFleetTls(directory, {fleetIp, ss3Ip, ss4Ip}).then(manifest => {
    console.log(JSON.stringify(manifest, null, 2));
    console.log('Prepared only. Keep authority/ offline from services. Distribute only ca-cert.pem for client trust after fingerprint verification.');
  }).catch(error => {console.error(error.message);process.exitCode = 1;});
}
