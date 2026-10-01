import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, firstValueFrom, map, of, switchMap, tap, timer } from 'rxjs';
import { AuthService } from './auth.service';
import type {
  CreateDevicePayload,
  Device,
  DeviceIcon,
  DeviceTimelinePoint,
  DeviceType,
  UpdateDevicePayload,
} from '../interfaces/device.interface';

const API_URL = '/api/devices';
const OPTS = { withCredentials: true };
const POLL_MS = 5000;

@Injectable({ providedIn: 'root' })
export class DevicesService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly serverDevices = signal<Device[]>([]);

  constructor() {
    // Poll while authenticated so IoT updates show up without a manual refresh.
    this.authService.currentUser$
      .pipe(
        takeUntilDestroyed(),
        map((user) => user?.id ?? null),
        distinctUntilChanged(),
        switchMap((userId) => {
          if (!userId) {
            this.serverDevices.set([]);
            return of(null);
          }

          return timer(0, POLL_MS).pipe(
            switchMap(() =>
              this.http.get<Device[]>(API_URL, OPTS).pipe(catchError(() => of(null as unknown as Device[]))),
            ),
            tap((devices) => {
              if (!devices) return;
              const safe = Array.isArray(devices) ? devices.filter(isDevice) : [];
              this.serverDevices.set(safe);
            }),
          );
        }),
      )
      .subscribe();
  }

  readonly devicesList = computed(() => {
    const safe = this.serverDevices().filter(isDevice);
    return safe;
  });

  refresh(): void {
    this.http
      .get<Device[]>(API_URL, OPTS)
      .pipe(
        tap((devices) => {
          const safe = Array.isArray(devices) ? devices.filter(isDevice) : [];
          this.serverDevices.set(safe);
        }),
        catchError(() => {
          this.serverDevices.set([]);
          return of([] as Device[]);
        }),
      )
      .subscribe();
  }

  async addDevice(payload: CreateDevicePayload): Promise<Device | null> {
    const title = payload.title.trim();
    const room = payload.room.trim();
    if (title.length < 2 || !room) return null;

    try {
      const created = await firstValueFrom(
        this.http
          .post<Device>(API_URL, { ...payload, title, room }, OPTS)
          .pipe(catchError(() => of(null as unknown as Device))),
      );

      if (created && isDevice(created)) {
        this.upsertLocal(created);
        return created;
      }
    } catch {
      // ignore
    }

    return null;
  }

  async updateDevice(id: string, patch: UpdateDevicePayload): Promise<Device | null> {
    const current = this.devicesList().find((d) => d.id === id);
    if (!current) return null;

    try {
      const updated = await firstValueFrom(
        this.http
          .patch<Device>(`${API_URL}/${encodeURIComponent(id)}`, patch, OPTS)
          .pipe(catchError(() => of(null as unknown as Device))),
      );

      if (updated && isDevice(updated)) {
        this.upsertLocal(updated);
        return updated;
      }
    } catch {
      // ignore
    }

    this.refresh();
    return null;
  }

  async deleteDevice(id: string): Promise<boolean> {
    const current = this.devicesList().find((d) => d.id === id);
    if (!current) return false;

    try {
      const res = await firstValueFrom(
        this.http
          .delete<{ ok: boolean }>(`${API_URL}/${encodeURIComponent(id)}`, OPTS)
          .pipe(catchError(() => of(null as unknown as { ok: boolean }))),
      );

      if (res?.ok) {
        this.serverDevices.set(this.serverDevices().filter((d) => d.id !== id));
        return true;
      }
    } catch {
      // ignore
    }

    this.refresh();
    return false;
  }

  getDeviceTimeline(id: string, limit = 60): Promise<DeviceTimelinePoint[]> {
    const qs = `?limit=${encodeURIComponent(String(limit))}`;
    return firstValueFrom(
      this.http
        .get<{ points: DeviceTimelinePoint[] }>(`${API_URL}/${encodeURIComponent(id)}/timeline${qs}`, OPTS)
        .pipe(catchError(() => of({ points: [] as DeviceTimelinePoint[] }))),
    ).then((r) => (Array.isArray(r.points) ? r.points : []));
  }

  private upsertLocal(device: Device): void {
    const items = this.serverDevices();
    const existingIndex = items.findIndex((d) => d.id === device.id);

    // Preserve list order for updates to avoid UI elements jumping.
    if (existingIndex >= 0) {
      const next = items.slice();
      next[existingIndex] = device;
      this.serverDevices.set(next);
      return;
    }

    // New devices appear at the top.
    this.serverDevices.set([device, ...items]);
  }
}

function isDevice(value: any): value is Device {
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.room === 'string' &&
    (value.type === 'lighting' ||
      value.type === 'airConditioning' ||
      value.type === 'heating' ||
      value.type === 'fan' ||
      value.type === 'temperatureHumidity' ||
      value.type === 'gas' ||
      value.type === 'flame') &&
    typeof value.value === 'string' &&
    typeof value.consumptionKwh === 'number' &&
    (value.icon === 'wind' ||
      value.icon === 'bulb' ||
      value.icon === 'fan' ||
      value.icon === 'thermo' ||
      value.icon === 'flame') &&
    typeof value.on === 'boolean' &&
    typeof value.muted === 'boolean'
  );
}

