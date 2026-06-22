import { NormalizedSensorCell, BlockSensorMatrixRow } from "./siteSensors/siteSensorsRoutes";

export interface NormalizedTopologySensorPoint {
  stationCode: string | null;
  blockIndex: number | null;
  sourceEndpoint: "/tools/monitor/ems/blockviewer/data";
  sourcePath: string;
  entityKey: string;
  entityType: string;
  entitySubType: string | null;
  numericId: number | null;
  enclosureIndex: number | null;
  sensorCode: number | null;
  arrayIndex: number | null;
  segmentKind: "CS" | "ES" | "UNKNOWN";
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
  childEntityKeys: unknown[];
  raw: unknown;
  valueFieldUsed: string | null;
  labelFromStatusMessage: string | null;
}

export interface NormalizedTopologySensorSummary {
  success: boolean;
  timestamp: string;
  source: string;
  parserMode: "localTopology";
  stationCode: string | null;
  blockIndex: number | null;
  endpoint: "/tools/monitor/ems/blockviewer/data";
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
  points: NormalizedTopologySensorPoint[];
  rows: BlockSensorMatrixRow[];
  debug: {
    topLevelKeys: string[];
    booleanStateFieldsDiscovered: string[];
    sampleEntityKeys: string[];
    unknownEntities: unknown[];
    parserWarnings: string[];
    parserMode: "localTopology";
    topologyEntityCount: number;
    openClosedDetectorCount: number;
    humidityTemperatureSensorCount: number;
    activePointCount: number;
    unavailablePointCount: number;
    unknownPointCount: number;
    numericIdParseFailedCount: number;
    sampleNumericIdFailures: Array<{
      entityKey: string | null;
      displayKey: string | null;
      statusMessage: string | null;
      entityType: string | null;
      entitySubType: string | null;
    }>;
    sampleParsedNumericIds: Array<{
      entityKey: string | null;
      displayKey: string | null;
      numericId: number | null;
      enclosureIndex: number | null;
      sensorCode: number | null;
      arrayIndex: number | null;
      segmentKind: "CS" | "ES" | "UNKNOWN";
      segmentNumber: number | null;
      pointRole: string;
    }>;
  };
}

// Extract the final numeric token from string
export function extractFinalNumericToken(value: unknown): number | null {
  const text = String(value ?? "");
  const matches = text.match(/\d+/g);
  if (!matches || matches.length === 0) return null;

  const numericId = Number(matches[matches.length - 1]);
  return Number.isFinite(numericId) ? numericId : null;
}

