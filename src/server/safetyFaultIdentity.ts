import {stringNumberToEnergySegment} from '../lib/stringToEsMapper';

/** Use explicit source coordinates only. Never guess an array from an IP or sensor number. */
export function safetyFaultEquipment(raw: Record<string, unknown>, key: string, label: string) {
  const positive = (...values: unknown[]) => {
    for (const value of values) {
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const number = Number(value);
      if (Number.isSafeInteger(number) && number > 0) return number;
    }
    return null;
  };
  const coordinate = (tag: string) => key.match(new RegExp(`(?:^|[-_])${tag}[:_](\\d+)(?:$|[-_])`))?.[1];
  const array = positive(raw.arrayIndex, raw.arrayNumber, coordinate('A'), label.match(/\bArray\s+(\d+)\b/i)?.[1]);
  const string = positive(raw.stringIndex, raw.stringNumber, coordinate('S'), label.match(/\bString\s+(\d+)\b/i)?.[1]);
  const segment = positive(raw.energySegmentIndex, raw.energySegmentNumber, raw.localEsNumber,
    label.match(/\b(?:ES|Energy\s+Segment)\s*(\d+)\b/i)?.[1]) ?? stringNumberToEnergySegment(string);
  const controller = [raw.controllerName, raw.controllerLabel, raw.entitySubType, raw.entityType]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined;
  return {
    array: array ? `Array ${array}` : 'Array not reported',
    segment: segment ? `ES${segment}${string ? ` / String ${string}` : ''}` : /\b(?:CS|Collection Segment)\b/i.test(label) ? 'Collection segment' : 'Segment not reported',
    controller: controller || 'Controller not reported',
  };
}
