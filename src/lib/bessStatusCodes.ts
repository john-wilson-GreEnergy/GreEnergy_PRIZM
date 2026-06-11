export const BESS_STATUS_CODE_MAP: Record<string, string> = {
  "2534": "Contactors Open Warning",
  "2561": "String OOR Warning",
  "1004": "CellGroup Low Voltage Alarm",
  "1006": "String Low Voltage Alarm",
  "1014": "Cell Group Low Temp Alarm",
  "1020": "String High Discharge Rate Alarm",
  "1022": "Measured vs Calculated Mismatch Alarm",
  "1023": "CGC Disconnect Alarm",
  "1024": "BPC Disconnect Alarm",
  "1032": "DC Bus Calculated Mismatch Alarm",
  "1071": "String High Discharge Rate Alarm",
  "2004": "CellGroup Low Voltage Warning",
  "2006": "String Low Voltage Warning",
  "2007": "CellGroup Voltage Delta Warning",
  "2008": "BatteryPack Voltage Delta Warning",
  "2014": "CellGroup Low Temp Warning",
  "2018": "CellGroup Temp Delta Warning",
  "2020": "String High Discharge Rate Warning",
  "2022": "Measured vs Calculated Mismatch Warning",
  "2023": "CGC Disconnect Warning",
  "2024": "BPC Disconnect Warning",
  "2032": "DC Bus Calculated Voltage Mismatch Warning",
  "2071": "String High Discharge Rate Warning",
  "2073": "CellGroup Discharge Balancer Warning",
  "2074": "CellGroup Charge Balancer Warning",
  "2921": "Cell Temp Loss Warning"
};

export function describeBessStatusCode(code: unknown): string {
  const key = String(code ?? "").trim();
  if (!key) return "";
  return BESS_STATUS_CODE_MAP[key] || `Code ${key}`;
}

export function classifyBessStatusCode(code: unknown): "ALARM" | "WARNING" | "INFO" {
  const n = Number(code);
  if (!Number.isFinite(n)) return "INFO";
  if (n >= 1000 && n < 2000) return "ALARM";
  if (n >= 2000 && n < 3000) return "WARNING";
  return "INFO";
}
