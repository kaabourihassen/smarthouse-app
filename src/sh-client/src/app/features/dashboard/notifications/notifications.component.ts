import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import type { NotificationCategory } from '../../../core/interfaces/notification.interface';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationsService } from '../../../core/services/notifications.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly notificationsService = inject(NotificationsService);

  readonly isDarkSidebar = signal(true);

  readonly selectedCategory = signal<NotificationCategory>('all');

  readonly notifications = this.notificationsService.notificationsList;

  readonly unreadCount = computed(() =>
    this.notifications().reduce((sum, n) => sum + (n.status === 'unread' ? 1 : 0), 0),
  );

  readonly counts = computed(() => {
    const list = this.notifications();
    const security = list.filter((n) => n.type === 'security').length;
    const alerts = list.filter((n) => n.type === 'alerts').length;
    const system = list.filter((n) => n.type === 'system').length;
    return {
      all: list.length,
      security,
      alerts,
      system,
    } as const;
  });

  readonly filteredNotifications = computed(() => {
    const category = this.selectedCategory();
    const list = this.notifications();
    if (category === 'all') return list;
    return list.filter((n) => n.type === category);
  });

  ngOnInit(): void {
    void this.notificationsService.markAllAsRead();
  }

  setCategory(category: NotificationCategory): void {
    this.selectedCategory.set(category);
  }

  markAllAsRead(): void {
    void this.notificationsService.markAllAsRead();
  }

  logout(): void {
    this.authService.logout();
  }
}
