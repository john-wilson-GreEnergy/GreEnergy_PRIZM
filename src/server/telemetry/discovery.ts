import { ProfileStore } from "../profiles/profileStore";
import { buildEmsBaseUrl } from "../profiles/profileManager";

export interface DiscoveredField {
  endpoint: string;
  path: string;
  key: string;
  valueType: string;
  sampleValue: any;
  numericStats?: {
    count: number;
    min: number;
    max: number;
    average: number;
  };
  unitsGuess?: string;
  confidence: "High" | "Medium" | "Low";
  reason: string;
}

export interface SuggestedMapping {
  title: string;
  fieldPath: string;
  sourceEndpoint: string;
  description: string;
}

const ENDPOINTS = {
  blockviewer: "/tools/monitor/ems/blockviewer/data",
  lastCall: "/tools/report/ems/lastCall.json",
  status: "/tools/report/ems/status.json",
  controllerStatistics: "/tools/report/ems/controllerStatistics.json",
  bessStatusCodes: "/tools/report/ems/bessStatusCodes.json",
  stringsCsv: "/tools/report/ems/strings.csv",
  ipMap: "/tools/report/ems/ipMap.json",
  stringIpMap: "/tools/report/ems/stringIPMap.json",
  firstResponder: "/firstresponder/data",
  firstResponderV2: "/v2/firstresponder/data",
  modbusMap: "/modbus_map.csv"
};

const KEYWORDS = {
  pcs: ["pcs", "inverter", "inv", "powerconversion", "acpower", "reactivepower", "frequency", "voltageab", "voltagebc", "voltageca", "currenta", "currentb", "currentc", "dcvoltage", "dccurrent", "dcpower", "realpower", "activepower", "powerfactor", "grid", "breaker", "contactor"],
  ups: ["ups", "battery", "inputvoltage", "outputvoltage", "loadpercent", "load", "runtime", "charge", "batteryvoltage", "utilitypower", "bypass", "alarm", "fault"],
  arrays: ["array", "arrayindex", "arrayreport", "soc", "soh", "kw", "kvar", "kwh", "voltage", "current", "availableenergy", "storedenergy", "chargelimit", "dischargelimit", "contactor", "ready", "communicating", "warning", "alarm"],
  voltage: ["voltage", "cellvoltage", "cellgroupvoltage", "mincellvoltage", "maxcellvoltage", "avgcellvoltage", "averagecellvoltage", "calculatedstringvoltage", "measuredstringvoltage", "dcbusvoltage", "dcvoltage", "voltagedelta"],
  temperature: ["temp", "temperature", "celltemperature", "cellgrouptemperature", "mincelltemperature", "maxcelltemperature", "avgcelltemperature", "averagecelltemperature", "spacetemperature", "supplyairtemp", "outsidetemperature"],
  strings: ["string", "stringindex", "stringkey", "rack"],
  cellGroups: ["cellgroup", "cellgroupindex", "cg"],
  safety: ["safety", "fault", "trip", "alarm", "smoke", "fire", "leak", "fss"]
};

function matchesAnyKeyword(text: string, categoryKeywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return categoryKeywords.some(kw => lower.includes(kw));
}

interface InternalDiscoveredField extends DiscoveredField {
  category: string;
}

function getNormalizedPath(path: string) {
  return path.replace(/\[\d+\]/g, '[]');
}

