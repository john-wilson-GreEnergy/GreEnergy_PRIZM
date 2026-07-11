export interface AcquisitionSource {
  readonly name: string;
  readonly kind: string;
  readonly config?: Readonly<Record<string, unknown>>;
}
