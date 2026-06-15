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