function scanJson(
  obj: any,
  currentPath: string,
  endpointKey: string,
  dedupeMap: Map<string, InternalDiscoveredField>,
  options: { depth: number; maxDepth: number; maxArraySamples: number; maxFieldsPerCategory: number }
) {
  if (options.depth > options.maxDepth) return;
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    const limit = Math.min(obj.length, options.maxArraySamples);
    for (let i = 0; i < limit; i++) {
       scanJson(obj[i], `${currentPath}[${i}]`, endpointKey, dedupeMap, { ...options, depth: options.depth + 1 });
    }
    return;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    const value = obj[key];
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    const valType = typeof value;

    if (value !== null && valType === "object") {
      scanJson(value, newPath, endpointKey, dedupeMap, { ...options, depth: options.depth + 1 });
    } else {
      if (typeof value === 'string' && value.length > 500) continue; // safety

      for (const [category, keywords] of Object.entries(KEYWORDS)) {
        if (matchesAnyKeyword(key, keywords) || matchesAnyKeyword(newPath, keywords)) {
          const normPath = getNormalizedPath(newPath);
          const dedupeKey = `${endpointKey}:${category}:${normPath}:${key}`;
          
          if (!dedupeMap.has(dedupeKey)) {
            // Count existing in category
            let count = 0;
            for (const field of dedupeMap.values()) {
              if (field.category === category) count++;
            }
            if (count >= options.maxFieldsPerCategory) continue;

            dedupeMap.set(dedupeKey, {
              endpoint: endpointKey,
              path: newPath, // first concrete path found
              key,
              valueType: valType,
              sampleValue: value,
              confidence: "Medium",
              reason: `Matches ${category} keywords`,
              category
            });
          }
        }
      }
    }
  }
}

function parseCsvAndScan(csvText: string, endpointKey: string, dedupeMap: Map<string, InternalDiscoveredField>) {
  const lines = csvText.split("\\n").filter(l => l.trim().length > 0);
  if (lines.length === 0) return;

  const headers = lines[0].split(",").map(h => h.trim());
  const dataRows = lines.slice(1).map(l => l.split(",").map(v => v.trim()));

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const vals = dataRows.map(row => Number(row[i])).filter(n => !isNaN(n));
    
    let stats;
    if (vals.length > 0) {
      stats = {
        count: vals.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
        average: vals.reduce((a, b) => a + b, 0) / vals.length
      };
    }

    for (const [category, keywords] of Object.entries(KEYWORDS)) {
      if (matchesAnyKeyword(header, keywords)) {
        const dedupeKey = `${endpointKey}:${category}:${header}:${header}`;
        if (!dedupeMap.has(dedupeKey)) {
          dedupeMap.set(dedupeKey, {
            endpoint: endpointKey,
            path: header,
            key: header,
            valueType: stats ? "number" : "string",
            sampleValue: dataRows.length > 0 ? dataRows[0][i] : null,
            numericStats: stats,
            confidence: "High",
            reason: `CSV Header matches ${category} keywords`,
            category
          });
        }
      }
    }
  }
}

const rankVoltage = (fields: DiscoveredField[]) => {
    for (const f of fields) {
        if (f.endpoint === 'lastCall' && f.path.toLowerCase().includes('cellgroup') && f.path.toLowerCase().includes('voltage')) {
           return { ...f, description: "lastCall.json cell-group voltage fields (Highest priority)" };
        }
    }
    for (const f of fields) {
        if (f.endpoint === 'stringsCsv' && (f.path.toLowerCase().includes('avgcellgroupvoltage') || f.path.toLowerCase().includes('mincellgroupvoltage') || f.path.toLowerCase().includes('maxcellgroupvoltage'))) {
           return { ...f, description: "strings.csv Avg/Min/Max cell group voltage fields" };
        }
    }
    for (const f of fields) {
        if (f.endpoint === 'stringsCsv' && (f.path.toLowerCase().includes('measuredstringvoltage') || f.path.toLowerCase().includes('calculatedstringvoltage'))) {
           return { ...f, description: "strings.csv measured/calculated string voltage fields" };
        }
    }
    for (const f of fields) {
        if (f.endpoint === 'blockviewer' && f.path.toLowerCase().includes('voltage')) {
           return { ...f, description: "blockviewer voltage fields" };
        }
    }
    return { ...fields[0], description: "Fallback voltage match" };
};

