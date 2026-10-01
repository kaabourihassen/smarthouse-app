import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, tap } from 'rxjs';
import { AuthService } from './auth.service';
import type { HistoryItem, HistoryRecord } from '../interfaces/history.interface';

const API_URL = '/api/history';
const OPTS = { withCredentials: true };

function categoryLabel(category: HistoryRecord['category']): string {
  switch (category) {
    case 'devices':
      return 'Appareils';
    case 'security':
      return 'Sécurité';
    case 'energy':
      return 'Énergie';
    case 'automation':
      return 'Automatisation';
    case 'system':
      return 'Système';
    case 'users':
      return 'Utilisateurs';
  }
}

function formatTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / (1000 * 60)));
  if (diffMin < 60) return `Il y a ${diffMin}min`;

  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;

  const diffD = Math.round(diffH / 24);
  return `Il y a ${diffD}j`;
}

function toItem(r: HistoryRecord): HistoryItem {
  return {
    ...r,
    categoryLabel: categoryLabel(r.category),
    timeLabel: formatTimeLabel(r.createdAt),
  };
}

function isRecord(value: any): value is HistoryRecord {
  return (
    !!value &&
    typeof value.id === 'string' &&
    (value.category === 'devices' ||
      value.category === 'security' ||
      value.category === 'energy' ||
      value.category === 'automation' ||
      value.category === 'system' ||
      value.category === 'users') &&
    typeof value.title === 'string' &&
    typeof value.subtitle === 'string' &&
    typeof value.icon === 'string' &&
    typeof value.createdAt === 'string'
  );
}

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly serverRecords = signal<HistoryRecord[]>([]);

  constructor() {
    this.authService.currentUser$
      .pipe(
        takeUntilDestroyed(),
        tap((user) => {
          if (!user) {
            this.serverRecords.set([]);
            return;
          }
          this.refresh();
        }),
      )
      .subscribe();
  }

  readonly historyList = computed<readonly HistoryItem[]>(() => {
    const safe = this.serverRecords().filter(isRecord).map(toItem);
    return safe;
  });

  refresh(): void {
    this.http
      .get<HistoryRecord[]>(API_URL, OPTS)
      .pipe(
        tap((list) => {
          const safe = Array.isArray(list) ? list.filter(isRecord) : [];
          this.serverRecords.set(safe);
        }),
        catchError(() => {
          this.serverRecords.set([]);
          return of([] as HistoryRecord[]);
        }),
      )
      .subscribe();
  }
}
