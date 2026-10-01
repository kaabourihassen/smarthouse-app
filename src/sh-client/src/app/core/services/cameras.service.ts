import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';
import type { CameraRecord } from '../interfaces/camera.interface';

const API_URL = '/api/cameras';
const OPTS = { withCredentials: true };

function isRecord(value: any): value is CameraRecord {
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.status === 'online' || value.status === 'offline') &&
    typeof value.detectionEnabled === 'boolean' &&
    typeof value.qualityLabel === 'string' &&
    typeof value.storageTotalGb === 'number' &&
    typeof value.createdAt === 'string'
  );
}

@Injectable({ providedIn: 'root' })
export class CamerasService {
  private readonly http = inject(HttpClient);
  private readonly serverRecords = signal<CameraRecord[]>([]);

  readonly cameras = computed<readonly CameraRecord[]>(() => {
    const list = this.serverRecords();
    return Array.isArray(list) ? list.filter(isRecord) : [];
  });

  refresh(): void {
    this.http
      .get<CameraRecord[]>(API_URL, OPTS)
      .pipe(
        tap((list) => this.serverRecords.set(Array.isArray(list) ? list.filter(isRecord) : [])),
        catchError(() => {
          this.serverRecords.set([]);
          return of([] as CameraRecord[]);
        }),
      )
      .subscribe();
  }
}
