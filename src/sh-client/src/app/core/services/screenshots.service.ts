import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';
import type { ScreenshotItem, ScreenshotRecord } from '../interfaces/screenshot.interface';

const API_URL = '/api/screenshots';
const OPTS = { withCredentials: true };

function sizeLabel(bytes: number): string {
  const b = Math.max(0, Number(bytes) || 0);
  const mb = b / (1024 * 1024);
  if (mb >= 1) return `${Math.round(mb)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function isRecord(value: any): value is ScreenshotRecord {
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.cameraId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.capturedAt === 'string' &&
    typeof value.sizeBytes === 'number' &&
    typeof value.fileUrl === 'string'
  );
}

function toItem(r: ScreenshotRecord): ScreenshotItem {
  const dt = new Date(r.capturedAt);
  const dateLabel = Number.isNaN(dt.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  const timeLabel = Number.isNaN(dt.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(dt);

  return {
    ...r,
    dateLabel,
    timeLabel,
    sizeLabel: sizeLabel(r.sizeBytes),
  };
}

@Injectable({ providedIn: 'root' })
export class ScreenshotsService {
  private readonly http = inject(HttpClient);
  private readonly serverRecords = signal<ScreenshotRecord[]>([]);

  readonly screenshots = computed<readonly ScreenshotItem[]>(() => {
    const safe = this.serverRecords();
    return Array.isArray(safe) ? safe.filter(isRecord).map(toItem) : [];
  });

  refresh(filter: { cameraId?: string; limit?: number } = {}): void {
    const params: string[] = [];
    if (filter.cameraId) params.push(`cameraId=${encodeURIComponent(filter.cameraId)}`);
    if (typeof filter.limit === 'number') params.push(`limit=${encodeURIComponent(String(filter.limit))}`);
    const url = params.length ? `${API_URL}?${params.join('&')}` : API_URL;

    this.http
      .get<ScreenshotRecord[]>(url, OPTS)
      .pipe(
        tap((list) => this.serverRecords.set(Array.isArray(list) ? list.filter(isRecord) : [])),
        catchError(() => {
          this.serverRecords.set([]);
          return of([] as ScreenshotRecord[]);
        }),
      )
      .subscribe();
  }

  captureFromLive(payload: {
    cameraId: string;
    streamUrl?: string;
    title?: string;
    roomLabel?: string;
  }) {
    return this.http.post<ScreenshotRecord>(`${API_URL}/capture`, payload, OPTS);
  }

  captureFromClient(payload: {
    cameraId: string;
    imageBase64: string;
    title?: string;
    roomLabel?: string;
  }) {
    return this.http.post<ScreenshotRecord>(`${API_URL}/capture-client`, payload, OPTS);
  }
}
