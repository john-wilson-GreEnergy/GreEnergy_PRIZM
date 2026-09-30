import type { AcquisitionProvider, AcquisitionResult, AcquisitionSource } from '../base/AcquisitionProvider';

interface RestSource extends AcquisitionSource {
  readonly url: string;
  readonly timeoutMs?: number;
  readonly onTiming?: (timing: RestTiming) => void;
}

export interface RestTiming {
  readonly headersMs: number | null;
  readonly bodyReadMs: number | null;
  readonly totalMs: number;
  readonly bodyComplete: boolean;
  readonly status: number | null;
  readonly serverDateMs: number | null;
}

interface RestPayload {
  readonly url: string;
  readonly status: number;
  readonly contentType?: string;
  readonly body: string;
  readonly bodyIsJson: boolean;
  readonly headers: Readonly<Record<string, string>>;
}

export class RestProvider implements AcquisitionProvider<RestPayload> {
  public readonly name = 'rest';
  public readonly kind = 'rest';
  constructor(private readonly now:()=>number=()=>performance.now()) {}

  public async acquire(input: AcquisitionSource | unknown): Promise<AcquisitionResult<RestPayload>> {
    const source = input as RestSource;
    const url = source?.url;
    const timeoutMs = source?.timeoutMs ?? 5000;

    if (typeof url !== 'string' || url.length === 0) {
      return {
        source: source?.name ?? this.name,
        kind: this.kind,
        success: false,
        error: 'Invalid REST source: expected a non-empty url',
        timestamp: new Date().toISOString(),
      };
    }

    const controller = new AbortController();
    const measured=typeof source.onTiming === 'function';
    const startedAt=measured?this.now():0;
    let headersAt:number|null=null,bodyFinishedAt:number|null=null,status:number|null=null,serverDateMs:number|null=null;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      if(measured){headersAt=this.now();status=response.status;const date=Date.parse(response.headers.get('date')??'');serverDateMs=Number.isFinite(date)?date:null;}

      const contentType = response.headers.get('content-type') ?? undefined;
      // Headers are not the end of acquisition: large or stalled bodies must
      // remain covered by the same deadline as the connection.
      const rawBody = await response.text();
      if(measured)bodyFinishedAt=this.now();
      const bodyIsJson = this.isLikelyJson(contentType, rawBody);
      const headers = this.collectHeaders(response.headers);

      if (!response.ok) {
        return {
          source: source.name ?? this.name,
          kind: this.kind,
          success: false,
          error: `HTTP ${response.status}`,
          payload: {
            url,
            status: response.status,
            contentType,
            body: rawBody,
            bodyIsJson,
            headers,
          },
          timestamp: new Date().toISOString(),
        };
      }

      return {
        source: source.name ?? this.name,
        kind: this.kind,
        success: true,
        payload: {
          url,
          status: response.status,
          contentType,
          body: rawBody,
          bodyIsJson,
          headers,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown REST acquisition error';
      return {
        source: source?.name ?? this.name,
        kind: this.kind,
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
      if(measured) {
        const endedAt=this.now();
        try {source.onTiming!({headersMs:headersAt===null?null:headersAt-startedAt,
          bodyReadMs:headersAt===null?null:(bodyFinishedAt??endedAt)-headersAt,totalMs:endedAt-startedAt,
          bodyComplete:bodyFinishedAt!==null,status,serverDateMs});} catch { /* Diagnostics cannot change the result. */ }
      }
    }
  }

  private isLikelyJson(contentType: string | undefined, body: string): boolean {
    if (contentType?.includes('json')) {
      return true;
    }

    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      try {
        JSON.parse(body);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private collectHeaders(headers: Headers): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
