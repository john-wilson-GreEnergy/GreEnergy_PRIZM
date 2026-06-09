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
  arrayCount: number;
  stringsPerArray: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
