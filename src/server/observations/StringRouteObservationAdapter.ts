import type { ObjectGraphSnapshot, StringObject } from '../../core/objectGraph';
import { buildStringBucketSummary } from '../siteOperations';
import { immutableBindingValue } from '../telemetry/binding';
import type { CurrentObjectState, ObservationSnapshot } from './ObservationTypes';

export type StringRouteVariant = 'local-strings' | 'strings-dashboard' | 'site-operations';
export type PublicFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown';

export interface ControllerIpMapping { readonly arrayIndex: number; readonly stringIndex: number; readonly ip: string; readonly source: string }
export interface StringRouteFieldAdapter {
  readonly legacySourceFields: readonly string[]; readonly observationMetric: string; readonly outputField: string;
  readonly outputType: PublicFieldType; readonly unit: string | null; readonly missingBehavior: 'omit' | 'undefined' | 'null' | 'default';
  readonly routeVariants: readonly StringRouteVariant[]; readonly convert: (value: unknown, row: Readonly<Record<string, unknown>>) => unknown;
}
export interface StringRouteAdapterInput {
  readonly normalizedLegacyRows: readonly Readonly<Record<string, unknown>>[]; readonly observationSnapshot: ObservationSnapshot;
  readonly graph: ObjectGraphSnapshot | null; readonly controllerIpMappings?: readonly ControllerIpMapping[]; readonly routeVariant: StringRouteVariant;
  readonly rootTemplate?: unknown;
}
export interface StringRouteAdapterPerformance { readonly fieldAdapterDurationMs: number; readonly reconstructionDurationMs: number; readonly observationLookups: number; readonly graphLookups: number; readonly reconstructedRows: number; readonly estimatedTemporaryAllocations: number }
export interface StringRouteAdapterResult { readonly response: unknown; readonly rows: readonly Readonly<Record<string, unknown>>[]; readonly controllerIpSources: Readonly<Record<string, string>>; readonly performance: StringRouteAdapterPerformance }

const allRoutes: readonly StringRouteVariant[] = ['local-strings', 'strings-dashboard', 'site-operations'];
export const DASHBOARD_COMPATIBILITY_OVERLAY_FIELDS = Object.freeze(['raw', 'contactorStatus', 'contactorsCloseExpected', 'bothContactorsClosed', 'contactor', 'requestedContactorState', 'contactorState', 'actualContactorStateSource', 'stringContactorState', 'fanRequested', 'fanActual'] as const);
const numberOrNull = (value: unknown): number | null => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const positive = (value: unknown): number | null => { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; };
const identity = (value: unknown) => value;
const descriptor = (outputField: string, legacySourceFields: readonly string[], observationMetric: string, outputType: PublicFieldType, unit: string | null, convert: StringRouteFieldAdapter['convert'] = identity, routeVariants: readonly StringRouteVariant[] = allRoutes, missingBehavior: StringRouteFieldAdapter['missingBehavior'] = 'omit'): StringRouteFieldAdapter => ({ legacySourceFields, observationMetric, outputField, outputType, unit, missingBehavior, routeVariants, convert });

