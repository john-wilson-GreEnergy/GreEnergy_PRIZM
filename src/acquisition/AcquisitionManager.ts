import type { AcquisitionProvider, AcquisitionResult, AcquisitionSource } from './base/AcquisitionProvider';

export class AcquisitionManager {
  private providers: Map<string, AcquisitionProvider>;

  constructor(providers: readonly AcquisitionProvider[] = []) {
    this.providers = new Map(providers.map((provider) => [provider.kind, provider]));
  }

  public async acquire(source: AcquisitionSource, input: unknown = source): Promise<AcquisitionResult> {
    const provider = this.providers.get(source.kind);
    if (!provider) {
      return {
        source: source.name,
        kind: source.kind,
        success: false,
        error: 'No matching provider',
        timestamp: new Date().toISOString(),
      };
    }

    return provider.acquire(input);
  }

  public register(provider: AcquisitionProvider): void {
    this.providers.set(provider.kind, provider);
  }
}
