import type { Packet } from 'mqtt';

export type Mq2Reading = {
  roomRaw: string;
  gasValue: number;
  gasDetected: boolean;
  gasLevel: 'normal' | 'warning' | 'danger';
};

export function getMq2TopicsFromEnv(): { mq2Topic: string } {
  return {
    mq2Topic: (process.env.MQTT_MQ2_TOPIC ?? 'smarthome/+/mq2').trim(),
  };
}

export function parseMq2Reading(input: { topic: string; payload: any; packet: Packet }): Mq2Reading | null {
  const metric = lastSegment(input.topic);
  if (metric !== 'mq2') return null;

  const ignoreRetained = parseBoolean(process.env.MQTT_INGEST_IGNORE_RETAINED);
  const retain = typeof (input.packet as any)?.retain === 'boolean' ? Boolean((input.packet as any).retain) : false;
  if (ignoreRetained && retain) return null;

  const roomRaw = previousSegment(input.topic);
  if (!roomRaw) return null;

  const gasValue = pickNumber(input.payload, ['gasValue', 'value', 'gas']);
  if (!Number.isFinite(gasValue) || gasValue < 0) return null;

  // ESP32 Arduino publishes: { sensor:"MQ2", value:<ADC>, unit:"ADC", status:"normal|warning|critical" }
  // If explicit gasDetected/gasLevel fields are missing, derive them from status.
  const statusRaw = pickString(input.payload, ['status', 'severity'], '');
  const status = String(statusRaw ?? '').trim().toLowerCase();

  const explicitGasDetected = pickOptionalBoolean(input.payload, ['gasDetected', 'detected']);
  const explicitGasLevelRaw = pickString(input.payload, ['gasLevel', 'level'], '');

  let gasLevel: 'normal' | 'warning' | 'danger' = 'normal';
  if (explicitGasLevelRaw) {
    gasLevel = normalizeGasLevel(explicitGasLevelRaw);
  } else if (status === 'critical') {
    gasLevel = 'danger';
  } else if (status === 'warning') {
    gasLevel = 'warning';
  }

  const gasDetected = typeof explicitGasDetected === 'boolean' ? explicitGasDetected : gasLevel !== 'normal';

  return { roomRaw, gasValue, gasDetected, gasLevel };
}

function normalizeGasLevel(level: string): 'normal' | 'warning' | 'danger' {
  const v = String(level ?? '').trim().toLowerCase();
  if (v === 'danger' || v === 'warning' || v === 'normal') return v;
  return 'normal';
}

function pickNumber(payload: any, keys: string[]): number {
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      const v = (payload as any)[key];
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return Number.NaN;
}

function pickBoolean(payload: any, keys: string[], fallback: boolean): boolean {
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      const v = (payload as any)[key];
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
        if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
      }
    }
  }
  return fallback;
}

function pickOptionalBoolean(payload: any, keys: string[]): boolean | undefined {
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      const v = (payload as any)[key];
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
        if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
      }
    }
  }
  return undefined;
}

function pickString(payload: any, keys: string[], fallback: string): string {
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      const v = (payload as any)[key];
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return fallback;
}

function parseBoolean(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function lastSegment(topic: string): string {
  const parts = splitTopic(topic);
  return parts[parts.length - 1] ?? '';
}

function previousSegment(topic: string): string {
  const parts = splitTopic(topic);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

function splitTopic(topic: string): string[] {
  return String(topic ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
}