/** The registry documents the legacy compatibility rules. Dynamic passthrough entries are appended for every remaining public source field. */
export const STRING_ROUTE_FIELD_ADAPTERS: readonly StringRouteFieldAdapter[] = Object.freeze([
  descriptor('arrayIndex', ['arrayIndex', 'arrayNumber'], 'arrayIndex', 'number', null, numberOrNull),
  descriptor('stringIndex', ['stringIndex', 'stringNumber'], 'stringIndex', 'number', null, numberOrNull),
  descriptor('stringKey', ['stringKey', 'StringKey'], 'stringKey', 'string', null),
  descriptor('ipAddress', ['ipAddress', 'stringControllerIp', 'controllerIp'], 'controllerIp', 'string', null, identity, ['local-strings']),
  descriptor('stringControllerIp', ['stringControllerIp', 'ipAddress', 'controllerIp'], 'controllerIp', 'string', null, identity, ['strings-dashboard', 'site-operations']),
  descriptor('timestamp', ['timestamp', 'timestampUtc', 'sourceTimestampUtc'], 'lastTelemetryTimestamp', 'string', null, identity, ['local-strings']),
  descriptor('datetime', ['datetime'], 'datetime', 'string', null, identity, ['local-strings']),
  descriptor('connectionState', ['connectionState', 'stringConnectionState'], 'connectionState', 'string', null),
  descriptor('soc', ['soc', 'socPct'], 'soc', 'number', '%', numberOrNull, ['local-strings']),
  descriptor('socPct', ['socPct', 'soc'], 'soc', 'number', '%', numberOrNull, ['strings-dashboard', 'site-operations']),
  descriptor('kw', ['kw', 'powerKw'], 'power', 'number', 'kW', numberOrNull),
  descriptor('stringCurrent', ['stringCurrent', 'amps', 'currentA'], 'current', 'number', 'A', numberOrNull, ['local-strings']),
  descriptor('kwh', ['kwh', 'kWh', 'storedKWh'], 'kwh', 'number', 'kWh', numberOrNull, ['local-strings']),
  descriptor('ah', ['ah', 'ampHours'], 'ah', 'number', 'Ah', numberOrNull, ['local-strings']),
  descriptor('calculatedVoltage', ['calculatedVoltage', 'calculatedVoltageVdc'], 'calculatedVoltage', 'number', 'V', numberOrNull, ['local-strings']),
  descriptor('dcBusVoltage', ['dcBusVoltage', 'busVoltage', 'busVoltageVdc'], 'busVoltage', 'number', 'V', numberOrNull, ['local-strings']),
  descriptor('ctCurrent1', ['ctCurrent1'], 'ctCurrent1', 'number', 'A', numberOrNull, ['local-strings']),
  descriptor('ctCurrent2', ['ctCurrent2'], 'ctCurrent2', 'number', 'A', numberOrNull, ['local-strings']),
  descriptor('contactorsCloseExpected', ['contactorsCloseExpected'], 'contactorsCloseExpected', 'boolean', null, identity, ['local-strings']),
  descriptor('positiveContactorClosed', ['positiveContactorClosed'], 'positiveContactorClosed', 'boolean', null, identity, ['local-strings']),
  descriptor('negativeContactorClosed', ['negativeContactorClosed'], 'negativeContactorClosed', 'boolean', null, identity, ['local-strings']),
  descriptor('contactorMismatch', ['contactorMismatch'], 'contactorMismatch', 'boolean', null, identity, ['local-strings']),
  descriptor('recloseCount', ['recloseCount'], 'recloseCount', 'number', 'count', numberOrNull, ['local-strings']),
  descriptor('amps', ['amps', 'currentA', 'stringCurrent'], 'current', 'number', 'A', numberOrNull, ['strings-dashboard', 'site-operations']),
  descriptor('measuredVoltage', ['measuredVoltage', 'measuredVoltageVdc'], 'measuredVoltage', 'number', 'V', numberOrNull),
  descriptor('minCellVoltage', ['minCellVoltage'], 'minCellVoltage', 'number', 'V', numberOrNull),
  descriptor('maxCellVoltage', ['maxCellVoltage'], 'maxCellVoltage', 'number', 'V', numberOrNull),
  descriptor('voltageDelta', ['cellVoltageDelta', 'voltageDelta'], 'voltageDelta', 'number', 'V', numberOrNull, ['local-strings']),
  descriptor('voltageDelta', ['voltageDelta'], 'voltageDelta', 'number', 'V', numberOrNull, ['strings-dashboard', 'site-operations']),
  descriptor('minCellTemperature', ['minCellTemperature', 'minCellTempC'], 'minCellTemperature', 'number', '°C', numberOrNull),
  descriptor('maxCellTemperature', ['maxCellTemperature', 'maxCellTempC'], 'maxCellTemperature', 'number', '°C', numberOrNull),
  descriptor('cellTemperatureDelta', ['cellTemperatureDelta', 'deltaCellTempC'], 'temperatureDelta', 'number', '°C', numberOrNull),
  descriptor('maxCellTemp', ['maxCellTemp', 'maxCellTemperature', 'maxCellTempC'], 'maxCellTemperature', 'number', '°C', numberOrNull, ['local-strings']),
  descriptor('minCellTemp', ['minCellTemp', 'minCellTemperature', 'minCellTempC'], 'minCellTemperature', 'number', '°C', numberOrNull, ['local-strings']),
  descriptor('avgCellTemp', ['avgCellTemp', 'avgCellTemperature', 'avgCellTempC'], 'avgCellTemperature', 'number', '°C', numberOrNull, ['local-strings']),
  descriptor('tempDelta', ['tempDelta', 'cellTemperatureDelta', 'deltaCellTempC'], 'temperatureDelta', 'number', '°C', numberOrNull, ['local-strings']),
  descriptor('avgCellVoltage', ['avgCellVoltage'], 'avgCellVoltage', 'number', 'V', numberOrNull, ['local-strings']),
  descriptor('outRotation', ['outRotation'], 'rotationState', 'boolean', null),
  descriptor('rotationStatus', ['rotationStatus'], 'rotationState', 'string', null, identity, ['strings-dashboard', 'site-operations']),
  descriptor('warningCount', ['warningCount', 'warnCount'], 'warningCount', 'number', 'count', numberOrNull),
  descriptor('alarmCount', ['alarmCount'], 'alarmCount', 'number', 'count', numberOrNull),
  descriptor('alarms', ['alarms'], 'alarms', 'array', null, identity, ['local-strings']),
  descriptor('warnCount', ['warnCount', 'warningCount'], 'warningCount', 'number', 'count', numberOrNull, ['local-strings']),
  descriptor('warns', ['warns', 'warnings'], 'warnings', 'array', null, identity, ['local-strings']),
  descriptor('lastFanCommand', ['lastFanCommand'], 'lastFanCommand', 'string', null, identity, ['local-strings']),
  descriptor('location', ['location'], 'location', 'string', null, identity, ['local-strings']),
  descriptor('entityToken', ['entityToken'], 'entityToken', 'string', null, identity, ['local-strings']),
  descriptor('badReport', ['badReport'], 'badReport', 'boolean', null),
  descriptor('bpcCount', ['bpcCount', 'cellGroupCount'], 'cellGroupCount', 'number', 'count', numberOrNull),
]);

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const stateRow = (state: CurrentObjectState): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const observation of Object.values(state.observationsByMetric)) {
    const field = observation.metadata.sourceField;
    if (observation.metadata.present === true && typeof field === 'string') row[field] = observation.value;
  }
  return row;
};
export const reconstructObservationSourceRows = (snapshot: ObservationSnapshot): readonly Readonly<Record<string, unknown>>[] => immutableBindingValue(snapshot.currentStates.filter((state) => state.objectKind === 'string').map(stateRow));
const coordinate = (row: Readonly<Record<string, unknown>>): string | null => {
  const arrayIndex = positive(row.arrayIndex ?? row.arrayNumber ?? row.ArrayIndex); const stringIndex = positive(row.stringIndex ?? row.stringNumber ?? row.StringIndex);
  return arrayIndex && stringIndex ? `${arrayIndex}:${stringIndex}` : null;
};
const rootRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value as Record<string, unknown>) : {};
const routeRows = (variant: StringRouteVariant, value: unknown): readonly Readonly<Record<string, unknown>>[] => { const root = value && typeof value === 'object' ? value as Record<string, unknown> : {}; if (variant === 'local-strings') return Array.isArray(root.data) ? root.data : []; if (variant === 'strings-dashboard') return Array.isArray(root.strings) ? root.strings : []; const summary = root.stringSummary && typeof root.stringSummary === 'object' ? root.stringSummary as Record<string, unknown> : {}; return Array.isArray(summary.tableRows) ? summary.tableRows : []; };

