import { ObjectGraph } from './ObjectGraph';
import { createObjectRelationship } from './ObjectRelationships';
import type { ObjectCreationContext, ObjectGraphBuilderInput } from './types';
import { arrayCanonicalKey, batteryPackCanonicalKey, createArrayObject, createBatteryPackObject, createEmsControllerObject, createEnergySegmentObject, createFeatherControllerObject, createPcsObject, createSiteObject, createStringObject, emsCanonicalKey, energySegmentCanonicalKey, featherCanonicalKey, pcsCanonicalKey, siteCanonicalKey, stringCanonicalKey } from './models';

export class ObjectGraphBuilder {
  constructor(private readonly context: ObjectCreationContext = {}) {}

  build(input: ObjectGraphBuilderInput): ObjectGraph { return this.buildWithTimings(input).graph; }

  buildWithTimings(input: ObjectGraphBuilderInput): { graph: ObjectGraph; objectCreationDurationMs: number; relationshipCreationDurationMs: number } {
    const objectStartedAt = performance.now();
    const graph = new ObjectGraph(); const site = createSiteObject(input.site, this.context); const siteId = site.siteIdentifier; graph.registerObject(site);
    for (const value of input.arrays ?? []) graph.registerObject(createArrayObject({ siteId, ...value }, this.context));
    for (const value of input.energySegments ?? []) graph.registerObject(createEnergySegmentObject({ siteId, ...value }, this.context));
    for (const value of input.strings ?? []) graph.registerObject(createStringObject({ siteId, ...value }, this.context));
    for (const value of input.batteryPacks ?? []) graph.registerObject(createBatteryPackObject({ siteId, ...value }, this.context));
    for (const value of input.featherControllers ?? []) graph.registerObject(createFeatherControllerObject({ siteId, ...value }, this.context));
    for (const value of input.pcsControllers ?? []) graph.registerObject(createPcsObject({ siteId, ...value }, this.context));
    if (input.emsController) graph.registerObject(createEmsControllerObject({ siteId, ...input.emsController }, this.context));
    const objectCreationDurationMs = performance.now() - objectStartedAt;

    const relationshipStartedAt = performance.now();
    const relate = (type: 'contains' | 'monitored_by' | 'served_by' | 'controlled_by', sourceId: string, targetId: string) => graph.registerRelationship(createObjectRelationship({ type, sourceId, targetId }, this.context));
    for (const value of input.arrays ?? []) relate('contains', siteCanonicalKey(siteId), arrayCanonicalKey(siteId, value.arrayIndex));
    for (const value of input.energySegments ?? []) relate('contains', arrayCanonicalKey(siteId, value.arrayIndex), energySegmentCanonicalKey(siteId, value.arrayIndex, value.energySegmentIndex));
    for (const value of input.strings ?? []) relate('contains', energySegmentCanonicalKey(siteId, value.arrayIndex, value.energySegmentIndex), stringCanonicalKey(siteId, value.arrayIndex, value.stringIndex));
    for (const value of input.batteryPacks ?? []) relate('contains', stringCanonicalKey(siteId, value.arrayIndex, value.stringIndex), batteryPackCanonicalKey(siteId, value.arrayIndex, value.stringIndex, value.batteryPackIndex));
    for (const value of input.featherControllers ?? []) if (value.arrayIndex != null && value.energySegmentIndex != null) relate('monitored_by', energySegmentCanonicalKey(siteId, value.arrayIndex, value.energySegmentIndex), featherCanonicalKey(siteId, value.deviceIp));
    for (const value of input.pcsControllers ?? []) relate('served_by', arrayCanonicalKey(siteId, value.arrayIndex), pcsCanonicalKey(siteId, value.arrayIndex, value.pcsIndex));
    if (input.emsController) relate('controlled_by', siteCanonicalKey(siteId), emsCanonicalKey(siteId, input.emsController.deviceIp));
    return { graph, objectCreationDurationMs, relationshipCreationDurationMs: performance.now() - relationshipStartedAt };
  }
}