const rankTemperature = (fields: DiscoveredField[]) => {
    for (const f of fields) {
        if (f.endpoint === 'lastCall' && f.path.toLowerCase().includes('cellgroup') && f.path.toLowerCase().includes('temperature')) {
           return { ...f, description: "lastCall.json cell-group temperature fields (Highest priority)" };
        }
    }
    for (const f of fields) {
         if (f.endpoint === 'stringsCsv' && (f.path.toLowerCase().includes('avgcellgrouptemperature') || f.path.toLowerCase().includes('mincellgrouptemperature') || f.path.toLowerCase().includes('maxcellgrouptemperature'))) {
           return { ...f, description: "strings.csv Avg/Min/Max cell group temperature fields" };
        }
    }
    for (const f of fields) {
        if (f.endpoint === 'directFeather' && (f.path.toLowerCase().includes('avgcell') || f.path.toLowerCase().includes('space') || f.path.toLowerCase().includes('supplyair'))) {
           return { ...f, description: "direct Feather avg cell / space / supply air temperature fields" };
        }
    }
    for (const f of fields) {
        if (f.endpoint === 'blockviewer' && f.path.toLowerCase().includes('temperature')) {
           return { ...f, description: "blockviewer temperature fields" };
        }
    }
    return { ...fields[0], description: "Fallback temperature match" };
};

const rankPcs = (fields: DiscoveredField[]) => {
    for (const f of fields) {
         if (f.endpoint === 'blockviewer') return { ...f, description: "blockviewer PCS/inverter structured objects" };
    }
    for (const f of fields) {
         if (f.endpoint === 'lastCall') return { ...f, description: "lastCall PCS/inverter structured objects" };
    }
    for (const f of fields) {
         if (f.endpoint === 'modbusMap') return { ...f, description: "modbus_map PCS/inverter register definitions" };
    }
    return { ...fields[0], description: "Fallback PCS match" };
};

const rankUps = (fields: DiscoveredField[]) => {
    for (const f of fields) {
         if (f.endpoint === 'blockviewer') return { ...f, description: "blockviewer UPS structured objects" };
    }
    for (const f of fields) {
         if (f.endpoint === 'firstResponder' || f.endpoint === 'firstResponderV2') return { ...f, description: "firstResponder UPS fields" };
    }
    for (const f of fields) {
         if (f.endpoint === 'lastCall') return { ...f, description: "lastCall UPS fields" };
    }
    for (const f of fields) {
         if (f.endpoint === 'modbusMap') return { ...f, description: "modbus_map UPS register definitions" };
    }
    return { ...fields[0], description: "Fallback UPS match" };
};

const rankArray = (fields: DiscoveredField[]) => {
    for (const f of fields) {
         if (f.endpoint === 'blockviewer') return { ...f, description: "blockviewer arrays" };
    }
    for (const f of fields) {
         if (f.endpoint === 'lastCall') return { ...f, description: "lastCall arrayReport" };
    }
    for (const f of fields) {
         if (f.endpoint === 'stringsCsv') return { ...f, description: "strings.csv grouped by ArrayIndex" };
    }
    return { ...fields[0], description: "Fallback Array match" };
};

