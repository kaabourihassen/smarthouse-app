import type { Packet } from 'mqtt';

export type FlameReading = {
  roomRaw: string;
  detected: boolean;
  status: 'normal' | 'critical';
};

export function getFlameTopicsFromEnv(): { flameTopic: string } {
  return {
    flameTopic: (process.env.MQTT_FLAME_TOPIC ?? 'smarthome/+/flame').trim(),
  };
}

export function parseFlameReading(input: { topic: string; payload: any; packet: Packet }): FlameReading | null {
  const metric = lastSegment(input.topic);
  if (metric !== 'flame') return null;

  const ignoreRetained = parseBoolean(process.env.MQTT_INGEST_IGNORE_RETAINED);
  const retain = typeof (input.packet as any)?.retain === 'boolean' ? Boolean((input.packet as any).retain) : false;
  if (ignoreRetained && retain) return null;

  const roomRaw = previousSegment(input.topic);
  if (!roomRaw) return null;

  // ESP32 Arduino publishes: { sensor:"FLAME", value:1|0, unit:"state", status:"critical|normal" }
  const statusRaw = pickString(input.payload, ['status', 'severity'], 'normal');
  const status = normalizeStatus(statusRaw);

  const value = pickNumber(input.payload, ['value', 'detected', 'state']);
  const detectedByValue = Number.isFinite(value) ? value >= 1 : false;

  const detected = status === 'critical' || detectedByValue;

  return { roomRaw, detected, status: detected ? 'critical' : 'normal' };
}

function normalizeStatus(value: string): 'normal' | 'critical' {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'critical' ? 'critical' : 'normal';
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
