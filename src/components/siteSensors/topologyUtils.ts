export interface TopologySensorPoint {
  stationCode: string | null;
  blockIndex: number | null;
  sourceEndpoint: string;
  sourcePath: string;
  entityKey: string;
  entityType: string;
  entitySubType: string | null;
  numericId: number | null;
  enclosureIndex: number | null;
  sensorCode: number | null;
  arrayIndex: number | null;
  segmentKind: "CS" | "ES" | "GLOBAL" | "UNKNOWN";
  segmentNumber: number | null;
  displayName: string;
  pointRole: string;
  pointLabel: string;
  statusMessage: string | null;
  communicating: boolean | null;
  enabled: boolean | null;
  ready: boolean | null;
  pointAvailable: boolean;
  availabilityStatus: "Available" | "Offline" | "Disabled" | "Not Ready" | "Unknown";
  activeState: boolean | null;
  activeStateSource: string | null;
  rawValue: unknown;
  pointHealthy: boolean;
  severity: "OK" | "Warning" | "Critical";
  allowFaultReset: boolean | null;
  valueFieldUsed?: string | null;
  labelFromStatusMessage?: string | null;
  raw?: unknown;
}

export interface NormalizedSensorCell {
  applicable: boolean;
  healthy: boolean;
  tripped: boolean | null;
  latched?: boolean;
  value: any;
  status: string;
  displayValue: string;
  friendlyName?: string;
  sensorRole: string;

  rawPresent?: boolean;
  rawState?: string;
  rawTripped?: boolean | null;
  rawHealthy?: boolean;
  monitoredByProfile?: boolean;
  visibleInDefaultView?: boolean;
  contributesToHealth?: boolean;
  displayState?: "normal" | "open" | "alarm" | "fault" | "warning" | "unavailable" | "not-monitored" | "unknown";
  healthState?: string;
  reason?: string;
  capability?: string;
}

export interface BlockSensorMatrixRow {
  id: string;
  location: {
    enclosureIndex: number | null;
    enclosureType: "CollectionSegment" | "EnergySegment";
    segmentPosition: number | null;
    segmentType: "CollectionSegment" | "EnergySegment";
    lineupId: number | null;
    lineupIndex: number | null;
    siteConnected: boolean;
    segmentCommunicating: boolean;
    displayName: string;
  };
  rowHealthy: boolean;
  actionHealthy?: boolean;
  severity: "OK" | "Warning" | "Critical";
  findings: string[];
  rawActionHealthy?: boolean;
  rawRowHealthy?: boolean;
  rawSeverity?: "OK" | "Warning" | "Critical";
  rawFindings?: string[];
  topology: any;
  emergencySensors: {
    moisture: NormalizedSensorCell;
  };
  comStatus: {
    io: NormalizedSensorCell;
    dataCommunications: NormalizedSensorCell;
  };
  doorSensors: {
    acDoors: NormalizedSensorCell;
    dcDoors: NormalizedSensorCell;
    topCapDoors: NormalizedSensorCell;
    batteryDoors: NormalizedSensorCell;
  };
  otherSensors: {
    modbusEStop: NormalizedSensorCell;
    manualVentilation: NormalizedSensorCell;
    envControllerVent: NormalizedSensorCell;
    envControllerLostComms: NormalizedSensorCell;
    upsAlarm: NormalizedSensorCell;
    smoke: NormalizedSensorCell;
    heat: NormalizedSensorCell;
    fire: NormalizedSensorCell;
    fireTrouble: NormalizedSensorCell;
    hydrogen: NormalizedSensorCell;
    hydrogenFault: NormalizedSensorCell;
  };
  thermal: {
    avgCellTemp: number | null;
    maxTemp: number | null;
    minTemp: number | null;
    humidity: number | null;
    ambientTemp: number | null;
    ambientHumidity: number | null;
  } | null;
  unknownSensors: NormalizedSensorCell[];
  raw?: any;
}

export interface TopologySensorSummary {
  success: boolean;
  timestamp: string;
  source: string;
  parserMode: string;
  stationCode: string | null;
  blockIndex: number | null;
  endpoint: string;
  topologyEntityCount: number;
  sensorEntityCount: number;
  openClosedDetectorCount: number;
  humidityTemperatureSensorCount: number;
  pcsEntityCount: number;
  upsOrEStopCount: number;
  groupedEnclosureCount: number;
  activePointCount: number;
  unavailablePointCount: number;
  unknownPointCount: number;
  points: TopologySensorPoint[];
  rows: BlockSensorMatrixRow[];
  debug?: {
    numericIdParseFailedCount?: number;
    globalPointCount?: number;
    sampleGlobalPoints?: Array<{
      entityKey: string | null;
      displayKey: string | null;
      numericId: number | null;
      entityType: string | null;
      entitySubType: string | null;
      pointRole: string;
      displayName: string;
    }>;
    sampleParsedNumericIds?: unknown[];
    sampleNumericIdFailures?: unknown[];
    booleanStateFieldsDiscovered?: string[];
    parserWarnings?: string[];
  };
}

