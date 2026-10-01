import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';
import type { IClientOptions, MqttClient, Packet } from 'mqtt';
import { DevicesService } from '../../services/devices.service';
import { NotificationsService } from '../../../../core_domain/notifications/services/notifications.service';
import { getDhtTopicsFromEnv, parseDhtUpdate } from './sensors/dht22';
import { getMq2TopicsFromEnv, parseMq2Reading } from './sensors/mq2';
import { getFlameTopicsFromEnv, parseFlameReading } from './sensors/flame';

type DhtState = {
  temperatureC?: number;
  humidityPct?: number;
  temperatureAtMs?: number;
  humidityAtMs?: number;
  temperatureStatus?: 'normal' | 'warning' | 'critical';
  humidityStatus?: 'normal' | 'warning' | 'critical';
  lastIngestAtMs?: number;
};

type AlertLevel = 'normal' | 'warning' | 'danger' | 'critical';

@Injectable()
export class MqttIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttIngestService.name);
  private client?: MqttClient;
  private warnedAboutDynamicAllowlist = false;

  /** Keyed by `${room}::${title}` */
  private readonly dhtState = new Map<string, DhtState>();

  /** Keyed by `${userId}::${room}::${kind}` */
  private readonly lastAlertLevel = new Map<string, AlertLevel>();

  constructor(
    private readonly devicesService: DevicesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    const enabled = parseBoolean(process.env.MQTT_INGEST_ENABLED);
    if (!enabled) return;

    const defaultUserId = (process.env.MQTT_INGEST_USER_ID ?? '').trim();
    const allowUserIdFromTopic = parseBoolean(process.env.MQTT_INGEST_USER_ID_FROM_TOPIC);
    const allowUserIdFromPayload = parseBoolean(process.env.MQTT_INGEST_USER_ID_FROM_PAYLOAD);
    if (!defaultUserId && !allowUserIdFromTopic && !allowUserIdFromPayload) {
      this.logger.warn(
        'MQTT_INGEST_ENABLED is true but MQTT_INGEST_USER_ID is missing; set it, or enable MQTT_INGEST_USER_ID_FROM_TOPIC / MQTT_INGEST_USER_ID_FROM_PAYLOAD',
      );
      return;
    }

    const url = buildMqttUrl();
    const clientId = (process.env.MQTT_CLIENT_ID ?? '').trim() || `sh-api-${Math.random().toString(16).slice(2)}`;

    const options: IClientOptions = {
      clientId,
      username: envOrUndefined('MQTT_USERNAME'),
      password: envOrUndefined('MQTT_PASSWORD'),
      reconnectPeriod: 2000,
    };

    this.logger.log(`Connecting to MQTT broker: ${redactUrl(url)} (clientId=${clientId})`);

    const client = mqtt.connect(url, options);
    this.client = client;

    client.on('connect', () => {
      this.logger.log('MQTT connected');

      const dht = getDhtTopicsFromEnv();
      const mq2 = getMq2TopicsFromEnv();
      const flame = getFlameTopicsFromEnv();

      const alertsTopic = (process.env.MQTT_ALERTS_TOPIC ?? 'smarthome/alerts').trim();
      const statusTopic = (process.env.MQTT_STATUS_TOPIC ?? 'smarthome/device/status').trim();

      const topics = [
        'smarthome/#',
        dht.dhtTopic,
        dht.dht22Topic,
        dht.tempTopic,
        dht.humTopic,
        mq2.mq2Topic,
        flame.flameTopic,
        'smarthome/+/lamp',
        'smarthome/+/pir1',
        'smarthome/+/pir2',
        alertsTopic,
        statusTopic,
      ].filter(Boolean);

      client.subscribe(topics, (err) => {
        if (err) {
          this.logger.error(`MQTT subscribe failed: ${String(err?.message ?? err)}`);
          return;
        }
        this.logger.log(`MQTT subscribed: ${topics.join(', ')}`);
      });
    });

    client.on('message', (topic, message, packet) => {
      this.handleMessage(defaultUserId, topic, message, packet).catch((err) => {
        this.logger.error(`MQTT message handler error: ${String(err?.message ?? err)}`);
      });
    });

    client.on('reconnect', () => this.logger.warn('MQTT reconnecting...'));
    client.on('close', () => this.logger.warn('MQTT connection closed'));
    client.on('offline', () => this.logger.warn('MQTT offline'));
    client.on('error', (err) => this.logger.error(`MQTT error: ${String(err?.message ?? err)}`));
  }

  async onModuleDestroy() {
    if (!this.client) return;

    const client = this.client;
    this.client = undefined;

    await new Promise<void>((resolve) => {
      client.end(true, {}, () => resolve());
    });
  }

  private async handleMessage(defaultUserId: string, topic: string, message: Buffer, packet: Packet) {
    const payload = parseJsonPayload(message);

    // --- Alerts (generic) ---
    if (String(topic ?? '').trim() === (process.env.MQTT_ALERTS_TOPIC ?? 'smarthome/alerts').trim()) {
      const { userId } = this.resolveIngestTarget({ defaultUserId, topic, payload });
      if (!userId) return;

      if (!payload || typeof payload !== 'object') return;

      const sensor = String((payload as any).sensor ?? '').trim() || 'SENSOR';
      const severity = String((payload as any).severity ?? (payload as any).status ?? '').trim().toLowerCase();
      const msg = String((payload as any).message ?? '').trim();
      const value = (payload as any).value;
      const threshold = (payload as any).threshold;

      const title = severity ? `${sensor.toUpperCase()} ${severity.toUpperCase()}` : `${sensor.toUpperCase()} ALERT`;
      const subtitle = msg || String((payload as any).type ?? 'Alert');
      const detailParts: string[] = [];
      if (value !== undefined) detailParts.push(`value=${String(value)}`);
      if (threshold !== undefined) detailParts.push(`threshold=${String(threshold)}`);
      if ((payload as any).device) detailParts.push(`device=${String((payload as any).device)}`);

      // Route alerts to Notifications (so the client shows toast popups).
      const sev = severity;
      const tone = sev === 'critical' || sev === 'danger' || sev === 'alarm' ? 'danger' : sev === 'warning' ? 'warning' : 'info';
      const icon = tone === 'danger' ? 'alert' : 'info';
      const messageText = detailParts.length ? `${subtitle} (${detailParts.join(' | ')})` : subtitle;

      try {
        await this.notificationsService.createForUser(userId, {
          type: 'alerts',
          tone,
          icon,
          title,
          message: messageText,
          urgent: tone === 'danger',
        });
      } catch {
        // Ignore notification errors.
      }

      return;
    }

    // --- DHT22 (paired temperature+humidity) ---
    const dht = parseDhtUpdate({ topic, payload, packet });
    if (dht?.ignore) return;
    if (dht) {
      const { userId, room } = this.resolveIngestTarget({ defaultUserId, topic, payload });
      if (!userId || !room) return;

      const title = (process.env.MQTT_DHT_TITLE ?? 'DHT22').trim() || 'DHT22';
      const key = `${room}::${title}`;

      const now = Date.now();
      const state = this.dhtState.get(key) ?? {};

      if (dht.metric === 'temperature') {
        state.temperatureC = dht.value;
        state.temperatureAtMs = now;
        state.temperatureStatus = dht.status;
      } else {
        state.humidityPct = dht.value;
        state.humidityAtMs = now;
        state.humidityStatus = dht.status;
      }

      this.dhtState.set(key, state);

      const pairWindowMs = parseInt(process.env.MQTT_DHT_PAIR_WINDOW_MS ?? '', 10);
      const maxDeltaMs = Number.isFinite(pairWindowMs) && pairWindowMs > 0 ? pairWindowMs : 2 * 60_000;

      if (
        typeof state.temperatureC !== 'number' ||
        typeof state.humidityPct !== 'number' ||
        typeof state.temperatureAtMs !== 'number' ||
        typeof state.humidityAtMs !== 'number'
      ) {
        return;
      }

      const latestAt = Math.max(state.temperatureAtMs, state.humidityAtMs);
      const earliestAt = Math.min(state.temperatureAtMs, state.humidityAtMs);
      if (latestAt - earliestAt > maxDeltaMs) {
        return;
      }

      const lastIngestAt = state.lastIngestAtMs ?? 0;
      if (!(state.temperatureAtMs > lastIngestAt && state.humidityAtMs > lastIngestAt)) {
        return;
      }

      state.lastIngestAtMs = now;
      this.dhtState.set(key, state);

      await this.devicesService.upsertTemperatureHumidityForUser(userId, {
        title,
        room,
        temperatureC: state.temperatureC,
        humidityPct: state.humidityPct,
      });

      // Notify only once per abnormal episode (until it returns to normal).
      // Keep wording simple for end users (no sensor model names).
      const tempCritical = state.temperatureStatus === 'critical';
      const humCritical = state.humidityStatus === 'critical';
      const tempWarning = !tempCritical && state.temperatureStatus === 'warning';
      const humWarning = !humCritical && state.humidityStatus === 'warning';

      const isCritical = tempCritical || humCritical;
      const isWarning = !isCritical && (tempWarning || humWarning);
      const level: AlertLevel = isCritical ? 'critical' : isWarning ? 'warning' : 'normal';

      const titleText =
        tempCritical || tempWarning
          ? 'Température élevée'
          : humCritical || humWarning
            ? 'Humidité anormale'
            : 'Alerte climatique';

      await this.maybeNotify(userId, room, 'climate', level, {
        type: 'alerts',
        tone: level === 'critical' ? 'danger' : level === 'warning' ? 'warning' : 'info',
        icon: 'thermo',
        title: titleText,
        message: `${room} → Temp: ${state.temperatureC.toFixed(1)}°C | Hum: ${state.humidityPct.toFixed(1)}%`,
        urgent: level === 'critical',
      });

      return;
    }

    // --- MQ2 (single message) ---
    const mq2 = parseMq2Reading({ topic, payload, packet });
    if (mq2) {
      const { userId, room } = this.resolveIngestTarget({ defaultUserId, topic, payload });
      if (!userId || !room) return;

      const title = (process.env.MQTT_MQ2_TITLE ?? 'MQ2').trim() || 'MQ2';

      await this.devicesService.upsertGasForUser(userId, {
        title,
        room,
        gasValue: mq2.gasValue,
        gasDetected: mq2.gasDetected,
        gasLevel: mq2.gasLevel,
      });

      const level: AlertLevel = mq2.gasLevel === 'danger' ? 'danger' : mq2.gasLevel === 'warning' ? 'warning' : 'normal';

      // Simple user-facing naming (no "MQ2" in the UI notification).
      await this.maybeNotify(userId, room, 'gas', level, {
        type: 'alerts',
        tone: level === 'danger' ? 'danger' : level === 'warning' ? 'warning' : 'info',
        icon: 'bolt',
        title: level === 'danger' ? 'Gaz dangereux' : level === 'warning' ? 'Gaz détecté' : 'Gaz',
        message: `${room} → Niveau de gaz: ${Math.round(mq2.gasValue)}`,
        urgent: level === 'danger',
      });

      return;
    }

    // --- Flame (single message) ---
    const flame = parseFlameReading({ topic, payload, packet });
    if (flame) {
      const { userId, room } = this.resolveIngestTarget({ defaultUserId, topic, payload });
      if (!userId) return;

      if (room) {
        const title = (process.env.MQTT_FLAME_TITLE ?? 'FLAME').trim() || 'FLAME';
        await this.devicesService.upsertFlameForUser(userId, {
          title,
          room,
          detected: flame.detected,
        });

        if (flame.detected) {
          await this.maybeNotify(userId, room, 'flame', 'critical', {
            type: 'security',
            tone: 'danger',
            icon: 'alert',
            title: 'Flamme détectée',
            message: `${room} → Danger: flamme détectée`,
            urgent: true,
          });
        } else {
          // Reset state so a future detection re-notifies.
          this.lastAlertLevel.set(this.alertKey(userId, room, 'flame'), 'normal');
        }
      }

      return;
    }

    // --- Lamp (single message) ---
    if (topic.endsWith('/lamp')) {
      const { userId, room } = this.resolveIngestTarget({ defaultUserId, topic, payload });
      if (userId && room) {
        const on = payload?.lamp === 'ON' || payload?.lamp === true || payload?.state === 'ON';
        const color = typeof payload?.color === 'string' ? payload.color : undefined;
        await this.devicesService.upsertLampForUser(userId, {
          title: 'Lampe',
          room,
          on,
          color,
        });
      }
      return;
    }

    // --- PIR / Motion sensors ---
    if (topic.includes('/pir')) {
      const { userId, room } = this.resolveIngestTarget({ defaultUserId, topic, payload });
      if (userId && room) {
        const isMotion = payload?.status === 'motion' || payload?.value === 1 || payload?.state === 1;
        const sensor = String(payload?.sensor ?? 'PIR').toUpperCase();
        if (isMotion) {
          await this.maybeNotify(userId, room, `pir_${sensor}`, 'warning', {
            type: 'security',
            tone: 'warning',
            icon: 'shield',
            title: 'Mouvement détecté',
            message: `${room} → Mouvement détecté (${sensor})`,
            urgent: false,
          });
        } else {
          this.lastAlertLevel.set(this.alertKey(userId, room, `pir_${sensor}`), 'normal');
        }
      }
      return;
    }
  }

  private alertKey(userId: string, room: string, kind: string): string {
    return `${userId}::${room}::${kind}`;
  }

  private async maybeNotify(
    userId: string,
    room: string,
    kind: string,
    level: AlertLevel,
    notification: {
      type: 'security' | 'alerts' | 'system' | 'other';
      tone: 'success' | 'warning' | 'info' | 'danger';
      icon: 'info' | 'drop' | 'check' | 'alert' | 'bolt' | 'camera' | 'thermo' | 'shield' | 'tip';
      title: string;
      message: string;
      urgent?: boolean;
    },
  ): Promise<void> {
    if (!userId || !room) return;

    const key = this.alertKey(userId, room, kind);
    const prev = this.lastAlertLevel.get(key) ?? 'normal';

    // One-notification-per-episode policy:
    // - when returning to normal => reset
    // - when going from normal => abnormal => notify once
    // - while already abnormal (even if it oscillates/escalates) => do not spam
    if (level === 'normal') {
      this.lastAlertLevel.set(key, 'normal');
      return;
    }

    if (prev !== 'normal') {
      this.lastAlertLevel.set(key, level);
      return;
    }

    this.lastAlertLevel.set(key, level);
    try {
      await this.notificationsService.createForUser(userId, notification);
    } catch {
      // Ignore notification errors.
    }
  }

  private resolveIngestTarget(input: {
    defaultUserId: string;
    topic: string;
    payload: any;
  }): { userId: string; room: string } {
    const allowUserIdFromTopic = parseBoolean(process.env.MQTT_INGEST_USER_ID_FROM_TOPIC);
    const allowUserIdFromPayload = parseBoolean(process.env.MQTT_INGEST_USER_ID_FROM_PAYLOAD);

    const parts = splitTopic(input.topic);

    // Room is usually the segment before the metric, for topics like smarthome/<room>/<metric>.
    // For topics like smarthome/alerts (no room segment), keep it empty.
    const roomRaw = parts.length >= 3 ? String(parts[parts.length - 2] ?? '').trim() : '';
    const room = roomRaw ? normalizeRoomKey(roomRaw) : '';

    // Default/fixed user id.
    let userId = (input.defaultUserId ?? '').trim();

    // Dynamic: topic format `.../<userId>/<room>/<metric>` (ex: smarthome/USER123/salon/temperature)
    if (!userId && allowUserIdFromTopic && parts.length >= 4) {
      const candidate = String(parts[parts.length - 3] ?? '').trim();
      if (candidate && candidate !== 'smarthome') {
        userId = candidate;
      }
    }

    // Dynamic: payload field `userId`
    if (!userId && allowUserIdFromPayload) {
      const candidate = String(input.payload?.userId ?? '').trim();
      if (candidate) userId = candidate;
    }

    // Optional allowlist for safety.
    const allowed = parseCsvSet(process.env.MQTT_INGEST_ALLOWED_USER_IDS);
    if (allowed.size > 0 && userId && !allowed.has(userId)) {
      return { userId: '', room: '' };
    }

    // If using dynamic user ids without allowlist, emit a one-time warning.
    if (
      !allowed.size &&
      !input.defaultUserId &&
      (allowUserIdFromTopic || allowUserIdFromPayload) &&
      !this.warnedAboutDynamicAllowlist
    ) {
      this.warnedAboutDynamicAllowlist = true;
      this.logger.warn(
        'Dynamic MQTT userId resolution is enabled without MQTT_INGEST_ALLOWED_USER_IDS; consider setting an allowlist to avoid accidental cross-user writes on the broker',
      );
    }

    return { userId: userId.trim(), room: room.trim() };
  }
}

