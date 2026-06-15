export interface TopologyModel {
  type: "standard-array-segment" | "custom-manual";
  basePrefix: string;
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
