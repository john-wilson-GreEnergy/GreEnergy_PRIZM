import type { AcquisitionProvider, AcquisitionResult, AcquisitionSource } from '../base/AcquisitionProvider';

interface RestSource extends AcquisitionSource {
  readonly url: string;
  readonly timeoutMs?: number;
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

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') ?? undefined;
      const rawBody = await response.text();
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