// SECTION 7 - Filter helpers & family mapping helpers
export function getPointFamily(point: TopologySensorPoint): string {
  const role = point.pointRole || "";
  const key = point.entityKey || "";
  
  if (point.segmentKind === "GLOBAL" || role === "blockReadiness" || role === "globalTopologyPoint") {
    return "Global";
  }

  // Communications / IO
  if (
    ["io", "dataCommunications", "dataUnavailable", "envControllerLostComms"].includes(role) ||
    key.toLowerCase().includes("comm") || 
    key.toLowerCase().includes("modbus")
  ) {
    return "Communications / IO";
  }

  // Doors
  if (["acDoors", "dcDoors", "topCapDoors", "topCapDoor", "batteryDoors"].includes(role)) {
    return "Doors";
  }

  // Smoke
  if (role === "smoke") {
    return "Smoke";
  }

  // Heat
  if (role === "heat") {
    return "Heat";
  }

  // Hydrogen
  if (["hydrogen", "hydrogenFault"].includes(role)) {
    return "Hydrogen";
  }

  // Fire
  if (["fire", "fireTrouble"].includes(role)) {
    return "Fire";
  }

  // Moisture
  if (role === "moisture") {
    return "Moisture";
  }

  // UPS / E-stop
  if (["upsAlarm", "modbusEStop"].includes(role)) {
    return "UPS / E-stop";
  }

  // Environment
  if (
    ["internalEnvironment", "externalEnvironment", "environment", "tempHumidity"].includes(role) ||
    point.entityType === "humidityTemperatureSensor"
  ) {
    return "Environment";
  }

  return "Uncategorized";
}

export function getRowFamilies(row: BlockSensorMatrixRow): string[] {
  const families: string[] = [];
  
  if (row.comStatus.dataCommunications.applicable || row.comStatus.io.applicable || row.otherSensors.envControllerLostComms.applicable) {
    families.push("Communications / IO");
  }
  if (
    row.doorSensors.acDoors.applicable ||
    row.doorSensors.dcDoors.applicable ||
    row.doorSensors.topCapDoors.applicable ||
    row.doorSensors.batteryDoors.applicable
  ) {
    families.push("Doors");
  }
  if (row.otherSensors.smoke.applicable) {
    families.push("Smoke");
  }
  if (row.otherSensors.heat.applicable) {
    families.push("Heat");
  }
  if (row.otherSensors.hydrogen.applicable || row.otherSensors.hydrogenFault.applicable) {
    families.push("Hydrogen");
  }
  if (row.otherSensors.fire.applicable || row.otherSensors.fireTrouble.applicable) {
    families.push("Fire");
  }
  if (row.emergencySensors.moisture.applicable) {
    families.push("Moisture");
  }
  if (row.otherSensors.upsAlarm.applicable || row.otherSensors.modbusEStop.applicable) {
    families.push("UPS / E-stop");
  }
  if (row.thermal) {
    families.push("Environment");
  }

  return families;
}

// Helper to check if a row/point matches the array filter
export function matchesArrayFilter(item: any, selectedArray: string | number | null): boolean {
  if (selectedArray === "all" || selectedArray === null || selectedArray === undefined || selectedArray === "") {
    return true;
  }
  
  const arrayNum = parseInt(selectedArray as string, 10);
  if (isNaN(arrayNum)) {
    return true;
  }

  // For point
  if (item.arrayIndex !== undefined && item.arrayIndex !== null) {
    return item.arrayIndex === arrayNum;
  }

  // For row displayName or matching text "Array N"
  const name = item.location?.displayName || item.displayName || "";
  const match = name.match(/Array\s+(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) === arrayNum;
  }

  return false;
}

export function matchesSegmentFilter(item: any, selectedSegment: "all" | "CS" | "ES"): boolean {
  if (selectedSegment === "all") return true;

  // For point
  if (item.segmentKind) {
    if (selectedSegment === "CS") return item.segmentKind === "CS";
    if (selectedSegment === "ES") return item.segmentKind === "ES";
  }

  // For row
  if (item.location?.enclosureType) {
    const isCS = item.location.enclosureType === "CollectionSegment";
    if (selectedSegment === "CS") return isCS;
    if (selectedSegment === "ES") return !isCS;
  }

  return false;
}

