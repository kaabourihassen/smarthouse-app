import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AdminService, type AdminSubscriptionRecord } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-subscriptions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-subscriptions.component.html',
  styleUrl: './admin-subscriptions.component.scss',
})
export class AdminSubscriptionsComponent {
  private readonly adminService = inject(AdminService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly subscriptions = signal<readonly AdminSubscriptionRecord[]>([]);

  readonly selectedSubscriptionId = signal<string>('');
  readonly selectedSubscription = computed(() => {
    const id = this.selectedSubscriptionId();
    if (!id) return null;
    return this.subscriptions().find((s) => s.id === id) ?? null;
  });

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      this.subscriptions.set(await this.adminService.listSubscriptions());
    } catch {
      this.errorMessage.set('Failed to load subscriptions.');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleSubscription(id: string): void {
    if (!id) return;
    this.selectedSubscriptionId.set(this.selectedSubscriptionId() === id ? '' : id);
  }
}
