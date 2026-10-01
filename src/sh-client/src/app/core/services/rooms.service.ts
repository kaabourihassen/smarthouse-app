import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of, tap } from 'rxjs';

export type RoomKey = string;
export type Room = { key: RoomKey; label: string };

const STORAGE_KEY = 'sh_rooms_v1';
const API_URL = '/api/rooms';
const OPTS = { withCredentials: true };

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function loadRooms(): Room[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    const rooms: Room[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const key = (item as any).key;
      const label = (item as any).label;
      if (typeof key !== 'string' || typeof label !== 'string') continue;
      const safeKey = key.trim();
      const safeLabel = label.trim();
      if (!safeKey || !safeLabel) continue;
      rooms.push({ key: safeKey, label: safeLabel });
    }

    return rooms.length ? rooms : null;
  } catch {
    return null;
  }
}

function saveRooms(rooms: Room[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(rooms));
  } catch {
    // ignore
  }
}

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly http = inject(HttpClient);

  private readonly defaultRooms: Room[] = [
    { key: 'living', label: 'Living room' },
    { key: 'kitchen', label: 'Kitchen' },
    { key: 'bedroom', label: 'Bedroom' },
    { key: 'bathroom', label: 'Bathroom' },
    { key: 'office', label: 'Office' },
  ];

  // Server is source-of-truth. localStorage is only a fallback cache.
  private readonly serverRooms = signal<Room[] | null>(null);
  private readonly cachedRooms = signal<Room[]>(loadRooms() ?? []);

  constructor() {
    this.refresh();
  }

  readonly roomsList = computed(() => {
    const fromServer = this.serverRooms();
    const base = fromServer && fromServer.length ? fromServer : [...this.defaultRooms, ...this.cachedRooms()];
    const merged = base;
    const seen = new Set<string>();

    const deduped = merged.filter((room) => {
      const key = room.key?.trim();
      const label = room.label?.trim();
      if (!key || !label) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const defaultOrder = new Map<string, number>(this.defaultRooms.map((r, i) => [r.key, i] as const));

    return [...deduped].sort((a, b) => {
      const ai = defaultOrder.get(a.key) ?? Number.POSITIVE_INFINITY;
      const bi = defaultOrder.get(b.key) ?? Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;

      const aLabel = a.label.trim().toLowerCase();
      const bLabel = b.label.trim().toLowerCase();
      if (aLabel !== bLabel) return aLabel.localeCompare(bLabel);
      return a.key.localeCompare(b.key);
    });
  });

  refresh(): void {
    this.http
      .get<Room[]>(API_URL, OPTS)
      .pipe(
        tap((rooms) => {
          const safe = Array.isArray(rooms) ? rooms.filter(isRoom) : [];
          this.serverRooms.set(safe);
          saveRooms(safe);
          this.cachedRooms.set(safe);
        }),
        catchError(() => {
          // Keep fallback cache.
          this.serverRooms.set(null);
          return of([] as Room[]);
        }),
      )
      .subscribe();
  }

  async addRoom(name: string): Promise<Room | null> {
    const label = name.trim();
    const key = slugify(label);
    if (!key || label.length < 2) return null;

    const exists = this.roomsList().some((r) => r.key === key);
    if (exists) return { key, label };

    try {
      const created = await firstValueFrom(
        this.http
          .post<Room | null>(API_URL, { name: label }, OPTS)
          .pipe(catchError(() => of(null))),
      );

      if (created && isRoom(created)) {
        // Refresh full list to include defaults ensured by server.
        this.refresh();
        return created;
      }
    } catch {
      // ignore
    }

    // Fallback: keep UI working even if API is down.
    const next = [...this.cachedRooms(), { key, label }];
    this.cachedRooms.set(next);
    saveRooms(next);
    return { key, label };
  }

  labelFor(key: RoomKey): string {
    return this.roomsList().find((r) => r.key === key)?.label ?? key;
  }
}

function isRoom(value: any): value is Room {
  return !!value && typeof value.key === 'string' && typeof value.label === 'string';
}
