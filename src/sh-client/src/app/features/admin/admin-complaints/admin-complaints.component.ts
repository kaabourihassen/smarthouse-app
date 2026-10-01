import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AdminService, type AdminComplaintRecord } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-complaints',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-complaints.component.html',
  styleUrl: './admin-complaints.component.scss',
})
export class AdminComplaintsComponent {
  private readonly adminService = inject(AdminService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly complaints = signal<readonly AdminComplaintRecord[]>([]);
  readonly resolvingId = signal<string | null>(null);

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      this.complaints.set(await this.adminService.listComplaints());
    } catch {
      this.errorMessage.set('Failed to load complaints.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async resolve(id: string): Promise<void> {
    if (!id) return;
    if (this.resolvingId()) return;

    this.resolvingId.set(id);
    try {
      const updated = await this.adminService.resolveComplaint(id);
      this.complaints.update((list) => list.map((c) => (c.id === id ? updated : c)));
    } catch {
      this.errorMessage.set('Failed to resolve complaint.');
    } finally {
      this.resolvingId.set(null);
    }
  }
}
