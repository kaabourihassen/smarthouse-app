import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of, tap } from 'rxjs';
import type { RecordingItem, RecordingMode, RecordingRecord } from '../interfaces/recording.interface';

const API_URL = '/api/recordings';
const OPTS = { withCredentials: true };

export type StartRecordingResponse = {
  sessionId: string;
  startedAt: string;
};

function modeLabel(mode: RecordingMode): string {
  if (mode === 'detection') return 'Détection';
  if (mode === 'manual') return 'Manuel';
  return 'Programmé';
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${two(m)}:${two(r)}`;
}

function sizeLabel(bytes: number): string {
  const b = Math.max(0, Number(bytes) || 0);
  const mb = b / (1024 * 1024);
  const gb = b / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  if (mb >= 1) return `${Math.round(mb)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function isRecord(value: any): value is RecordingRecord {
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.cameraId === 'string' &&
    (value.mode === 'detection' || value.mode === 'manual' || value.mode === 'scheduled') &&
    typeof value.title === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.durationSeconds === 'number' &&
    typeof value.sizeBytes === 'number'
  );
}

function toItem(r: RecordingRecord): RecordingItem {
  const dt = new Date(r.startedAt);
  const dateLabel = Number.isNaN(dt.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  const timeLabel = Number.isNaN(dt.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(dt);

  return {
    ...r,
    modeLabel: modeLabel(r.mode),
    durationLabel: durationLabel(r.durationSeconds),
    dateLabel,
    timeLabel,
    sizeLabel: sizeLabel(r.sizeBytes),
  };
}

@Injectable({ providedIn: 'root' })
export class RecordingsService {
  private readonly http = inject(HttpClient);
  private readonly serverRecords = signal<RecordingRecord[]>([]);

  readonly recordings = computed<readonly RecordingItem[]>(() => {
    const safe = this.serverRecords();
    return Array.isArray(safe) ? safe.filter(isRecord).map(toItem) : [];
  });

  refresh(filter: { mode?: RecordingMode; cameraId?: string } = {}): void {
    const params: string[] = [];
    if (filter.mode) params.push(`mode=${encodeURIComponent(filter.mode)}`);
    if (filter.cameraId) params.push(`cameraId=${encodeURIComponent(filter.cameraId)}`);
    const url = params.length ? `${API_URL}?${params.join('&')}` : API_URL;

    this.http
      .get<RecordingRecord[]>(url, OPTS)
      .pipe(
        tap((list) => this.serverRecords.set(Array.isArray(list) ? list.filter(isRecord) : [])),
        catchError(() => {
          this.serverRecords.set([]);
          return of([] as RecordingRecord[]);
        }),
      )
      .subscribe();
  }

  startRecording(input: {
    cameraId: string;
    mode: RecordingMode;
    title?: string;
    roomLabel?: string;
    streamUrl?: string;
  }) {
    return this.http.post<StartRecordingResponse>(`${API_URL}/start`, input, OPTS);
  }

  stopRecording(sessionId: string) {
    return this.http.post<RecordingRecord>(`${API_URL}/stop`, { sessionId }, OPTS).pipe(
      tap(() => this.refresh()),
      map((rec) => (isRecord(rec) ? rec : null)),
    );
  }
}