// Parse active state from explicit state/value fields
export function parseActiveState(entity: any): { 
  activeState: boolean | null; 
  activeStateSource: string | null; 
  rawValue: any; 
  valueFieldUsed: string | null;
} {
  const fields = [
    "value",
    "statusValue",
    "currentValue",
    "presentValue",
    "stateValue",
    "booleanValue",
    "active",
    "tripped",
    "isActive",
    "isTripped",
    "isAlarmed",
    "alarm",
    "fault",
    "status",
    "state"
  ];

  for (const field of fields) {
    if (entity[field] !== undefined && entity[field] !== null) {
      const val = entity[field];
      if (typeof val === "boolean") {
        return { 
          activeState: val, 
          activeStateSource: field, 
          rawValue: val, 
          valueFieldUsed: field 
        };
      }
      if (typeof val === "string") {
        const lowerVal = val.toLowerCase().trim();
        if (["true", "active", "tripped", "alarm", "alarmed", "fault", "faulted"].includes(lowerVal)) {
          return { 
            activeState: true, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        }
        if (["false", "normal", "inactive", "untripped", "clear", "ok", "ready"].includes(lowerVal)) {
          return { 
            activeState: false, 
            activeStateSource: field, 
            rawValue: val, 
            valueFieldUsed: field 
          };
        }
      }
      if (typeof val === "number") {
        return { 
          activeState: val !== 0, 
          activeStateSource: field, 
          rawValue: val, 
          valueFieldUsed: field 
        };
      }
    }
  }

  return { activeState: null, activeStateSource: null, rawValue: null, valueFieldUsed: null };
}

// Map sensorCode and segmentKind for OpenClosedDetector
export function getPointMapping(code: number, segmentKind: "CS" | "ES"): { pointRole: string; pointLabel: string } {
  if (segmentKind === "CS") {
    switch (code) {
      case 1:  return { pointRole: "dataCommunications", pointLabel: "Data Communications" };
      case 2:  return { pointRole: "acDoors", pointLabel: "AC Doors" };
      case 3:  return { pointRole: "dcDoors", pointLabel: "DC Doors" };
      case 4:  return { pointRole: "topCapDoors", pointLabel: "Top Cap Doors" };
      case 5:  return { pointRole: "manualVentilation", pointLabel: "Manual Ventilation" };
      case 6:  return { pointRole: "smoke", pointLabel: "Smoke Detector" };
      case 7:  return { pointRole: "fireTrouble", pointLabel: "Fire Trouble" };
      case 8:  return { pointRole: "fire", pointLabel: "Fire Alarm" };
      case 9:  return { pointRole: "io", pointLabel: "IO Communications" };
      case 10: return { pointRole: "heat", pointLabel: "Heat Detector" };
      case 11: return { pointRole: "moisture", pointLabel: "Moisture Detector" };
      case 31: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 1" };
      case 32: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 2" };
      case 33: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 3" };
      case 34: return { pointRole: "upsAlarm", pointLabel: "UPS Alarm Relay 4" };
      default: return { pointRole: "unknown", pointLabel: `Unknown CS point ${code}` };
    }
  } else {
    switch (code) {
      case 1:  return { pointRole: "dataCommunications", pointLabel: "Data Communications" };
      case 2:  return { pointRole: "batteryDoors", pointLabel: "Battery Doors" };
      case 3:  return { pointRole: "topCapDoors", pointLabel: "Top Cap Doors" };
      case 4:  return { pointRole: "envControllerVent", pointLabel: "Env Controller Ventilation" };
      case 5:  return { pointRole: "smoke", pointLabel: "Smoke Detector" };
      case 6:  return { pointRole: "hydrogenFault", pointLabel: "Hydrogen Detector Fault" };
      case 7:  return { pointRole: "hydrogen", pointLabel: "Hydrogen Sensor" };
      case 8:  return { pointRole: "io", pointLabel: "IO Communications" };
      case 9:  return { pointRole: "heat", pointLabel: "Heat Detector" };
      case 10: return { pointRole: "fireTrouble", pointLabel: "Fire Trouble" };
      case 11: return { pointRole: "moisture", pointLabel: "Moisture Detector" };
      default: return { pointRole: "unknown", pointLabel: `Unknown ES point ${code}` };
    }
  }
}

// Convert a single NormalizedTopologySensorPoint to a legacy view-compatible NormalizedSensorCell
export function pointToCell(point: NormalizedTopologySensorPoint): NormalizedSensorCell {
  const healthy = point.pointHealthy;
  const tripped = point.activeState;
  const statusMessage = point.statusMessage;

  let displayValue = "OK";
  if (!point.pointAvailable) {
    displayValue = point.availabilityStatus;
  } else if (tripped === true) {
    displayValue = "TRIPPED";
  } else if (tripped === null) {
    displayValue = "STATE UNKNOWN";
  }

  return {
    applicable: true,
    healthy,
    tripped,
    latched: false,
    value: (point.rawValue as any) ?? null,
    status: statusMessage,
    displayValue,
    label: point.pointLabel || point.entityKey,
    friendlyName: point.pointLabel,
    sensorRole: point.pointRole,
    openClosedDetectorType: point.entityType,
    sensorIndex: point.sensorCode,
    sensorTypeCode: point.sensorCode,
    detectorIndex: point.numericId,
    entityKey: point.entityKey,
    entitySubType: point.entitySubType,
    entityType: point.entityType,
    communicating: point.communicating,
    enabled: point.enabled,
    ready: point.ready,
    timestamp: new Date().toISOString(),
    unhealthyReasons: !healthy ? [point.availabilityStatus === "Available" ? "TRIPPED" : point.availabilityStatus] : [],
    allowFaultReset: point.allowFaultReset,
    sourcePath: point.sourcePath,
    raw: point.raw,
    // Debug fields
    valueFieldUsed: point.valueFieldUsed,
    rawValue: point.rawValue,
    activeStateSource: point.activeStateSource,
    labelFromStatusMessage: point.labelFromStatusMessage
  };
}

// Helper to create empty placeholder cells
function createEmptyCell(role: string): NormalizedSensorCell {
  return {
    applicable: false,
    healthy: true,
    tripped: null,
    latched: null,
    value: null,
    status: null,
    displayValue: "N/A",
    label: role,
    friendlyName: null,
    sensorRole: role,
    openClosedDetectorType: null,
    sensorIndex: null,
    sensorTypeCode: null,
    detectorIndex: null,
    valueFieldUsed: null,
    rawValue: null,
    activeStateSource: null,
    labelFromStatusMessage: null
  };
}

export function parseEmsTopology(blockData: any): NormalizedTopologySensorSummary {
  const topLevelKeys = blockData ? Object.keys(blockData) : [];
  const timestamp = new Date().toISOString();

  const success = !!(blockData && (Array.isArray(blockData.topology) || (blockData.data && Array.isArray(blockData.data.topology))));
  
  const stationCode = blockData?.stationCode || blockData?.data?.stationCode || null;
  const blockIndex = blockData?.blockIndex || blockData?.data?.blockIndex || 1;

  let topologyArray: any[] = [];
  if (blockData) {
    if (Array.isArray(blockData.topology)) {
      topologyArray = blockData.topology;
    } else if (blockData.data && Array.isArray(blockData.data.topology)) {
      topologyArray = blockData.data.topology;
    }
  }

  const topologyEntityCount = topologyArray.length;
  
  let sensorEntityCount = 0;
  let openClosedDetectorCount = 0;
  let humidityTemperatureSensorCount = 0;
  let pcsEntityCount = 0;
  let upsOrEStopCount = 0;

  let activePointCount = 0;
  let unavailablePointCount = 0;
  let unknownPointCount = 0;

  const points: NormalizedTopologySensorPoint[] = [];
  const debugWarnings: string[] = [];
  const booleanStateFieldsDiscovered = new Set<string>();
  const sampleEntityKeys: string[] = [];
  const unknownEntities: any[] = [];

  const sampleNumericIdFailures: Array<{
    entityKey: string | null;
    displayKey: string | null;
    statusMessage: string | null;
    entityType: string | null;
    entitySubType: string | null;
  }> = [];

  const sampleParsedNumericIds: Array<{
    entityKey: string | null;
    displayKey: string | null;
    numericId: number | null;
    enclosureIndex: number | null;
    sensorCode: number | null;
    arrayIndex: number | null;
    segmentKind: "CS" | "ES" | "UNKNOWN";
    segmentNumber: number | null;
    pointRole: string;
  }> = [];

  let numericIdParseFailedCount = 0;

  const fieldsToCheck = [
    "value",
    "statusValue",
    "currentValue",
    "presentValue",
    "stateValue",
    "booleanValue",
    "active",
    "tripped",
    "isActive",
    "isTripped",
    "isAlarmed",
    "alarm",
    "fault"
  ];

  // Map to group points by enclosure index
  const pointsByEnclosure: Record<number, NormalizedTopologySensorPoint[]> = {};

  topologyArray.forEach((entity, index) => {
    if (!entity || typeof entity !== "object") return;

    if (sampleEntityKeys.length < 10 && entity.entityKey) {
      sampleEntityKeys.push(entity.entityKey);
    }

    // Check which booleanStateFields are discovered on this entity
    fieldsToCheck.forEach(f => {
      if (entity[f] !== undefined && entity[f] !== null) {
        booleanStateFieldsDiscovered.add(f);
      }
    });

    const entityType = entity.entityType || "";
    const entityTypeLower = String(entityType).toLowerCase();
    const entitySubType = entity.entitySubType || null;
    const entitySubTypeLower = String(entitySubType || "").toLowerCase();
    const statusMessage = entity.statusMessage || null;

    // Detect general category
    if (entityTypeLower.includes("pcs")) {
      pcsEntityCount++;
      unknownEntities.push(entity);
      return;
    }

    const isOpenClosed = entityTypeLower.includes("openclosed") || entityTypeLower.includes("detector");
    const isTempHum = entityTypeLower.includes("humidity") || entityTypeLower.includes("temperature") || entityTypeLower.includes("hts") || entitySubTypeLower.includes("hts");

    if (!isOpenClosed && !isTempHum) {
      unknownEntities.push(entity);
      return;
    }

    sensorEntityCount++;
    if (isOpenClosed) {
      openClosedDetectorCount++;
    }
    if (isTempHum) {
      humidityTemperatureSensorCount++;
    }

    // Parse Key & Numeric ID
    const key = entity.entityKey || "";
    const numericId =
      extractFinalNumericToken(entity.entityKey) ??
      extractFinalNumericToken(entity.displayKey) ??
      extractFinalNumericToken(entity.statusMessage);

    let enclosureIndex: number | null = null;
    let sensorCode: number | null = null;
    let arrayIndex: number | null = null;
    let segmentKind: "CS" | "ES" | "UNKNOWN" = "UNKNOWN";
    let segmentNumber: number | null = null;
    let displayName = "Unknown Enclosure";

    if (numericId !== null) {
      enclosureIndex = Math.floor(numericId / 100);
      sensorCode = numericId % 100;

      // enclosuresPerArray = 21
      arrayIndex = Math.floor((enclosureIndex - 1) / 21) + 1;
      const positionInArray = ((enclosureIndex - 1) % 21) + 1;

      if (positionInArray === 1) {
        segmentKind = "CS";
        segmentNumber = null;
        displayName = `Array ${arrayIndex} - CS`;
      } else {
        segmentKind = "ES";
        segmentNumber = positionInArray - 1;
        displayName = `Array ${arrayIndex} - ES${segmentNumber}`;
      }
    } else {
      debugWarnings.push(`Could not parse numeric id from entityKey: "${key}" at index ${index}`);
    }

    // Check if UPS or E-stop
    const isUpsOrEstop = 
      entityTypeLower.includes("srt3000") || 
      entitySubTypeLower.includes("srt") || 
      (sensorCode !== null && sensorCode >= 31 && sensorCode <= 34) || 
      String(statusMessage || "").toLowerCase().includes("srt3000") || 
      String(statusMessage || "").toLowerCase().includes("ups") || 
      String(statusMessage || "").toLowerCase().includes("e-stop");

    if (isUpsOrEstop) {
      upsOrEStopCount++;
    }

    // Map roles & labels
    let pointRole = "unknown";
    let pointLabel = "Unknown Sensor";

    if (isTempHum) {
      if (sensorCode === 1) {
        pointRole = "internalEnvironment";
        pointLabel = "Internal Env Sensor";
      } else if (sensorCode === 2) {
        pointRole = "externalEnvironment";
        pointLabel = "External Env Sensor";
      } else {
        pointRole = "environment";
        pointLabel = `Env Sensor ${sensorCode}`;
      }
    } else if (sensorCode !== null) {
      const mapping = getPointMapping(sensorCode, segmentKind === "CS" ? "CS" : "ES");
      pointRole = mapping.pointRole;
      pointLabel = mapping.pointLabel;
    }

    // Gather debugging metrics for numeric IDs
    if (numericId !== null) {
      if (sampleParsedNumericIds.length < 10) {
        sampleParsedNumericIds.push({
          entityKey: key || null,
          displayKey: entity.displayKey || null,
          numericId,
          enclosureIndex,
          sensorCode,
          arrayIndex,
          segmentKind,
          segmentNumber,
          pointRole
        });
      }
    } else {
      numericIdParseFailedCount++;
      if (sampleNumericIdFailures.length < 10) {
        sampleNumericIdFailures.push({
          entityKey: key || null,
          displayKey: entity.displayKey || null,
          statusMessage: entity.statusMessage || null,
          entityType: entity.entityType || null,
          entitySubType: entity.entitySubType || null
        });
      }
    }

    // Availability state
    const communicating = entity.communicating === true;
    const enabled = entity.enabled === true;
    const ready = entity.ready === true;
    const pointAvailable = communicating && enabled && ready;

    let availabilityStatus: "Available" | "Offline" | "Disabled" | "Not Ready" | "Unknown" = "Unknown";
    if (entity.communicating === false) {
      availabilityStatus = "Offline";
    } else if (entity.enabled === false) {
      availabilityStatus = "Disabled";
    } else if (entity.ready === false) {
      availabilityStatus = "Not Ready";
    } else if (entity.communicating === true && entity.enabled === true && entity.ready === true) {
      availabilityStatus = "Available";
    }

    // Active state from fields list
    const { activeState, activeStateSource, rawValue, valueFieldUsed } = parseActiveState(entity);

    if (!pointAvailable) {
      unavailablePointCount++;
    } else if (activeState === true) {
      activePointCount++;
    }

    if (pointRole === "unknown") {
      unknownPointCount++;
    }

    // Health & Severity
    const pointHealthy = pointAvailable && activeState !== true;
    let severity: "OK" | "Warning" | "Critical" = "OK";
    if (activeState === true) {
      severity = "Critical";
    } else if (!pointAvailable) {
      severity = "Warning";
    }

    const point: NormalizedTopologySensorPoint = {
      stationCode,
      blockIndex,
      sourceEndpoint: "/tools/monitor/ems/blockviewer/data",
      sourcePath: `topology[${index}]`,
      entityKey: key,
      entityType,
      entitySubType,
      numericId,
      enclosureIndex,
      sensorCode,
      arrayIndex,
      segmentKind,
      segmentNumber,
      displayName,
      pointRole,
      pointLabel,
      statusMessage,
      communicating: entity.communicating !== undefined ? entity.communicating : null,
      enabled: entity.enabled !== undefined ? entity.enabled : null,
      ready: entity.ready !== undefined ? entity.ready : null,
      pointAvailable,
      availabilityStatus,
      activeState,
      activeStateSource,
      rawValue,
      pointHealthy,
      severity,
      allowFaultReset: entity.allowFaultReset === true,
      childEntityKeys: Array.isArray(entity.childEntityKeys) ? entity.childEntityKeys : [],
      raw: entity,
      valueFieldUsed,
      labelFromStatusMessage: statusMessage
    };

    points.push(point);

    if (enclosureIndex !== null) {
      if (!pointsByEnclosure[enclosureIndex]) {
        pointsByEnclosure[enclosureIndex] = [];
      }
      pointsByEnclosure[enclosureIndex].push(point);
    }
  });

  // Group into compatible BlockSensorMatrixRow structures
  const sortedEnclosures = Object.keys(pointsByEnclosure).map(Number).sort((a, b) => a - b);
  const rows: BlockSensorMatrixRow[] = [];

  for (const enclosureIndex of sortedEnclosures) {
    const rowPoints = pointsByEnclosure[enclosureIndex] || [];
    const firstPoint = rowPoints[0];
    const arrayIndex = firstPoint.arrayIndex || 1;
    const isCS = firstPoint.segmentKind === "CS";
    const segmentNumber = firstPoint.segmentNumber;

    const emergencySensors = {
      moisture: createEmptyCell("moisture")
    };

    const comStatus = {
      io: createEmptyCell("io"),
      dataCommunications: createEmptyCell("dataCommunications")
    };

    const doorSensors = {
      acDoors: createEmptyCell("acDoors"),
      dcDoors: createEmptyCell("dcDoors"),
      topCapDoors: createEmptyCell("topCapDoors"),
      batteryDoors: createEmptyCell("batteryDoors")
    };

    const otherSensors = {
      modbusEStop: createEmptyCell("modbusEStop"),
      manualVentilation: createEmptyCell("manualVentilation"),
      envControllerVent: createEmptyCell("envControllerVent"),
      envControllerLostComms: createEmptyCell("envControllerLostComms"),
      upsAlarm: createEmptyCell("upsAlarm"),
      smoke: createEmptyCell("smoke"),
      heat: createEmptyCell("heat"),
      fire: createEmptyCell("fire"),
      fireTrouble: createEmptyCell("fireTrouble"),
      hydrogen: createEmptyCell("hydrogen"),
      hydrogenFault: createEmptyCell("hydrogenFault")
    };

    const upsAlarms: NormalizedSensorCell[] = [];
    const unknownSensors: NormalizedSensorCell[] = [];

    rowPoints.forEach(p => {
      const cell = pointToCell(p);
      const role = p.pointRole;

      if (role === "moisture") { emergencySensors.moisture = cell; }
      else if (role === "io") { comStatus.io = cell; }
      else if (role === "dataCommunications") { comStatus.dataCommunications = cell; }
      else if (role === "acDoors") { doorSensors.acDoors = cell; }
      else if (role === "dcDoors") { doorSensors.dcDoors = cell; }
      else if (role === "topCapDoors") { doorSensors.topCapDoors = cell; }
      else if (role === "batteryDoors") { doorSensors.batteryDoors = cell; }
      else if (role === "modbusEStop") { otherSensors.modbusEStop = cell; }
      else if (role === "manualVentilation") { otherSensors.manualVentilation = cell; }
      else if (role === "envControllerVent") { otherSensors.envControllerVent = cell; }
      else if (role === "smoke") { otherSensors.smoke = cell; }
      else if (role === "fire") { otherSensors.fire = cell; }
      else if (role === "fireTrouble") { otherSensors.fireTrouble = cell; }
      else if (role === "hydrogen") { otherSensors.hydrogen = cell; }
      else if (role === "hydrogenFault") { otherSensors.hydrogenFault = cell; }
      else if (role === "heat") { otherSensors.heat = cell; }
      else if (role === "upsAlarm") { upsAlarms.push(cell); }
      else { unknownSensors.push(cell); }
    });

    if (isCS && upsAlarms.length > 0) {
      const allHealthy = upsAlarms.every(c => c.healthy);
      const anyTripped = upsAlarms.some(c => c.tripped === true);
      otherSensors.upsAlarm = {
        applicable: true,
        healthy: allHealthy,
        tripped: anyTripped,
        latched: upsAlarms.some(c => c.latched === true),
        value: null,
        status: allHealthy ? "Normal" : "Fault",
        displayValue: allHealthy ? "OK" : "TRIPPED",
        label: "UPS Alarm Aggregate",
        friendlyName: `${upsAlarms.filter(c => !c.healthy).length} / ${upsAlarms.length} UPS Alarms Tripped`,
        sensorRole: "upsAlarm",
        openClosedDetectorType: "UPS",
        sensorIndex: 31,
        sensorTypeCode: 31,
        detectorIndex: 31,
        raw: upsAlarms
      };
    } else {
      otherSensors.upsAlarm = createEmptyCell("upsAlarm");
    }

    // Extract thermal values
    let internalTemperature: number | null = null;
    let internalHumidity: number | null = null;
    let ambientTemperature: number | null = null;
    let ambientHumidity: number | null = null;

    rowPoints.forEach(p => {
      if (p.entityType === "Humidity Temperature Sensor") {
        const rawVal = p.raw as any;
        const temp = rawVal.temperature !== undefined ? Number(rawVal.temperature) : (rawVal.value !== undefined && typeof rawVal.value === "number" ? rawVal.value : null);
        const hum = rawVal.humidity !== undefined ? Number(rawVal.humidity) : null;
        
        if (p.sensorCode === 1) {
          if (temp !== null) internalTemperature = temp;
          if (hum !== null) internalHumidity = hum;
        } else if (p.sensorCode === 2) {
          if (temp !== null) ambientTemperature = temp;
          if (hum !== null) ambientHumidity = hum;
        }
      }
    });

    const thermal = (internalTemperature !== null || internalHumidity !== null || ambientTemperature !== null || ambientHumidity !== null) ? {
      avgCellTemp: internalTemperature,
      maxTemp: internalTemperature,
      minTemp: internalTemperature,
      humidity: internalHumidity,
      ambientTemp: ambientTemperature,
      ambientHumidity: ambientHumidity
    } : null;

    // Check Row Health and severity findings
    let rowHealthy = true;
    let rowSeverity: "OK" | "Warning" | "Critical" = "OK";
    const findings: string[] = [];

    function checkRowCell(cell: NormalizedSensorCell, label: string) {
      if (!cell || !cell.applicable) return;
      if (!cell.healthy || cell.tripped === true) {
        rowHealthy = false;
        if (cell.tripped === true) {
          rowSeverity = "Critical";
          findings.push(`${label} sensor tripped`);
        } else if (!cell.healthy) {
          if (rowSeverity !== "Critical") {
            rowSeverity = "Warning";
          }
          findings.push(`${label} sensor reporting unhealthy status (${cell.status || "Unhealthy"})`);
        }
      }
    }

    checkRowCell(emergencySensors.moisture, "Moisture");
    checkRowCell(comStatus.io, "IO Board");
    checkRowCell(comStatus.dataCommunications, "Data Comms");
    checkRowCell(doorSensors.acDoors, "AC doors");
    checkRowCell(doorSensors.dcDoors, "DC doors");
    checkRowCell(doorSensors.topCapDoors, "Top cap doors");
    checkRowCell(doorSensors.batteryDoors, "Battery doors");
    checkRowCell(otherSensors.manualVentilation, "Manual ventilation");
    checkRowCell(otherSensors.envControllerVent, "Env Controller Vent");
    checkRowCell(otherSensors.smoke, "Smoke");
    checkRowCell(otherSensors.heat, "Heat");
    checkRowCell(otherSensors.fireTrouble, "Fire Trouble");
    checkRowCell(otherSensors.fire, "Fire");
    checkRowCell(otherSensors.hydrogen, "Hydrogen");
    checkRowCell(otherSensors.hydrogenFault, "Hydrogen Fault");
    checkRowCell(otherSensors.modbusEStop, "E-Stop");

    if (isCS && upsAlarms.length > 0) {
      upsAlarms.forEach((cell, idx) => {
        checkRowCell(cell, `UPS Relay ${idx + 31}`);
      });
    }

    const row: BlockSensorMatrixRow = {
      id: `enclosure-${enclosureIndex}`,
      location: {
        enclosureIndex,
        enclosureType: isCS ? "CollectionSegment" : "EnergySegment",
        segmentPosition: isCS ? null : segmentNumber,
        segmentType: isCS ? "CollectionSegment" : "EnergySegment",
        lineupId: null,
        lineupIndex: null,
        siteConnected: true,
        segmentCommunicating: true,
        displayName: isCS ? `Array ${arrayIndex} - CS` : `Array ${arrayIndex} - ES${segmentNumber}`
      } as any,
      actionHealthy: rowHealthy,
      rowHealthy,
      severity: rowSeverity,
      findings,
      topology: {
        enclosureType: isCS ? "CollectionSegment" : "EnergySegment",
        enclosureIndex,
        groupIndex: null,
        segmentIndex: isCS ? null : segmentNumber,
        segmentPosition: isCS ? null : segmentNumber,
        lineupId: null,
        lineupIndex: null,
        arrays: [{ arrayIndex }],
        strings: isCS ? [] : [
          { arrayIndex, stringIndex: 2 * (segmentNumber || 1) - 1 },
          { arrayIndex, stringIndex: 2 * (segmentNumber || 1) }
        ]
      },
      emergencySensors,
      comStatus,
      doorSensors,
      otherSensors,
      thermal,
      unknownSensors,
      raw: rowPoints.map(p => p.raw)
    };

    rows.push(row);
  }

  const groupedEnclosureCount = Object.keys(pointsByEnclosure).length;

  return {
    success,
    timestamp,
    source: "blockviewer",
    parserMode: "localTopology",
    stationCode,
    blockIndex,
    endpoint: "/tools/monitor/ems/blockviewer/data",
    topologyEntityCount,
    sensorEntityCount,
    openClosedDetectorCount,
    humidityTemperatureSensorCount,
    pcsEntityCount,
    upsOrEStopCount,
    groupedEnclosureCount,
    activePointCount,
    unavailablePointCount,
    unknownPointCount,
    points,
    rows,
    debug: {
      topLevelKeys,
      booleanStateFieldsDiscovered: Array.from(booleanStateFieldsDiscovered),
      sampleEntityKeys,
      unknownEntities,
      parserWarnings: debugWarnings,
      parserMode: "localTopology",
      topologyEntityCount,
      openClosedDetectorCount,
      humidityTemperatureSensorCount,
      activePointCount,
      unavailablePointCount,
      unknownPointCount,
      numericIdParseFailedCount,
      sampleNumericIdFailures,
      sampleParsedNumericIds
    }
  };
}
