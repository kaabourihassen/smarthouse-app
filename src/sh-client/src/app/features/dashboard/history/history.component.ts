import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { HistoryCategory } from '../../../core/interfaces/history.interface';
import { AuthService } from '../../../core/services/auth.service';
import { HistoryService } from '../../../core/services/history.service';
import { NotificationsService } from '../../../core/services/notifications.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent {
  private readonly authService = inject(AuthService);
  private readonly historyService = inject(HistoryService);
  private readonly notificationsService = inject(NotificationsService);

  readonly currentUser$ = this.authService.currentUser$;
  readonly unreadNotificationsCount = this.notificationsService.unreadCount;

  readonly isDarkSidebar = signal(true);

  readonly selectedCategory = signal<HistoryCategory>('all');
  readonly items = this.historyService.historyList;

  readonly counts = computed(() => {
    const list = this.items();
    const by = {
      all: list.length,
      devices: list.filter((e) => e.category === 'devices').length,
      security: list.filter((e) => e.category === 'security').length,
      energy: list.filter((e) => e.category === 'energy').length,
      automation: list.filter((e) => e.category === 'automation').length,
      system: list.filter((e) => e.category === 'system').length,
      users: list.filter((e) => e.category === 'users').length,
    } as const;
    return by;
  });

  readonly filtered = computed(() => {
    const category = this.selectedCategory();
    const list = this.items();
    if (category === 'all') return list;
    return list.filter((e) => e.category === category);
  });

  readonly stats = computed(() => {
    const list = this.items();
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    const day = (now.getDay() + 6) % 7; // Monday=0
    startOfWeek.setDate(now.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const today = list.filter((e) => new Date(e.createdAt) >= startOfDay).length;
    const week = list.filter((e) => new Date(e.createdAt) >= startOfWeek).length;
    const month = list.filter((e) => new Date(e.createdAt) >= startOfMonth).length;

    // Most frequent action: pick the most common first word of the title.
    const freq = new Map<string, number>();
    for (const e of list) {
      const key = (e.title.split(' ')[0] ?? '').trim();
      if (!key) continue;
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }

    let most = '';
    let mostCount = 0;
    for (const [k, v] of freq) {
      if (v > mostCount) {
        most = k;
        mostCount = v;
      }
    }

    const mostPct = list.length ? Math.round((mostCount / list.length) * 100) : 0;
    return { today, week, month, most, mostPct } as const;
  });

  constructor() {
    this.historyService.refresh();

    // Simple "real-time" mode: refresh every 5s while this page is active.
    interval(5000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.historyService.refresh());
  }

  logout(): void {
    this.authService.logout();
  }

  setCategory(category: HistoryCategory): void {
    this.selectedCategory.set(category);
  }

  resetFilters(): void {
    this.selectedCategory.set('all');
  }
}
