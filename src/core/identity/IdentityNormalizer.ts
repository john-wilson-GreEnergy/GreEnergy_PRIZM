export class IdentityNormalizer {
  public normalize(input: string): string {
    const trimmed = input.trim().toLowerCase();
    const collapsedWhitespace = trimmed.replace(/\s+/g, ' ');
    const normalizedSeparators = collapsedWhitespace.replace(/[\s_/:-]+/g, '-');
    return normalizedSeparators.replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
}
