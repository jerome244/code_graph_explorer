// frontend/app/pico/thermo-motor/lib/types.ts
export type OnOff = "on" | "off";
export type MotorState = "on" | "off" | "unknown";

export type Thermo = {
  raw: number;
  raw_bits: number;
  voltage: number;
  resistance_ohm: number;
  temp_c: number;
};

export type DhtReading = {
  valid: boolean;
  humidity: number;
  temp_c?: number;
  temp_f?: number;
  heat_index_c?: number;
  heat_index_f?: number;
  err?: string;
};

export type AllowItem = { uid: string; label?: string };

export type LogLevel = "info" | "warn" | "error";
export type LogKind = "access" | "motor" | "buzzer" | "system";
export type LogItem = { id: string; ts: number; level: LogLevel; kind: LogKind; msg: string; data?: any };

export type TimePreset = "all" | "5m" | "15m" | "1h" | "24h";
export type LogFilters = {
  kinds: Record<LogKind, boolean>;
  level: LogLevel | "all";
  q: string;
  time: TimePreset;
};
