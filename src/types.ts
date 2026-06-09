export interface BessDevice {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  model: string;
  status: 'Charging' | 'Discharging' | 'Idle' | 'Faulted' | 'Maintenance';
  soc: number; // State of Charge (0-100)
  soh: number; // State of Health (0-100)
  voltage: number; // Volts
  current: number; // Amperes
  frequency: number; // Hz (50 or 60 Hz)
  temperature: number; // °C
  power: number; // kW (positive is charging, negative is discharging)
  capacityKwh: number; // total capacity in kWh
  cycleCount: number;
  lastPing: string | null;
  isOnline: boolean;
  firmwareVersion: string;
  lastError: string | null;
  cellVoltages: number[]; // Array of cell voltages for detailed balances (e.g. 16 cells)
  
  // Real-time Modbus mapping configuration
  isRealtimeEnabled?: boolean;
  pollStatus?: 'connected' | 'disconnected' | 'polling_error';
  modbusUnitId?: number;
  socReg?: number;
  sohReg?: number;
  voltageReg?: number;
  currentReg?: number;
  powerReg?: number;
  tempReg?: number;
  frequencyReg?: number;
  errorLog?: string | null;
}

export interface BessLog {
  id: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  code: string;
}

export interface ReportConfig {
  id: string;
  name: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly';
  format: 'JSON' | 'CSV';
  recipients: string[];
  lastSent: string | null;
  selectedDevices: string[];
  includeMetrics: string[];
}

export interface SmartDiagnosticResponse {
  summary: string;
  rootCause: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  recommendations: string[];
  suggestedCurlCmds: { title: string; cmd: string; desc: string }[];
}
