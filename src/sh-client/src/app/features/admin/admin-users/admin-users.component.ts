import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminService, type AdminUserRecord, type AdminUserRole } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
})
export class AdminUsersComponent {
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly users = signal<readonly AdminUserRecord[]>([]);

  readonly updatingUserId = signal<string | null>(null);
  readonly deletingUserId = signal<string | null>(null);

  private readonly currentUser = toSignal(this.authService.currentUser$, {
    initialValue: this.authService.currentUser,
  });
  readonly myUserId = computed(() => this.currentUser()?.id ?? null);

  constructor() {
    this.refresh();
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    const anyErr = err as any;
    const msg = anyErr?.error?.message;
    if (Array.isArray(msg)) return msg.join(' ');
    if (typeof msg === 'string' && msg.trim()) return msg;
    return fallback;
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const users = await this.adminService.listUsers();
      this.users.set(users);
    } catch {
      this.errorMessage.set('Failed to load users.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleBan(userId: string, banned: boolean): Promise<void> {
    if (!userId) return;
    if (this.updatingUserId()) return;
    if (this.myUserId() === userId) return;

    this.updatingUserId.set(userId);
    try {
      const updated = await this.adminService.updateUser(userId, { banned });
      this.users.update((list) => list.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      this.errorMessage.set(
        this.extractErrorMessage(err, banned ? 'Failed to ban user.' : 'Failed to unban user.'),
      );
    } finally {
      this.updatingUserId.set(null);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    if (!userId) return;
    if (this.deletingUserId()) return;
    if (this.myUserId() === userId) return;

    this.deletingUserId.set(userId);
    try {
      await this.adminService.deleteUser(userId);
      this.users.update((list) => list.filter((u) => u.id !== userId));
    } catch (err) {
      this.errorMessage.set(this.extractErrorMessage(err, 'Failed to delete user.'));
    } finally {
      this.deletingUserId.set(null);
    }
  }
}