export function createStringRouteFieldAdapterRegistry(rows: readonly Readonly<Record<string, unknown>>[], variant: StringRouteVariant): readonly StringRouteFieldAdapter[] {
  const publicFields = new Set(rows.flatMap((row) => Object.keys(row))); const explicit = STRING_ROUTE_FIELD_ADAPTERS.filter((entry) => entry.routeVariants.includes(variant) && publicFields.has(entry.outputField)); const covered = new Set(explicit.map((entry) => entry.outputField));
  const passthrough = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !covered.has(key)).sort().map((key) => descriptor(key, [key], key, 'unknown', null, identity, [variant]));
  return Object.freeze([...explicit, ...passthrough]);
}

export class StringRouteObservationAdapter {
  reconstruct(input: StringRouteAdapterInput): StringRouteAdapterResult {
    const started = performance.now(); const frozenRows = immutableBindingValue(input.normalizedLegacyRows); const states = input.observationSnapshot.currentStates.filter((state) => state.objectKind === 'string');
    const byCoordinate = new Map(states.map((state) => { const row = stateRow(state); return [coordinate(row) ?? String(state.objectId), { state, row }] as const; }));
    const graphByCoordinate = new Map((input.graph?.objects ?? []).filter((object): object is StringObject => object.kind === 'string').map((object) => [`${object.arrayIndex}:${object.stringIndex}`, object]));
    const ipByCoordinate = new Map((input.controllerIpMappings ?? []).map((mapping) => [`${mapping.arrayIndex}:${mapping.stringIndex}`, mapping]));
    const shapeRows = routeRows(input.routeVariant, input.rootTemplate); const registryRows = input.routeVariant === 'site-operations' || shapeRows.length === 0 ? frozenRows : shapeRows; const shapeByCoordinate = new Map(shapeRows.map((row) => [coordinate(row), row]));
    const registry = createStringRouteFieldAdapterRegistry(registryRows, input.routeVariant); const controllerIpSources: Record<string, string> = {}; let observationLookups = 0; let graphLookups = 0; let allocations = 6;
    const fieldStarted = performance.now();
    const reconstructed = frozenRows.map((legacyRow) => {
      const key = coordinate(legacyRow); const match = key ? byCoordinate.get(key) : undefined; const publicShape = key ? shapeByCoordinate.get(key) ?? legacyRow : legacyRow; if (key) { observationLookups++; graphLookups++; }
      const canonicalState = match?.row ?? {}; const representations = canonicalState.routeRepresentations && typeof canonicalState.routeRepresentations === 'object' ? canonicalState.routeRepresentations as Readonly<Record<string, unknown>> : {}; const localRepresentation = representations.localStrings && typeof representations.localStrings === 'object' ? representations.localStrings as Readonly<Record<string, unknown>> : null; const siteOperationsRepresentation = representations.siteOperationsSource && typeof representations.siteOperationsSource === 'object' ? representations.siteOperationsSource as Readonly<Record<string, unknown>> : null; const canonical = input.routeVariant === 'local-strings' && localRepresentation ? localRepresentation : input.routeVariant === 'site-operations' && siteOperationsRepresentation ? siteOperationsRepresentation : canonicalState; const graphObject = key ? graphByCoordinate.get(key) : undefined; const mapping = key ? ipByCoordinate.get(key) : undefined; const output: Record<string, unknown> = siteOperationsRepresentation && input.routeVariant === 'site-operations' ? { ...siteOperationsRepresentation } : {}; allocations++;
      if (!(siteOperationsRepresentation && input.routeVariant === 'site-operations')) for (const adapter of registry) {
        let found = false; let value: unknown;
        for (const field of adapter.legacySourceFields) if (own(canonical, field)) { found = true; value = canonical[field]; break; }
        if (!found && own(canonical, adapter.observationMetric)) { found = true; value = canonical[adapter.observationMetric]; }
        if (!found) {
          if (adapter.missingBehavior === 'undefined') output[adapter.outputField] = undefined;
          else if (adapter.missingBehavior === 'null') output[adapter.outputField] = null;
          continue;
        }
        output[adapter.outputField] = adapter.convert(value, canonical);
      }
      const arrayIndex = positive(canonical.arrayIndex ?? canonical.arrayNumber ?? legacyRow.arrayIndex ?? legacyRow.arrayNumber); const stringIndex = positive(canonical.stringIndex ?? canonical.stringNumber ?? legacyRow.stringIndex ?? legacyRow.stringNumber);
      if (arrayIndex && stringIndex) {
        const presentationKey = `A${arrayIndex}-S${stringIndex}`;
        if (!(siteOperationsRepresentation && input.routeVariant === 'site-operations')) {
          if (own(publicShape, 'stringKey')) output.stringKey = publicShape.stringKey;
          if (input.routeVariant === 'local-strings' && own(publicShape, 'location')) output.location = publicShape.location;
          if (input.routeVariant === 'local-strings' && own(publicShape, 'entityToken')) output.entityToken = publicShape.entityToken;
          if (own(publicShape, 'arrayIndex')) output.arrayIndex = arrayIndex; if (own(publicShape, 'arrayNumber')) output.arrayNumber = arrayIndex;
          if (own(publicShape, 'stringIndex')) output.stringIndex = stringIndex; if (own(publicShape, 'stringNumber')) output.stringNumber = stringIndex;
          const publicIpField = input.routeVariant === 'local-strings' ? 'ipAddress' : 'stringControllerIp';
          if (mapping) { output[publicIpField] = mapping.ip; controllerIpSources[presentationKey] = mapping.source; }
          else if (own(output, publicIpField)) controllerIpSources[presentationKey] = 'normalized-source'; else controllerIpSources[presentationKey] = 'unavailable';
        }
        if (graphObject && match?.state.objectId !== graphObject.id) throw new Error(`graph-observation-identity-mismatch:${key}`);
      }
      if (input.routeVariant === 'strings-dashboard') { for (const field of DASHBOARD_COMPATIBILITY_OVERLAY_FIELDS) if (own(publicShape, field)) output[field] = publicShape[field]; for (const field of Object.keys(publicShape)) if (publicShape[field] === undefined && !own(output, field)) output[field] = undefined; }
      // Preserve exact legacy key presence/order while all values originate in the observation reconstruction.
      const ordered: Record<string, unknown> = {}; for (const key of Object.keys(publicShape)) if (own(output, key)) ordered[key] = output[key]; for (const [key, value] of Object.entries(output)) if (!own(ordered, key)) ordered[key] = value;
      return ordered;
    });
    const fieldAdapterDurationMs = performance.now() - fieldStarted; let response: unknown; const root = rootRecord(input.rootTemplate);
    if (input.routeVariant === 'local-strings') { root.data = reconstructed; response = root; }
    else if (input.routeVariant === 'strings-dashboard') { root.strings = reconstructed; response = root; }
    else { const summary = buildStringBucketSummary(reconstructed); const legacyTable = routeRows('site-operations', input.rootTemplate); summary.tableRows = summary.tableRows.map((row: Readonly<Record<string, unknown>>, index: number) => { const legacy = legacyTable[index]; if (!legacy) return row; const compatible = { ...row }; for (const field of ['timestampUtc', 'sourceTimestampUtc', 'lastUpdatedUtc', 'raw']) if (own(legacy, field)) compatible[field] = legacy[field]; return compatible; }); root.stringSummary = summary; response = root; }
    return immutableBindingValue({ response, rows: reconstructed, controllerIpSources, performance: { fieldAdapterDurationMs, reconstructionDurationMs: performance.now() - started, observationLookups, graphLookups, reconstructedRows: reconstructed.length, estimatedTemporaryAllocations: allocations } });
  }
}