function envOrUndefined(key: string): string | undefined {
  const v = (process.env[key] ?? '').trim();
  return v ? v : undefined;
}

function buildMqttUrl(): string {
  const explicitUrl = (process.env.MQTT_URL ?? '').trim();
  if (explicitUrl) return explicitUrl;

  const host = (process.env.MQTT_HOST ?? 'localhost').trim() || 'localhost';
  const port = (process.env.MQTT_PORT ?? '1883').trim() || '1883';

  return `mqtt://${host}:${port}`;
}

function parseBoolean(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function parseJsonPayload(message: Buffer): any {
  const text = message.toString('utf8').trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // If it's not JSON, keep the raw text.
    return text;
  }
}

function splitTopic(topic: string): string[] {
  return String(topic ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseCsvSet(value: unknown): Set<string> {
  const text = String(value ?? '').trim();
  if (!text) return new Set();
  return new Set(
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function normalizeRoomKey(room: string): string {
  const raw = (room ?? '').trim();
  const key = raw.toLowerCase();

  // Small convenience mapping for common French room names.
  const map: Record<string, string> = {
    salon: 'living',
    sejour: 'living',
    séjour: 'living',
    cuisine: 'kitchen',
    chambre: 'bedroom',
    sdb: 'bathroom',
    salledebain: 'bathroom',
    salle_de_bain: 'bathroom',
    bureau: 'office',
  };

  return map[key] ?? raw;
}

function redactUrl(url: string): string {
  // Avoid leaking credentials in logs.
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = u.username ? '***' : '';
      u.password = u.password ? '***' : '';
    }
    return u.toString();
  } catch {
    return url;
  }
}
