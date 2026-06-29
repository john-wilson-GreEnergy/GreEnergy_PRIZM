export interface TopologyBlockModel {
  blockId: string;
  blockName: string;
  blockIndex: number;
  stationCode?: string;
  emsHost: string;
  emsPort: number;
  turtlePath: string;
  modbusHost: string;
  modbusPort: number;
  modbusUnitId: number;
  basePrefix: string;
  arrayStart: number;
  arrayEnd: number;
  segmentStart: number;
  segmentEnd: number;
  csSegment: number;
  esSegmentStart: number;
  esSegmentStep: number;
  esCountPerArray: number;
  includeCollectionSegment: boolean;
}

export interface TopologyModel {
  type: "standard-array-segment" | "custom-manual";
  siteModelVersion: 2;
  basePrefix?: string; // retained only for legacy migration
  arrayOctet: number;
  segmentOctet: number;
  arrayStart: number;
  arrayEnd: number;
  segmentStart: number;
  segmentEnd: number;
  csSegment: number;
  esSegmentStart: number;
  esSegmentStep: number;
  esCountPerArray: number;
  includeCollectionSegment: boolean;
  blocks: TopologyBlockModel[];
}

export interface CapacityProfile {
  profileName?: string;
  energySegmentCapacityKWh?: number;
  stringsPerEnergySegment?: number;
  nominalStringVoltageV?: number;
  ratedDurationHours?: number;
  batteryManufacturer?: string;
  cellChemistry?: string;
  notes?: string;
}

export interface SensorMonitoringProfile {
  collectionSegment: {
    dataUnavailable: boolean;
    acDoors: boolean;
    dcDoors: boolean;
    topCapDoors: boolean;
    manualVentilation: boolean;
    smoke: boolean;
    fireTrouble: boolean;
    fire: boolean;
    io: boolean;
    heat: boolean;
    upsAlarm: boolean;
    moisture: boolean;
    leakDetector: boolean;
    hydrogen: boolean;
    hydrogenFault: boolean;
    envControllerVent: boolean;
    [key: string]: boolean;
  };
  energySegment: {
    dataUnavailable: boolean;
    batteryDoors: boolean;
    topCapDoors: boolean;
    envControllerVent: boolean;
    smoke: boolean;
    hydrogenFault: boolean;
    hydrogen: boolean;
    io: boolean;
    heat: boolean;
    fireTrouble: boolean;
    moisture: boolean;
    fire: boolean;
    acDoors: boolean;
    dcDoors: boolean;
    manualVentilation: boolean;
    upsAlarm: boolean;
    [key: string]: boolean;
  };
}

export interface EmsProfile {
  id: string;
  profileName: string;
  siteName: string;
  stationCode: string;
  blockIndex: number;
  emsHost: string;
  emsPort: number;
  turtlePath: string;
  modbusHost: string;
  modbusPort: number;
  modbusUnitId?: number;
  arrayCount: number;
  stringsPerArray: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  topologyModel?: TopologyModel;
  capacityProfile?: CapacityProfile;
  sensorMonitoringProfile?: SensorMonitoringProfile;
  ipLayout?: {
    arraySubnetMode?: "third-octet" | "explicit-map" | "custom";
    baseNetwork?: string;
    arrayOctetIndex?: number;
    hostOctetIndex?: number;
    csHostOctets?: number[];
    esStartHostOctet?: number;
    esHostStep?: number;
    esCountPerArray?: number;
    arrayIndexOffset?: number;
    explicitDeviceMap?: Record<string, string>;
  };
  lastTestedAt?: string | null;
  lastTestResult?: {
    success: boolean;
    emsUrlTested: string;
    statusEndpointResult?: any;
    turtleVersion?: string;
    stationCode?: string;
    blockIndex?: number;
    error?: string | null;
    durations?: {
      status?: number;
      reportStatus?: number;
      blockviewer?: number;
    }
  } | null;
}

