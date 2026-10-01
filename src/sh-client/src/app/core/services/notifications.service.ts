import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of, tap } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { AuthService } from './auth.service';
import type { NotificationItem, NotificationRecord } from '../interfaces/notification.interface';

const API_URL = '/api/notifications';
const OPTS = { withCredentials: true };

const SENSOR_LABELS: Record<string, string> = {
  mq2: 'Gaz / fumée',
  dht22: 'Température / humidité',
  flame: 'Flamme',
};

function detectSensorLabel(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  for (const key of Object.keys(SENSOR_LABELS)) {
    if (new RegExp(`(^|[^a-z0-9])${key}([^a-z0-9]|$)`, 'i').test(normalized)) {
      return SENSOR_LABELS[key];
    }
  }
  return null;
}

function detectSeverity(input: string): 'critical' | 'warning' | 'info' | null {
  const s = input.trim().toLowerCase();
  const has = (token: string) => new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'i').test(s);
  if (has('critical') || has('critique')) return 'critical';
  if (has('warning') || has('warn') || has('attention')) return 'warning';
  if (has('info')) return 'info';
  return null;
}

function normalizeFrench(text: string): string {
  return text
    .replace(/\bfumee\b/gi, 'fumée')
    .replace(/\bdetecte\b/gi, 'détecté')
    .replace(/\belevee\b/gi, 'élevée')
    .replace(/\bhumidite\b/gi, 'humidité')
    .replace(/\btemperature\b/gi, 'température');
}

function simplifyTitle(r: NotificationRecord): string {
  const rawTitle = r.title?.trim() ?? '';
  if (!rawTitle) return rawTitle;

  const sensor = detectSensorLabel(rawTitle) ?? detectSensorLabel(r.message ?? '');
  const severity = detectSeverity(rawTitle) ?? detectSeverity(r.message ?? '');

  const isCritical = r.tone === 'danger' || r.urgent || severity === 'critical';
  const isWarning = r.tone === 'warning' || severity === 'warning';

  // Only rewrite when the payload looks like an IoT/sensor technical notification.
  if (!sensor && !/(\bvalue\s*=|\bthreshold\s*=|\bdevice\s*=)/i.test(r.message ?? '')) {
    return normalizeFrench(rawTitle);
  }

  const prefix = isCritical ? 'Alerte critique' : isWarning ? 'Alerte' : 'Info';
  return sensor ? `${prefix} ${sensor}` : prefix;
}

function simplifyMessage(r: NotificationRecord): string {
  const raw = (r.message ?? '').trim();
  if (!raw) return raw;

  let msg = raw;

  // Drop common technical prefixes (the title already conveys severity).
  msg = msg.replace(/^\s*(attention|warning|critical|danger\s+critique|alerte)\s*[:\-]\s*/i, '');

  // Remove parenthesized blocks that contain key=value technical metadata.
  msg = msg.replace(/\(([^)]*)\)/g, (full, inner) => {
    return /(\bvalue\s*=|\bthreshold\s*=|\bdevice\s*=)/i.test(String(inner)) ? '' : full;
  });

  // Remove inline key=value metadata even if not in parentheses.
  msg = msg.replace(/\b(value|threshold|device)\s*=\s*[^|,\)]+/gi, '');
  msg = msg.replace(/\s*\|\s*/g, ' ');

  msg = normalizeFrench(msg);
  msg = msg.replace(/\s{2,}/g, ' ').trim();
  msg = msg.replace(/^[\s:;\-]+/, '').trim();

  return msg;
}

function formatTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace('.', '');
}

function toItem(r: NotificationRecord): NotificationItem {
  return {
    ...r,
    title: simplifyTitle(r),
    message: simplifyMessage(r),
    timeLabel: formatTimeLabel(r.createdAt),
  };
}

