import {
  getEmsCachedBlock,
  getEmsCachedStatus,
  getEmsCachedLastCall,
  getEmsCachedRawStrings,
  getEmsIpMap,
  getEmsStringIpMap,
  getEmsCachedModbusMap,
  getEmsConnectionStatus
} from "../emsTurtleClient";
import { getFeatherCache } from "../feather/featherClient";
import { parseTurtleJsonOrLabeledSections, parseCsvQuotesAware } from "./turtleParsers";
import { writeSiteArtifact, getActiveSiteCacheKey } from "../cache/prizmCache";

export type PrizmArrayTopology = {
  arrayIndex: number;
  arrayKey?: string | null;
  displayKey?: string | null;
  stringCount: number | null;
  pcsCount: number | null;
  acBatteryIndex?: number | null;
  sourcePath: string;
  raw?: any;
};

export type PrizmStringTopology = {
  arrayIndex: number;
  stringIndex: number;
  stringKey?: string | null;
  enclosureIndex?: number | null;
  enclosureLocation?: string | null;
  displayKey: string;
  ipAddress?: string | null;
  stackType?: string | null;
  sourcePath: string;
  raw?: any;
};

export type PrizmPcsTopology = {
  arrayIndex: number | null;
  pcsIndex: number | null;
  displayKey?: string | null;
  ipAddress?: string | null;
  sourcePath: string;
  raw?: any;
};

export type PrizmFeatherTopology = {
  ipAddress: string;
  arrayIndex?: number | null;
  stringIndex?: number | null;
  segmentLabel?: string | null;
  entityDescription?: string | null;
  enclosureLabel?: string | null;
  sourcePath: string;
  raw?: any;
};

export type PrizmIpMapEntry = {
  ipAddress: string;
  arrayIndex?: number | null;
  stringIndex?: number | null;
  entityType?: string | null;
  entityDescription?: string | null;
  displayKey?: string | null;
  sourcePath: string;
  raw?: any;
};

export type PrizmStringIpMapEntry = {
  arrayIndex?: number | null;
  stringIndex?: number | null;
  stringKey?: string | null;
  ipAddress?: string | null;
  sourcePath: string;
  raw?: any;
};

export type PrizmModbusPoint = {
  name: string;
  section?: string | null;
  register?: number | null;
  address?: number | null;
  fieldSize?: number | null;
  fieldType?: string | null;
  type?: string | null;
  units?: string | null;
  rw?: "RO" | "RW" | "UNKNOWN";
  scaleFactor?: string | number | null;
  serverId?: string | null;
  mandatory?: boolean | null;
  value?: string | number | null;
  description?: string | null;
  raw?: any;
};

export type PrizmSiteTopology = {
  siteIdentity: {
    stationCode: string | null;
    blockIndex: number | null;
    blockKey: string | null;
    emsBaseUrl: string;
    discoveredAt: string;
    sourcePriority: string[];
  };
  counts: {
    arrayCount: number;
    stringCount: number;
    pcsCount: number;
    acBatteryCount: number;
    featherDeviceCount: number;
    modbusPointCount: number;
  };
  arrays: PrizmArrayTopology[];
  strings: PrizmStringTopology[];
  pcses: PrizmPcsTopology[];
  acBatteries: any[];
  featherDevices: PrizmFeatherTopology[];
  ipMap: PrizmIpMapEntry[];
  stringIpMap: PrizmStringIpMapEntry[];
  modbusMap: PrizmModbusPoint[];
  sourceHealth: {
    blockviewer: boolean;
    stringsCsv: boolean;
    ipMap: boolean;
    stringIpMap: boolean;
    lastCall: boolean;
    modbusMap: boolean;
    feather: boolean;
  };
  cacheMeta: {
    siteCacheKey: string;
    topologyVersion: number;
    lastBuiltAt: string;
    sourceFiles: string[];
  };
};

export function sortIpAddressesNumerically(a: string, b: string): number {
  if (!a || !b) return 0;
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    const pA = aParts[i] || 0;
    const pB = bParts[i] || 0;
    if (pA !== pB) return pA - pB;
  }
  return 0;
}

