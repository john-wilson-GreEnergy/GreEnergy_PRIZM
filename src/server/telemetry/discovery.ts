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

function scanJson(obj: any, currentPath: string, endpointKey: string, discovered: Record<string, DiscoveredField[]>) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      scanJson(obj[0], `${currentPath}[0]`, endpointKey, discovered);
    }
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    const valType = typeof value;

    if (value !== null && valType === "object") {
      scanJson(value, newPath, endpointKey, discovered);
    } else {
      for (const [category, keywords] of Object.entries(KEYWORDS)) {
        if (matchesAnyKeyword(key, keywords) || matchesAnyKeyword(newPath, keywords)) {
          const field: DiscoveredField = {
            endpoint: endpointKey,
            path: newPath,
            key,
            valueType: valType,
            sampleValue: value,
            confidence: "Medium",
            reason: `Matches ${category} keywords`
          };
          if (!discovered[category]) discovered[category] = [];
          if (!discovered[category].some(d => d.path === newPath)) {
            discovered[category].push(field);
          }
        }
      }
    }
  }
}

function parseCsvAndScan(csvText: string, endpointKey: string, discovered: Record<string, DiscoveredField[]>) {
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
        const field: DiscoveredField = {
          endpoint: endpointKey,
          path: header,
          key: header,
          valueType: stats ? "number" : "string",
          sampleValue: dataRows.length > 0 ? dataRows[0][i] : null,
          numericStats: stats,
          confidence: "High",
          reason: `CSV Header matches ${category} keywords`
        };
        if (!discovered[category]) discovered[category] = [];
        if (!discovered[category].some(d => d.path === header)) {
          discovered[category].push(field);
        }
      }
    }
  }
}

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
          scanJson(payload, "", key, results.discovered);
        }
      } else if (isCsv) {
        const textStr = await resp.text();
        parseCsvAndScan(textStr, key, results.discovered);
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

  // Suggested mappings
  if (results.discovered.pcs.length > 0) {
    results.suggestedMappings.pcs.push({
      title: "PCS Telemetry",
      fieldPath: results.discovered.pcs[0].path,
      sourceEndpoint: results.discovered.pcs[0].endpoint,
      description: "Based on found PCS fields"
    });
  }

  if (results.discovered.ups.length > 0) {
    results.suggestedMappings.ups.push({
        title: "UPS Overview",
        fieldPath: results.discovered.ups[0].path,
        sourceEndpoint: results.discovered.ups[0].endpoint,
        description: "Likely UPS telemetry root"
    });
  }

  if (results.discovered.voltage.length > 0) {
      results.suggestedMappings.voltageDistribution.push({
          title: "Cell/String Voltage Distribution",
          fieldPath: results.discovered.voltage[0].path,
          sourceEndpoint: results.discovered.voltage[0].endpoint,
          description: "Found voltage distribution data points"
      });
  }

  if (results.discovered.temperature.length > 0) {
      results.suggestedMappings.temperatureDistribution.push({
          title: "Cell/String Temperature Distribution",
          fieldPath: results.discovered.temperature[0].path,
          sourceEndpoint: results.discovered.temperature[0].endpoint,
          description: "Found temperature distribution data points"
      });
  }
  
  if (results.discovered.arrays.length > 0) {
      results.suggestedMappings.arraySummary.push({
          title: "Array Data Summary",
          fieldPath: results.discovered.arrays[0].path,
          sourceEndpoint: results.discovered.arrays[0].endpoint,
          description: "Found array data"
      });
  }

  return results;
}