function isRecord(value: any): value is NotificationRecord {
  return (
    !!value &&
    typeof value.id === 'string' &&
    (value.type === 'security' || value.type === 'alerts' || value.type === 'system' || value.type === 'other') &&
    (value.tone === 'success' || value.tone === 'warning' || value.tone === 'info' || value.tone === 'danger') &&
    typeof value.icon === 'string' &&
    typeof value.title === 'string' &&
    typeof value.message === 'string' &&
    typeof value.urgent === 'boolean' &&
    (value.status === 'unread' || value.status === 'read') &&
    typeof value.createdAt === 'string'
  );
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly serverRecords = signal<NotificationRecord[]>([]);
  private socket: Socket | null = null;

  private readonly toastItems = signal<NotificationItem[]>([]);
  readonly toastList = computed<readonly NotificationItem[]>(() => this.toastItems());

  readonly unreadCount = computed(() =>
    this.serverRecords().reduce((sum, n) => sum + (n.status === 'unread' ? 1 : 0), 0),
  );

  constructor() {
    // Refresh + connect whenever a valid session becomes available.
    // This avoids a one-time 401 on startup leaving the page "static".
    this.authService.currentUser$
      .pipe(
        takeUntilDestroyed(),
        tap((user) => {
          if (!user) {
            this.disconnectSocket();
            this.serverRecords.set([]);
            this.toastItems.set([]);
            return;
          }
          this.refresh();
          this.connectSocket();
        }),
      )
      .subscribe();
  }

  readonly notificationsList = computed<readonly NotificationItem[]>(() => {
    const safe = this.serverRecords().filter(isRecord).map(toItem);
    return safe;
  });

  refresh(): void {
    this.http
      .get<NotificationRecord[]>(API_URL, OPTS)
      .pipe(
        tap((list) => {
          const safe = Array.isArray(list) ? list.filter(isRecord) : [];
          this.serverRecords.set(safe);
        }),
        catchError(() => {
          this.serverRecords.set([]);
          return of([] as NotificationRecord[]);
        }),
      )
      .subscribe();
  }

  async markAllAsRead(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<{ updated: number }>(`${API_URL}/read-all`, {}, OPTS));
    } catch {
      // ignore
    }

    // Refresh to stay source-of-truth.
    this.refresh();
  }

  async markRead(id: string): Promise<void> {
    const safeId = id.trim();
    if (!safeId) return;

    try {
      const updated = await firstValueFrom(
        this.http
          .patch<NotificationRecord>(`${API_URL}/${encodeURIComponent(safeId)}/read`, {}, OPTS)
          .pipe(catchError(() => of(null as unknown as NotificationRecord))),
      );

      if (updated && isRecord(updated)) {
        this.upsertRecord(updated);
        return;
      }
    } catch {
      // ignore
    }

    this.refresh();
  }

  dismissToast(id: string): void {
    const safeId = id.trim();
    if (!safeId) return;
    this.toastItems.set(this.toastItems().filter((t) => t.id !== safeId));
  }

  private connectSocket(): void {
    if (this.socket) return;

    // Uses dev-proxy for /socket.io (see proxy.conf.json). In production, this should be served from the API origin.
    const socket = io('/notifications', {
      path: '/socket.io',
      withCredentials: true,
    });

    socket.on('notification:new', (payload: unknown) => {
      if (!isRecord(payload)) return;
      this.upsertRecord(payload, { prepend: true });
      this.pushToast(payload);
    });

    socket.on('notification:updated', (payload: unknown) => {
      if (!isRecord(payload)) return;
      this.upsertRecord(payload);
    });

    socket.on('notifications:readAll', () => {
      // Keep source-of-truth consistent.
      this.refresh();
    });

    socket.on('disconnect', () => {
      // no-op; socket.io will auto-reconnect
    });

    this.socket = socket;
  }

  private disconnectSocket(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {
      // ignore
    }
  }

  private upsertRecord(record: NotificationRecord, opts: { prepend?: boolean } = {}): void {
    const list = this.serverRecords();
    const idx = list.findIndex((n) => n.id === record.id);

    if (idx >= 0) {
      const next = list.slice();
      next[idx] = record;
      this.serverRecords.set(next);
      return;
    }

    const next = opts.prepend ? [record, ...list] : [...list, record];
    this.serverRecords.set(next);
  }

  private pushToast(record: NotificationRecord): void {
    const item = toItem(record);
    this.toastItems.set([item, ...this.toastItems()].slice(0, 4));

    // Auto-dismiss after a short delay.
    const toastId = item.id;
    setTimeout(() => this.dismissToast(toastId), 5000);
  }
}
