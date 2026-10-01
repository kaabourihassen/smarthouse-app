import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { RoomsService } from '../../../core/services/rooms.service';
import { DevicesService } from '../../../core/services/devices.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import type { Device, DeviceTimelinePoint, DeviceType } from '../../../core/interfaces/device.interface';

type RoomKey = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | (string & {});
type RoomFilter = 'all' | RoomKey;
type TypeFilter = 'all' | DeviceType;

@Component({
  selector: 'app-device-management',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './device-management.component.html',
  styleUrl: './device-management.component.scss',
})
export class DeviceManagementComponent {
  private readonly authService = inject(AuthService);
  private readonly roomsService = inject(RoomsService);
  private readonly devicesService = inject(DevicesService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly notificationsService = inject(NotificationsService);

  readonly isDarkSidebar = signal(true);
  readonly currentUser$ = this.authService.currentUser$;
  readonly unreadNotificationsCount = this.notificationsService.unreadCount;
  readonly selectedRoom = signal<RoomFilter>('all');
  readonly selectedType = signal<TypeFilter>('all');

  readonly isAddFormOpen = signal(false);
  readonly selectedDeviceId = signal<string | null>(null);

  readonly isLoadingTimeline = signal(false);
  readonly timeline = signal<readonly DeviceTimelinePoint[]>([]);
  readonly timelineError = signal('');
  readonly showAllTimeline = signal(false);

  private timelineRequestId = 0;

  readonly roomsList = this.roomsService.roomsList;

  private readonly typeLabelByKey: Readonly<Record<TypeFilter, string>> = {
    all: 'All',
    lighting: 'Lighting',
    airConditioning: 'Air conditioning',
    heating: 'Heating',
    fan: 'Fan',
    temperatureHumidity: 'Temp & humidity',
    gas: 'Gas',
    flame: 'Flame',
  };

  readonly rooms = computed(() => [
    { key: 'all' as const, label: 'All' },
    ...this.roomsList().map((r) => ({ key: r.key, label: r.label })),
  ]);

  readonly types = [
    { key: 'all', label: this.typeLabelByKey.all },
    { key: 'lighting', label: this.typeLabelByKey.lighting },
    { key: 'airConditioning', label: this.typeLabelByKey.airConditioning },
    { key: 'heating', label: this.typeLabelByKey.heating },
    { key: 'fan', label: this.typeLabelByKey.fan },
    { key: 'temperatureHumidity', label: this.typeLabelByKey.temperatureHumidity },
    { key: 'gas', label: this.typeLabelByKey.gas },
    { key: 'flame', label: this.typeLabelByKey.flame },
  ] as const;

  readonly devices = this.devicesService.devicesList;

  readonly selectedDevice = computed(() => {
    const id = this.selectedDeviceId();
    if (!id) return null;
    return this.devices().find((d) => d.id === id) ?? null;
  });

  constructor() {
    effect(() => {
      const deviceId = this.selectedDeviceId();
      if (!deviceId) {
        this.timeline.set([]);
        this.timelineError.set('');
        this.showAllTimeline.set(false);
        return;
      }
      this.showAllTimeline.set(false);
      void this.loadTimeline(deviceId);
    });
  }

  readonly timelinePreview = computed(() => {
    const points = this.timeline();
    return this.showAllTimeline() ? points : points.slice(0, 8);
  });

  readonly filteredDevices = computed(() => {
    const room = this.selectedRoom();
    const type = this.selectedType();

    return this.devices().filter((device) => {
      const roomOk = room === 'all' ? true : device.room === room;
      const typeOk = type === 'all' ? true : device.type === type;
      return roomOk && typeOk;
    });
  });

  readonly kpis = computed(() => {
    const filtered = this.filteredDevices();
    const active = filtered.filter((d) => d.on);
    const inactiveCount = filtered.length - active.length;
    const consumptionKwh = active.reduce((sum, d) => sum + d.consumptionKwh, 0);

    return [
      {
        key: 'total',
        icon: 'devices',
        label: 'Total',
        value: String(filtered.length),
        hint: 'Connected devices',
      },
      {
        key: 'active',
        icon: 'power',
        label: 'Active',
        value: String(active.length),
        hint: 'Running',
      },
      {
        key: 'inactive',
        icon: 'power-off',
        label: 'Inactive',
        value: String(inactiveCount),
        hint: 'Off',
      },
      {
        key: 'consumption',
        icon: 'bolt',
        label: 'Consumption',
        value: consumptionKwh.toFixed(1),
        hint: 'kWh currently',
      },
    ] as const;
  });

  roomLabel(room: RoomFilter): string {
    if (room === 'all') return 'All';
    return this.roomsService.labelFor(room);
  }

  displayTitle(device: Device): string {
    if (device.type === 'temperatureHumidity' && device.title.trim().toLowerCase() === 'dht22') {
      return 'Temperature & Humidity';
    }
    if (device.type === 'gas' && device.title.trim().toLowerCase() === 'mq2') {
      return 'Gas sensor';
    }
    if (device.type === 'flame' && device.title.trim().toLowerCase() === 'flame') {
      return 'Flame sensor';
    }
    return device.title;
  }

  sensorValueLines(device: Device): { temp: string; hum: string } | null {
    if (device.type !== 'temperatureHumidity') return null;
    const raw = String(device.value ?? '');

    // Expected format from API: "Temp: 23.4°C | Hum: 45.6%"
    const match = /Temp:\s*([-+]?\d+(?:\.\d+)?)\s*°C\s*\|\s*Hum:\s*([-+]?\d+(?:\.\d+)?)\s*%/i.exec(raw);
    if (!match) return null;

    const temp = Number(match[1]);
    const hum = Number(match[2]);
    if (!Number.isFinite(temp) || !Number.isFinite(hum)) return null;

    return {
      temp: `Temp: ${temp.toFixed(1)}°C`,
      hum: `Hum: ${hum.toFixed(1)}%`,
    };
  }

  readonly addDeviceForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    room: this.formBuilder.nonNullable.control<RoomKey>('living', {
      validators: [Validators.required],
    }),
    type: this.formBuilder.nonNullable.control<DeviceType>('lighting', {
      validators: [Validators.required],
    }),
    on: this.formBuilder.nonNullable.control<boolean>(true),
    consumptionKwh: this.formBuilder.nonNullable.control<number>(0.2, {
      validators: [Validators.required, Validators.min(0)],
    }),
    valueNumber: this.formBuilder.nonNullable.control<number>(50, {
      validators: [Validators.required],
    }),
  });

  toggleAddForm(): void {
    const next = !this.isAddFormOpen();
    this.isAddFormOpen.set(next);
    if (next) {
      this.addDeviceForm.reset({
        title: '',
        room: 'living',
        type: 'lighting',
        on: true,
        consumptionKwh: 0.2,
        valueNumber: 50,
      });
      this.selectedDeviceId.set(null);
    }
  }

  cancelAddForm(): void {
    this.isAddFormOpen.set(false);
  }

  async submitAddDevice(): Promise<void> {
    if (this.addDeviceForm.invalid) {
      this.addDeviceForm.markAllAsTouched();
      return;
    }

    const { title, room, type, on, consumptionKwh, valueNumber } = this.addDeviceForm.getRawValue();

    await this.devicesService.addDevice({
      title,
      room,
      type,
      on,
      consumptionKwh,
      valueNumber,
    });

    this.isAddFormOpen.set(false);
  }

  openDevice(id: string): void {
    this.isAddFormOpen.set(false);
    this.selectedDeviceId.set(id);
  }

  closeDevice(): void {
    this.selectedDeviceId.set(null);
  }

  async loadTimeline(deviceId: string): Promise<void> {
    const requestId = ++this.timelineRequestId;
    this.isLoadingTimeline.set(true);
    this.timelineError.set('');

    try {
      const points = await this.devicesService.getDeviceTimeline(deviceId, 60);
      if (requestId !== this.timelineRequestId) return;
      this.timeline.set(points);
    } catch {
      if (requestId !== this.timelineRequestId) return;
      this.timeline.set([]);
      this.timelineError.set('Failed to load sensor history.');
    } finally {
      if (requestId !== this.timelineRequestId) return;
      this.isLoadingTimeline.set(false);
    }
  }

  adjustSelected(delta: number): void {
    const device = this.selectedDevice();
    if (!device) return;

    const step = device.type === 'lighting' || device.type === 'fan' ? 5 : 1;
    const current = this.parseValueNumber(device);
    const next = this.clampValue(device.type, current + delta * step);
    void this.devicesService.updateDevice(device.id, { valueNumber: next });
  }

  toggleDevice(id: string): void {
    const device = this.devices().find((d) => d.id === id);
    if (!device) return;

    void this.devicesService.updateDevice(device.id, { on: !device.on });
  }

  async deleteDevice(id: string): Promise<void> {
    const deleted = await this.devicesService.deleteDevice(id);
    if (deleted && this.selectedDeviceId() === id) {
      this.closeDevice();
    }
  }

  private parseValueNumber(device: Device): number {
    if (device.type === 'lighting' || device.type === 'fan') {
      const m = device.value.match(/(\d+)/);
      return m ? Number(m[1]) : 0;
    }
    if (device.type === 'airConditioning' || device.type === 'heating') {
      const m = device.value.match(/(-?\d+)/);
      return m ? Number(m[1]) : 0;
    }
    return 0;
  }

  private clampValue(type: DeviceType, value: number): number {
    if (type === 'lighting') return Math.max(0, Math.min(100, value));
    if (type === 'fan') return Math.max(0, Math.min(100, value));
    if (type === 'airConditioning') return Math.max(16, Math.min(30, value));
    if (type === 'heating') return Math.max(16, Math.min(28, value));
    return value;
  }

  logout(): void {
    this.authService.logout();
  }
}
