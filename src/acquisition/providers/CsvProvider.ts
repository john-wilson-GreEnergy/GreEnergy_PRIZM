import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AcquisitionProvider, AcquisitionResult, AcquisitionSource } from '../base/AcquisitionProvider';

interface CsvSource extends AcquisitionSource {
  readonly path?: string;
  readonly content?: string;
  readonly url?: string;
  readonly timeoutMs?: number;
  readonly fallbackUrl?: string;
}

interface CsvRow {
  readonly [key: string]: string | undefined;
}

interface CsvPayload {
  readonly source: string;
  readonly rawContent: string;
  readonly rows: readonly CsvRow[];
  readonly headers: readonly string[];
  readonly rowCount: number;
  readonly columnCount: number;
  readonly statusCode?: number;
  readonly sourceUrl?: string;
  readonly fallbackUsed?: boolean;
}

interface CsvContentResult {
  readonly content: string;
  readonly statusCode?: number;
  readonly sourceUrl?: string;
  readonly fallbackUsed: boolean;
}

interface CsvAcquireError extends Error {
  statusCode?: number;
  sourceUrl?: string;
  fallbackUsed?: boolean;
}

export class CsvProvider implements AcquisitionProvider<CsvPayload> {
  public readonly name = 'csv';
  public readonly kind = 'csv';

  public async acquire(input: AcquisitionSource | unknown): Promise<AcquisitionResult<CsvPayload>> {
    const source = input as CsvSource;
    const sourceLabel = source?.name ?? this.name;

    try {
      const contentResult = await this.readContent(source);
      const rawContent = contentResult.content;
      const normalized = this.parseCsv(rawContent);

      return {
        source: sourceLabel,
        kind: this.kind,
        success: true,
        payload: {
          source: sourceLabel,
          rawContent,
          rows: normalized.rows,
          headers: normalized.headers,
          rowCount: normalized.rows.length,
          columnCount: normalized.headers.length,
          statusCode: contentResult.statusCode,
          sourceUrl: contentResult.sourceUrl,
          fallbackUsed: contentResult.fallbackUsed,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const typedError = error as CsvAcquireError;
      const message = error instanceof Error ? error.message : 'Unknown CSV acquisition error';
      return {
        source: sourceLabel,
        kind: this.kind,
        success: false,
        error: message,
        payload: {
          source: sourceLabel,
          rawContent: '',
          rows: [],
          headers: [],
          rowCount: 0,
          columnCount: 0,
          statusCode: typedError.statusCode,
          sourceUrl: typedError.sourceUrl,
          fallbackUsed: !!typedError.fallbackUsed,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async readContent(source: CsvSource): Promise<CsvContentResult> {
    if (typeof source?.content === 'string') {
      return {
        content: source.content,
        fallbackUsed: false,
      };
    }

    if (typeof source?.url === 'string' && source.url.length > 0) {
      const timeoutMs = source.timeoutMs ?? 5000;

      try {
        return await this.fetchUrl(source.url, timeoutMs, false);
      } catch (firstError) {
        if (typeof source.fallbackUrl === 'string' && source.fallbackUrl.length > 0) {
          try {
            return await this.fetchUrl(source.fallbackUrl, timeoutMs, true);
          } catch (fallbackError) {
            const error = fallbackError as CsvAcquireError;
            error.fallbackUsed = true;
            throw error;
          }
        }
        const error = firstError as CsvAcquireError;
        throw error;
      }
    }

    if (typeof source?.path === 'string' && source.path.length > 0) {
      const absolutePath = path.isAbsolute(source.path) ? source.path : path.resolve(source.path);
      return {
        content: await readFile(absolutePath, 'utf8'),
        sourceUrl: absolutePath,
        fallbackUsed: false,
      };
    }

    throw new Error('CSV acquisition requires either a content string or a file path');
  }

  private async fetchUrl(url: string, timeoutMs: number, fallbackUsed: boolean): Promise<CsvContentResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      const statusCode = response.status;
      if (!response.ok) {
        const error = new Error(`HTTP ${statusCode}`) as CsvAcquireError;
        error.statusCode = statusCode;
        error.sourceUrl = url;
        error.fallbackUsed = fallbackUsed;
        throw error;
      }

      return {
        content: await response.text(),
        statusCode,
        sourceUrl: url,
        fallbackUsed,
      };
    } catch (error) {
      const typedError = error as CsvAcquireError;
      typedError.sourceUrl = typedError.sourceUrl || url;
      typedError.fallbackUsed = typeof typedError.fallbackUsed === 'boolean' ? typedError.fallbackUsed : fallbackUsed;
      if (!typedError.statusCode && typedError.name === 'AbortError') {
        typedError.statusCode = 408;
      }
      throw typedError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseCsv(rawContent: string): { headers: string[]; rows: CsvRow[] } {
    const trimmed = rawContent.trim();
    if (trimmed.length === 0) {
      return {
        headers: [],
        rows: [],
      };
    }

    const lines = trimmed.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) {
      return {
        headers: [],
        rows: [],
      };
    }

    const parsedLines = lines.map((line) => this.parseLine(line));
    const headers = parsedLines[0].map((value) => value.trim());
    const rows = parsedLines.slice(1).map((values) => this.createRow(headers, values));

    return {
      headers,
      rows,
    };
  }

  private parseLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (character === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += character;
      }
    }

    values.push(current);
    return values;
  }

  private createRow(headers: readonly string[], values: readonly string[]): CsvRow {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  }
}