export async function executeDataDiscovery() {
  const profile = ProfileStore.getActiveProfile();
  if (!profile) {
    throw new Error("No active profile configured");
  }

  const baseUrl = buildEmsBaseUrl(profile);
  const results: any = {
    profileId: profile.id,
    emsBaseUrl: baseUrl,
    generatedAt: new Date().toISOString(),
    endpoints: {},
    discovered: {
      pcs: [],
      ups: [],
      arrays: [],
      voltage: [],
      temperature: [],
      strings: [],
      cellGroups: [],
      safety: []
    },
    suggestedMappings: {
      pcs: [],
      ups: [],
      arraySummary: [],
      voltageDistribution: [],
      temperatureDistribution: []
    },
    samples: {
      pcs: [],
      ups: [],
      arrays: [],
      voltage: [],
      temperature: []
    }
  };

  const scannerConfig = { maxDepth: 20, maxArraySamples: 25, maxFieldsPerCategory: 500 };
  const dedupeMap = new Map<string, InternalDiscoveredField>();

  const fetches = Object.entries(ENDPOINTS).map(async ([key, path]) => {
    const url = `${baseUrl}${path}`;
    const start = Date.now();
    try {
      const resp = await fetch(url);
      const isJson = resp.headers.get("content-type")?.includes("json") || path.endsWith(".json") || path === "/tools/monitor/ems/blockviewer/data" || path.includes("/data");
      const isCsv = path.endsWith(".csv");
      
      let payload;
      let topLevelKeys: string[] = [];

      if (!resp.ok) {
        results.endpoints[key] = {
           url, ok: false, httpStatus: resp.status, durationMs: Date.now() - start
        };
        return;
      }

      if (isJson) {
        payload = await resp.json().catch(() => null);
        if (payload && typeof payload === "object") {
          topLevelKeys = Object.keys(payload);
          scanJson(payload, "", key, dedupeMap, { ...scannerConfig, depth: 0 });
        }
      } else if (isCsv) {
        const textStr = await resp.text();
        parseCsvAndScan(textStr, key, dedupeMap);
        const headers = textStr.split("\\n")[0]?.split(",") || [];
        topLevelKeys = headers;
        payload = "CSV_DATA";
      }

      results.endpoints[key] = {
        url,
        ok: true,
        httpStatus: resp.status,
        durationMs: Date.now() - start,
        payloadType: isJson ? "JSON" : isCsv ? "CSV" : "Unknown",
        topLevelKeys
      };
    } catch (e: any) {
      results.endpoints[key] = {
        url,
        ok: false,
        error: e.message,
        durationMs: Date.now() - start
      };
    }
  });

  await Promise.allSettled(fetches);

  for (const field of dedupeMap.values()) {
    delete (field as any).category; // clean up for response
    results.discovered[(field as InternalDiscoveredField).category || "pcs"].push(field); // Actually we need category
    // wait, we can't delete it before pushing since we need it... ah.
  }
  
  // Re-map to correct lists based on keys in result.discovered
  for (const key of Object.keys(results.discovered)) {
      results.discovered[key] = Array.from(dedupeMap.values()).filter(f => f.category === key).map(f => {
          const { category, ...rest } = f as any;
          return rest;
      });
  }

  results.discoveredSummary = {
     pcs: results.discovered.pcs.length,
     ups: results.discovered.ups.length,
     arrays: results.discovered.arrays.length,
     voltage: results.discovered.voltage.length,
     temperature: results.discovered.temperature.length,
     strings: results.discovered.strings.length,
     cellGroups: results.discovered.cellGroups.length,
     safety: results.discovered.safety.length
  };
  results.scannerConfig = scannerConfig;

  // Suggested mappings
  if (results.discovered.pcs.length > 0) {
    const best = rankPcs(results.discovered.pcs);
    results.suggestedMappings.pcs.push({
      title: "PCS Telemetry",
      fieldPath: best.path,
      sourceEndpoint: best.endpoint,
      description: (best as any).description || best.reason || "Fallback PCS match"
    });
  }

  if (results.discovered.ups.length > 0) {
    const best = rankUps(results.discovered.ups);
    results.suggestedMappings.ups.push({
        title: "UPS Overview",
        fieldPath: best.path,
        sourceEndpoint: best.endpoint,
        description: (best as any).description || best.reason || "Fallback UPS match"
    });
  }

  if (results.discovered.voltage.length > 0) {
      const best = rankVoltage(results.discovered.voltage);
      results.suggestedMappings.voltageDistribution.push({
          title: "Cell/String Voltage Distribution",
          fieldPath: best.path,
          sourceEndpoint: best.endpoint,
          description: (best as any).description || best.reason || "Fallback voltage match"
      });
  }

  if (results.discovered.temperature.length > 0) {
      const best = rankTemperature(results.discovered.temperature);
      results.suggestedMappings.temperatureDistribution.push({
          title: "Cell/String Temperature Distribution",
          fieldPath: best.path,
          sourceEndpoint: best.endpoint,
          description: (best as any).description || best.reason || "Fallback temperature match"
      });
  }
  
  if (results.discovered.arrays.length > 0) {
      const best = rankArray(results.discovered.arrays);
      results.suggestedMappings.arraySummary.push({
          title: "Array Data Summary",
          fieldPath: best.path,
          sourceEndpoint: best.endpoint,
          description: (best as any).description || best.reason || "Fallback Array match"
      });
  }

  return results;
}

