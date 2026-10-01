import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  AdminService,
  type AdminDeviceRecord,
  type AdminDeviceTimelinePoint,
  type AdminUserRecord,
} from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-readings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-readings.component.html',
  styleUrl: './admin-readings.component.scss',
})
export class AdminReadingsComponent {
  private readonly adminService = inject(AdminService);

  readonly isLoadingUsers = signal(true);
  readonly isLoadingDevices = signal(false);
  readonly errorMessage = signal('');

  readonly users = signal<readonly AdminUserRecord[]>([]);
  readonly selectedUserId = signal<string>('');
  readonly devices = signal<readonly AdminDeviceRecord[]>([]);

  readonly selectedDeviceId = signal<string>('');
  readonly isLoadingTimeline = signal(false);
  readonly timeline = signal<readonly AdminDeviceTimelinePoint[]>([]);

  constructor() {
    this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.isLoadingUsers.set(true);
    this.errorMessage.set('');
    try {
      const users = await this.adminService.listUsers();
      this.users.set(users);
      if (!this.selectedUserId() && users.length > 0) {
        this.selectedUserId.set(users[0].id);
        await this.loadDevicesForSelected();
      }
    } catch {
      this.errorMessage.set('Failed to load houses (users).');
    } finally {
      this.isLoadingUsers.set(false);
    }
  }

  async onSelectUser(userId: string): Promise<void> {
    this.selectedUserId.set(userId);
    this.selectedDeviceId.set('');
    this.timeline.set([]);
    await this.loadDevicesForSelected();
  }

  async loadDevicesForSelected(): Promise<void> {
    const userId = this.selectedUserId();
    if (!userId) {
      this.devices.set([]);
      return;
    }

    this.isLoadingDevices.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.adminService.getReadingsByUser(userId);
      this.devices.set(res.devices);
    } catch {
      this.errorMessage.set('Failed to load sensor readings.');
      this.devices.set([]);
    } finally {
      this.isLoadingDevices.set(false);
    }
  }

  async selectDevice(deviceId: string): Promise<void> {
    const userId = this.selectedUserId();
    if (!userId || !deviceId) return;

    this.selectedDeviceId.set(deviceId);
    this.isLoadingTimeline.set(true);
    this.errorMessage.set('');
    try {
      const points = await this.adminService.getDeviceTimeline(userId, deviceId, 60);
      this.timeline.set(points);
    } catch {
      this.errorMessage.set('Failed to load device timeline.');
      this.timeline.set([]);
    } finally {
      this.isLoadingTimeline.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    if (this.devices().length === 0) return;

    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const autoTable = (autoTableModule as any).default ?? (autoTableModule as any);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Sensor readings by house', 40, 40);

    const rows = this.devices().map((d) => [d.room, d.title, d.value, d.on ? 'On' : 'Off']);

    autoTable(doc, {
      startY: 60,
      head: [['Room', 'Device', 'Value', 'State']],
      body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [12, 65, 100] },
    });

    doc.save('sensor-readings.pdf');
  }
}