export function matchesHealthFilter(
  item: any,
  selectedHealth: string,
  isRow: boolean
): boolean {
  if (selectedHealth === "all") return true;

  if (isRow) {
    const row = item as BlockSensorMatrixRow;
    if (selectedHealth === "Healthy") return row.severity === "OK";
    if (selectedHealth === "Warning") return row.severity === "Warning";
    if (selectedHealth === "Critical") return row.severity === "Critical";
    
    // Check if any child cell is tripped or unavailable
    if (selectedHealth === "Active / Tripped") {
      return (
        row.emergencySensors.moisture.tripped === true ||
        row.doorSensors.acDoors.tripped === true ||
        row.doorSensors.dcDoors.tripped === true ||
        row.doorSensors.topCapDoors.tripped === true ||
        row.doorSensors.batteryDoors.tripped === true ||
        row.otherSensors.smoke.tripped === true ||
        row.otherSensors.heat.tripped === true ||
        row.otherSensors.hydrogen.tripped === true ||
        row.otherSensors.fire.tripped === true ||
        row.otherSensors.upsAlarm.tripped === true ||
        row.otherSensors.modbusEStop.tripped === true
      );
    }
    
    if (selectedHealth === "Unavailable / Offline") {
      return !row.location.segmentCommunicating || !row.location.siteConnected;
    }

    if (selectedHealth === "State Unknown") {
      return row.severity as any === "UNKNOWN" || row.location.segmentCommunicating === null;
    }
  } else {
    // For Point
    const point = item as TopologySensorPoint;
    if (selectedHealth === "Healthy") return point.severity === "OK";
    if (selectedHealth === "Warning") return point.severity === "Warning";
    if (selectedHealth === "Critical") return point.severity === "Critical";
    if (selectedHealth === "Active / Tripped") return point.activeState === true;
    if (selectedHealth === "Unavailable / Offline") return !point.pointAvailable;
    if (selectedHealth === "State Unknown") return point.activeState === null;
  }

  return true;
}

export function matchesSearch(item: any, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();

  const name = (item.location?.displayName || item.displayName || "").toLowerCase();
  const key = (item.entityKey || item.id || "").toLowerCase();
  const label = (item.pointLabel || "").toLowerCase();
  const role = (item.pointRole || "").toLowerCase();
  const type = (item.entityType || "").toLowerCase();
  const subType = (item.entitySubType || "").toLowerCase();
  const msg = (item.statusMessage || "").toLowerCase();
  
  // Custom segment match: e.g. finding ES-02 or CS-10 or Array index
  if (q.includes("array")) {
    const match = q.match(/array\s*(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      const isPointMatch = item.arrayIndex === num;
      const isRowMatch = name.includes(`array ${num}`) || name.includes(`array  ${num}`);
      if (isPointMatch || isRowMatch) return true;
    }
  }

  return (
    name.includes(q) ||
    key.includes(q) ||
    label.includes(q) ||
    role.includes(q) ||
    type.includes(q) ||
    subType.includes(q) ||
    msg.includes(q)
  );
}

export function formatActiveState(activeState: boolean | null): "ACTIVE" | "CLEAR" | "UNKNOWN" {
  if (activeState === true) return "ACTIVE";
  if (activeState === false) return "CLEAR";
  return "UNKNOWN";
}

export function formatAvailability(point: TopologySensorPoint): string {
  if (point.pointAvailable) return "Available";
  return point.availabilityStatus || "Offline";
}

export function formatEntityKey(key: string): string {
  if (!key) return "-";
  // Abbreviate OCDK_ST_BHE0020_B_1_OCD_1 dynamically
  if (key.length > 22) {
    return key.substring(0, 10) + "..." + key.substring(key.length - 10);
  }
  return key;
}

export function isPhysicalSensorEnclosureRow(row: any): boolean {
  if (!row) return false;
  const displayName = String(row.location?.displayName || row.topology?.displayName || "").toLowerCase();
  const enclosureType = row.location?.enclosureType || row.topology?.enclosureType;

  if (displayName.includes("enclosure string modules")) return false;
  if (displayName.includes("string modules")) return false;
  if (displayName.includes("header")) return false;
  if (displayName.includes("group")) return false;

  return enclosureType === "CollectionSegment" || enclosureType === "EnergySegment";
}

