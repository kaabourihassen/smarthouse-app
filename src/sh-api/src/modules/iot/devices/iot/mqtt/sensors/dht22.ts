import type { Packet } from 'mqtt';

export type DhtMetric = 'temperature' | 'humidity';

export type DhtStatus = 'normal' | 'warning' | 'critical';

export type DhtReadingUpdate = {
  metric: DhtMetric;
  roomRaw: string;
  value: number;
  status: DhtStatus;
  ignore: boolean;
};

export function getDhtTopicsFromEnv(): { dhtTopic: string; dht22Topic: string; tempTopic: string; humTopic: string } {
  return {
    // ESP32 Arduino publishes both metrics to a single topic, with payload.sensor = temperature|humidity
    dhtTopic: (process.env.MQTT_DHT_TOPIC ?? 'smarthome/+/dht11').trim(),
    dht22Topic: (process.env.MQTT_DHT22_TOPIC ?? 'smarthome/+/dht22').trim(),
    tempTopic: (process.env.MQTT_DHT_TEMP_TOPIC ?? 'smarthome/+/temperature').trim(),
    humTopic: (process.env.MQTT_DHT_HUM_TOPIC ?? 'smarthome/+/humidity').trim(),
  };
}

export function isDhtMetric(metric: string): metric is DhtMetric {
  return metric === 'temperature' || metric === 'humidity';
}

export function parseDhtUpdate(input: {
  topic: string;
  payload: any;
  packet: Packet;
}): DhtReadingUpdate | null {
  const last = lastSegment(input.topic);

  // Supported topic formats:
  // - smarthome/<room>/temperature (legacy)
  // - smarthome/<room>/humidity (legacy)
  // - smarthome/<room>/dht11 or dht22 with payload.sensor = temperature|humidity (ESP32 Arduino)
  let metric: DhtMetric | '' = '';

  if (isDhtMetric(last)) {
    metric = last;
  } else if (last === 'dht11' || last === 'dht22') {
    const sensor = String(input.payload?.sensor ?? '').trim();
    if (isDhtMetric(sensor)) {
      metric = sensor;
    }
  }

  if (!metric) return null;

  const ignoreRetained = parseBoolean(process.env.MQTT_INGEST_IGNORE_RETAINED);
  const retain = typeof (input.packet as any)?.retain === 'boolean' ? Boolean((input.packet as any).retain) : false;
  if (ignoreRetained && retain) {
    return { metric, roomRaw: '', value: Number.NaN, status: 'normal', ignore: true };
  }

  const roomRaw = previousSegment(input.topic);
  if (!roomRaw) return null;

  const value = extractNumericValue(input.payload);
  if (!Number.isFinite(value)) return null;

  const status = parseStatus(input.payload);

  return { metric, roomRaw, value, status, ignore: false };
}

function parseStatus(payload: any): DhtStatus {
  if (payload && typeof payload === 'object') {
    const raw = String((payload as any).status ?? (payload as any).severity ?? '').trim().toLowerCase();
    if (raw === 'critical' || raw === 'danger' || raw === 'alarm') return 'critical';
    if (raw === 'warning' || raw === 'warn') return 'warning';
  }
  return 'normal';
}

function parseBoolean(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function extractNumericValue(payload: any): number {
  // ESP32 sends JSON: { value: 23.4, unit: "°C", ... }
  if (payload && typeof payload === 'object') {
    const v = (payload as any).value;
    return typeof v === 'number' ? v : Number(v);
  }

  // Fallback: raw numeric payload
  return Number(String(payload ?? '').trim());
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
