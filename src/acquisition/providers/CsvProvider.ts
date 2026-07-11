import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AcquisitionProvider, AcquisitionResult, AcquisitionSource } from '../base/AcquisitionProvider';

interface CsvSource extends AcquisitionSource {
  readonly path?: string;
  readonly content?: string;
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
}

export class CsvProvider implements AcquisitionProvider<CsvPayload> {
  public readonly name = 'csv';
  public readonly kind = 'csv';

  public async acquire(input: AcquisitionSource | unknown): Promise<AcquisitionResult<CsvPayload>> {
    const source = input as CsvSource;
    const sourceLabel = source?.name ?? this.name;

    try {
      const rawContent = await this.readContent(source);
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
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown CSV acquisition error';
      return {
        source: sourceLabel,
        kind: this.kind,
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async readContent(source: CsvSource): Promise<string> {
    if (typeof source?.content === 'string') {
      return source.content;
    }

    if (typeof source?.path === 'string' && source.path.length > 0) {
      const absolutePath = path.isAbsolute(source.path) ? source.path : path.resolve(source.path);
      return readFile(absolutePath, 'utf8');
    }

    throw new Error('CSV acquisition requires either a content string or a file path');
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
