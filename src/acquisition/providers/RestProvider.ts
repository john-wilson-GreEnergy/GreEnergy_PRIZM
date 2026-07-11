import type { AcquisitionProvider, AcquisitionResult, AcquisitionSource } from '../base/AcquisitionProvider';

export class RestProvider implements AcquisitionProvider<Record<string, unknown>> {
  public readonly name = 'rest';
  public readonly kind = 'rest';

  public async acquire(input: AcquisitionSource | unknown): Promise<AcquisitionResult<Record<string, unknown>>> {
    const source = input as AcquisitionSource;
    return {
      source: source.name ?? this.name,
      kind: this.kind,
      success: true,
      payload: {
        provider: this.name,
        input,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
