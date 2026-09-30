/** Independent read-only providers may overlap, but both must settle before publication. */
export async function pairedAcquisition<T>(primary: () => Promise<T>, secondary: (() => Promise<void>) | null, parallel: boolean): Promise<[PromiseSettledResult<T>, PromiseSettledResult<void> | null]> {
  const first = Promise.resolve().then(primary);
  if (parallel && secondary) {
    const [a,b] = await Promise.allSettled([first, Promise.resolve().then(secondary)]);
    return [a,b];
  }
  const [a] = await Promise.allSettled([first]);
  const b = secondary ? (await Promise.allSettled([Promise.resolve().then(secondary)]))[0] : null;
  return [a,b];
}