export function buildSiteTopologyFromCachedSources(): PrizmSiteTopology {
  const blockData = getEmsCachedBlock().data || {};
  const statusData = getEmsCachedStatus().data || {};
  const lastCallData = getEmsCachedLastCall().data || {};
  const rawStrings = getEmsCachedRawStrings().data || [];
  const ipMapRaw = getEmsIpMap();
  const stringIpMapRaw = getEmsStringIpMap();
  const featherCache = getFeatherCache();
  const modbusMapRaw = getEmsCachedModbusMap().data;
  const connectionStatus = getEmsConnectionStatus();

  // Part C - Strings & Arrays
  const stringMap = new Map<string, PrizmStringTopology>();
  const discoveredArrayIndices = new Set<number>();

  for (const row of rawStrings) {
    const arrayIndexMatches = row.ArrayIndex ?? row.arrayIndex ?? row.arrayNumber ?? row.array ?? row.StringArrayIndex;
    const stringIndexMatches = row.StringIndex ?? row.stringIndex ?? row.stringNumber ?? row.string;
    
    if (arrayIndexMatches == null || stringIndexMatches == null) continue;
    
    const arrayIndex = Number(arrayIndexMatches);
    const stringIndex = Number(stringIndexMatches);
    
    if (isNaN(arrayIndex) || isNaN(stringIndex)) continue;

    discoveredArrayIndices.add(arrayIndex);

    const stringKey = row.StringKey ?? row.stringKey ?? row.displayKey ?? `Array ${arrayIndex} String ${stringIndex}`;
    
    const uniqueKey = `${arrayIndex}:${stringIndex}`;
    stringMap.set(uniqueKey, {
      arrayIndex,
      stringIndex,
      stringKey,
      displayKey: stringKey,
      sourcePath: 'strings.csv',
      raw: row
    });
  }

  const strings = Array.from(stringMap.values());
  strings.sort((a, b) => {
    if (a.arrayIndex !== b.arrayIndex) return a.arrayIndex - b.arrayIndex;
    return a.stringIndex - b.stringIndex;
  });

  // Array Topology
  const arrayMap = new Map<number, PrizmArrayTopology>();
  for (const ai of discoveredArrayIndices) {
    arrayMap.set(ai, {
      arrayIndex: ai,
      stringCount: 0,
      pcsCount: 0,
      sourcePath: 'discovered_strings',
    });
  }

  strings.forEach(s => {
    const arr = arrayMap.get(s.arrayIndex);
    if (arr) arr.stringCount = (arr.stringCount || 0) + 1;
  });

  const blockviewerArrays = blockData.arrays || lastCallData.blockReport?.arrayReport || statusData.arrays || [];
  for (const ba of blockviewerArrays) {
    const ai = ba.arrayIndex ?? ba.arrayNumber;
    if (ai != null) {
      if (!arrayMap.has(ai)) {
        arrayMap.set(ai, {
          arrayIndex: ai,
          stringCount: ba.stringCount ?? 0,
          pcsCount: ba.pcses?.length ?? ba.arrayPcsReport?.length ?? 0,
          sourcePath: 'blockviewer'
        });
      } else {
        const arr = arrayMap.get(ai)!;
        if (ba.stringCount != null && arr.stringCount === 0) {
          arr.stringCount = ba.stringCount;
        }
        if (ba.pcses || ba.arrayPcsReport) {
            arr.pcsCount = ba.pcses?.length ?? ba.arrayPcsReport?.length ?? 0;
        }
      }
    }
  }

  const arrays = Array.from(arrayMap.values()).sort((a, b) => a.arrayIndex - b.arrayIndex);

  // Part D - PCS Inventory
  const pcsMap = new Map<string, PrizmPcsTopology>();
  for (const ba of blockviewerArrays) {
    const ai = ba.arrayIndex ?? ba.arrayNumber;
    const pcsList = ba.pcses || ba.arrayPcsReport || [];
    for (const p of pcsList) {
      const pi = p.arrayPcsIndex ?? p.pcsIndex ?? p.index;
      if (ai == null || pi == null) continue;
      const key = `${ai}:${pi}`;
      pcsMap.set(key, {
        arrayIndex: ai,
        pcsIndex: pi,
        displayKey: p.displayKey ?? `Array ${ai} PCS ${pi}`,
        sourcePath: 'blockviewer',
        raw: p
      });
    }
  }
  const pcses = Array.from(pcsMap.values()).sort((a, b) => {
    if (a.arrayIndex !== b.arrayIndex) return (a.arrayIndex ?? 0) - (b.arrayIndex ?? 0);
    return (a.pcsIndex ?? 0) - (b.pcsIndex ?? 0);
  });

  // Part E - Feather
  const featherMap = new Map<string, PrizmFeatherTopology>();
  for (const row of ((featherCache.devices || []) as any[])) {
    const d = row;
    const ip = d.ip ?? d.deviceIp;
    if (!ip) continue;
    featherMap.set(ip, {
      ipAddress: ip,
      arrayIndex: d.arrayIndex,
      segmentLabel: d.segmentLabel,
      entityDescription: d.entityDescription,
      enclosureLabel: d.entityDescription ?? d.segmentLabel ?? `Feather ${ip}`,
      sourcePath: 'featherCache.devices',
      raw: d
    });
  }
  const featherDevices = Array.from(featherMap.values()).sort((a, b) => sortIpAddressesNumerically(a.ipAddress, b.ipAddress));

  // Part F - IP Map
  const ipMapParsed = parseTurtleJsonOrLabeledSections(ipMapRaw?.data || "");
  const stringIpMapParsed = parseTurtleJsonOrLabeledSections(stringIpMapRaw?.data || "");

  const ipMap: PrizmIpMapEntry[] = ipMapParsed.flattened.map(v => ({
    ipAddress: v.ipAddress ?? v.ip,
    arrayIndex: v.arrayIndex ?? v.array,
    stringIndex: v.stringIndex ?? v.string,
    entityType: v.entityType ?? v.type,
    entityDescription: v.entityDescription ?? v.description,
    displayKey: v.displayKey ?? v.name,
    sourcePath: 'ipMap',
    raw: v
  })).filter(v => !!v.ipAddress).sort((a, b) => sortIpAddressesNumerically(a.ipAddress, b.ipAddress));

  const stringIpMap: PrizmStringIpMapEntry[] = stringIpMapParsed.flattened.map(v => ({
    arrayIndex: v.arrayIndex ?? v.array,
    stringIndex: v.stringIndex ?? v.string,
    stringKey: v.stringKey ?? v.key,
    ipAddress: v.ipAddress ?? v.ip,
    sourcePath: 'stringIpMap',
    raw: v
  })).filter(v => !!v.ipAddress).sort((a, b) => sortIpAddressesNumerically(a.ipAddress!, b.ipAddress!));

  // Part G - Modbus map
  const modbusMap: PrizmModbusPoint[] = [];
  let modbusOk = false;
  if (modbusMapRaw && typeof modbusMapRaw === 'string') {
    modbusOk = true;
    const lines = parseCsvQuotesAware(modbusMapRaw);
    if (lines.length > 1) {
       const headers = lines[0];
       for (let i = 1; i < lines.length; i++) {
         const fields = lines[i];
         if (fields.length < 3) continue;
         const row: any = {};
         headers.forEach((h, idx) => {
             // Handle quotes removed already, no need to trim quotes again
             row[h] = fields[idx] || "";
         });
         modbusMap.push({
           name: row.FIELDNAME,
           register: Number(row.MODBUSADDRESS),
           address: Number(row.MODBUSADDRESS),
           fieldSize: Number(row.FIELDSIZE),
           fieldType: row.FIELDTYPE,
           type: row.TYPE,
           rw: row['R/W'] as any,
           scaleFactor: row.SF,
           serverId: row.SERVERID,
           value: row.VALUE,
           mandatory: row.MANDATORY === 'true' || row.MANDATORY === 'TRUE',
           raw: row
         });
       }
    }
  }
  modbusMap.sort((a, b) => (a.register ?? 0) - (b.register ?? 0));

  const topology: PrizmSiteTopology = {
    siteIdentity: {
      stationCode: connectionStatus.discoveredStationCode || connectionStatus.stationCode,
      blockIndex: connectionStatus.blockIndex,
      blockKey: `${connectionStatus.discoveredStationCode || connectionStatus.stationCode}-${connectionStatus.blockIndex}`,
      emsBaseUrl: connectionStatus.activeEmsBaseUrl,
      discoveredAt: new Date().toISOString(),
      sourcePriority: ['strings.csv', 'blockviewer', 'lastCall', 'status']
    },
    counts: {
      arrayCount: arrays.length,
      stringCount: strings.length,
      pcsCount: pcses.length,
      acBatteryCount: 0,
      featherDeviceCount: featherDevices.length,
      modbusPointCount: modbusMap.length
    },
    arrays,
    strings,
    pcses,
    acBatteries: [],
    featherDevices,
    ipMap,
    stringIpMap,
    modbusMap,
    sourceHealth: {
      blockviewer: !!blockviewerArrays.length,
      stringsCsv: rawStrings.length > 0,
      ipMap: ipMapParsed.kind !== 'empty' && ipMapParsed.kind !== 'text',
      stringIpMap: stringIpMapParsed.kind !== 'empty' && stringIpMapParsed.kind !== 'text',
      lastCall: Object.keys(lastCallData).length > 0,
      modbusMap: modbusOk,
      feather: featherDevices.length > 0
    },
    cacheMeta: {
      siteCacheKey: getActiveSiteCacheKey(),
      topologyVersion: 1,
      lastBuiltAt: new Date().toISOString(),
      sourceFiles: ['strings.csv', 'status.json', 'blockviewer/data', 'lastCall.json', 'ipMap.json', 'stringIPMap.json', 'feather']
    }
  };

  try {
     writeSiteArtifact('site-topology.json', topology);
  } catch(e) {}

  return topology;
}
