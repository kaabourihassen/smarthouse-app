import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { AuthUser } from '../../../core/interfaces/auth.interface';
import { RoomsService, type RoomKey } from '../../../core/services/rooms.service';
import { DevicesService } from '../../../core/services/devices.service';
import { NotificationsService } from '../../../core/services/notifications.service';

type ChartPoint = {
  x: number;
  y: number;
  label: string;
  value: number;
};

@Component({
  selector: 'app-main-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './main-dashboard.component.html',
  styleUrl: './main-dashboard.component.scss',
})
export class MainDashboardComponent {
  private authService = inject(AuthService);
  private readonly roomsService = inject(RoomsService);
  private readonly devicesService = inject(DevicesService);
  private readonly notificationsService = inject(NotificationsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly currentUser$ = this.authService.currentUser$;
  readonly unreadNotificationsCount = this.notificationsService.unreadCount;
  readonly userFallback: AuthUser = {
    id: 'local',
    firstName: 'Amine',
    lastName: 'H.',
    email: 'amine@example.com',
    role: 'resident',
    createdAt: new Date().toISOString(),
  };

  readonly isDarkSidebar = signal(true);

  readonly selectedRoomKey = signal<RoomKey>('living');
  readonly isAddRoomOpen = signal(false);

  readonly selectedRoomLabel = computed(() => this.roomsService.labelFor(this.selectedRoomKey()));

  readonly roomDevices = computed(() => {
    const key = this.selectedRoomKey();
    return this.devicesService.devicesList().filter((d) => d.room === key);
  });

  readonly selectedDeviceId = signal<string | null>(null);

  readonly selectedDevice = computed(() => {
    const devices = this.roomDevices();
    const id = this.selectedDeviceId();
    if (id) {
      const found = devices.find((d) => d.id === id);
      if (found) return found;
    }
    return devices[0] ?? null;
  });

  readonly roomDeviceCount = computed(() => this.roomDevices().length);

  readonly roomConsumptionKwh = computed(() => {
    let sum = 0;
    for (const d of this.roomDevices()) {
      if (Number.isFinite(d.consumptionKwh)) sum += d.consumptionKwh;
    }
    return sum;
  });

  readonly energySeriesWeek = computed(() => {
    const total = this.roomConsumptionKwh();
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
    const weights = [0.11, 0.14, 0.13, 0.16, 0.14, 0.17, 0.15] as const;

    if (total > 0) {
      const totalRounded = Math.round(total);
      const values = weights.map((w) => Math.max(0, Math.round(totalRounded * w)));
      const sum = values.reduce((a, b) => a + b, 0);
      const adjust = totalRounded - sum;
      values[values.length - 1] = Math.max(0, values[values.length - 1] + adjust);
      return days.map((label, i) => ({ label, kwh: values[i] ?? 0 }));
    }

    const fallback = [6.2, 8.4, 7.1, 9.3, 8.0, 5.6, 6.8] as const;
    return days.map((label, i) => ({ label, kwh: fallback[i] ?? 0 }));
  });

  readonly energyChart = computed(() => {
    const series = this.energySeriesWeek();
    const values = series.map((p) => p.kwh);
    const points = makeLinePoints(values, 720, 160, 40, 24, 700, 130);
    const path = makePath(points);
    const labels = series.map((p, i) => ({ x: points[i]?.x ?? 0, label: p.label }));
    return { points, path, labels };
  });

  readonly todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  readonly kpis = [
    {
      icon: 'thermo',
      label: 'Indoor\ntemp.',
      value: '24',
      unit: '°C',
      hint: '+2°C\nsince yesterday',
    },
    {
      icon: 'thermo-snow',
      label: 'Outdoor\ntemp.',
      value: '05',
      unit: '°C',
      hint: '-1°C\nsince yesterday',
    },
    {
      icon: 'bolt',
      label: 'Energy',
      value: '13',
      unit: 'kWh',
      hint: '+8.02%\nthis month',
    },
    {
      icon: 'drop',
      label: 'Humidity',
      value: '75',
      unit: '%',
      hint: '+5.06%\nthis month',
    },
    {
      icon: 'sun',
      label: 'Solar',
      value: '78',
      unit: 'kWh',
      hint: '+4.02%\nthis month',
    },
  ] as const;

  private readonly roomPresetByKey: Readonly<
    Record<
      string,
      {
        icon: 'home' | 'flame' | 'moon' | 'drop' | 'pulse';
        active: boolean;
      }
    >
  > = {
    living: { icon: 'home', active: true },
    kitchen: { icon: 'flame', active: true },
    bedroom: { icon: 'moon', active: false },
    bathroom: { icon: 'drop', active: false },
    office: { icon: 'pulse', active: true },
  };

  private readonly deviceCountByRoom = computed(() => {
    const counts = new Map<string, number>();
    for (const d of this.devicesService.devicesList()) {
      const key = (d.room ?? '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  });

  readonly rooms = computed(() => {
    const list = this.roomsService.roomsList();
    const deviceCountByRoom = this.deviceCountByRoom();
    const defaultOrder: RoomKey[] = ['living', 'kitchen', 'bedroom', 'bathroom'];
    const officeKey: RoomKey = 'office';

    const byKey = new Map(list.map((r) => [r.key, r] as const));
    const ordered: Array<{ key: RoomKey; name: string; devices: number; icon: any; active: boolean }> = [];

    for (const key of defaultOrder) {
      const room = byKey.get(key);
      if (!room) continue;
      const preset = this.roomPresetByKey[key] ?? { icon: 'pulse', active: true };
      ordered.push({
        key,
        name: room.label,
        devices: deviceCountByRoom.get(key) ?? 0,
        icon: preset.icon,
        active: preset.active,
      });
    }

    const custom = list
      .filter((r) => !defaultOrder.includes(r.key) && r.key !== officeKey)
      .map((r) => ({
        key: r.key,
        name: r.label,
        devices: deviceCountByRoom.get(r.key) ?? 0,
        icon: 'pulse' as const,
        active: true,
      }));

    ordered.push(...custom);

    const office = byKey.get(officeKey);
    if (office) {
      const preset = this.roomPresetByKey[officeKey] ?? { icon: 'pulse', active: true };
      ordered.push({
        key: officeKey,
        name: office.label,
        devices: deviceCountByRoom.get(officeKey) ?? 0,
        icon: preset.icon,
        active: preset.active,
      });
    }

    return ordered;
  });

  readonly addRoomForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  openAddRoom(): void {
    this.isAddRoomOpen.set(true);
    this.addRoomForm.reset({ name: '' });
  }

  cancelAddRoom(): void {
    this.isAddRoomOpen.set(false);
  }

  async submitAddRoom(): Promise<void> {
    if (this.addRoomForm.invalid) {
      this.addRoomForm.markAllAsTouched();
      return;
    }

    const name = this.addRoomForm.getRawValue().name;
    const room = await this.roomsService.addRoom(name);
    if (!room) return;

    this.selectedRoomKey.set(room.key);
    this.selectedDeviceId.set(null);
    this.isAddRoomOpen.set(false);
  }

  selectRoom(key: RoomKey): void {
    this.selectedRoomKey.set(key);
    const first = this.devicesService.devicesList().find((d) => d.room === key) ?? null;
    this.selectedDeviceId.set(first?.id ?? null);
  }

  readonly quickControls = computed(() => {
    const label = this.selectedRoomLabel();
    return this.roomDevices().map((d) => ({
      id: d.id,
      icon: d.icon,
      title: d.title,
      subtitle: label,
      value: d.value,
      on: d.on,
    }));
  });

  readonly deviceCard = this.selectedDevice;

  selectDevice(id: string): void {
    this.selectedDeviceId.set(id);
  }

  adjustSelectedDevice(delta: number): void {
    const device = this.selectedDevice();
    if (!device) return;

    const step = device.type === 'lighting' || device.type === 'fan' ? 5 : 1;
    const current = parseValueNumber(device.type, device.value);
    const next = clampValue(device.type, current + delta * step);
    void this.devicesService.updateDevice(device.id, { valueNumber: next });
  }

  toggleQuickDevice(id: string): void {
    const device = this.roomDevices().find((d) => d.id === id);
    if (!device) return;
    void this.devicesService.updateDevice(device.id, { on: !device.on });
  }

  logout(): void {
    this.authService.logout();
  }
}

function parseValueNumber(type: string, value: string): number {
  if (type === 'lighting' || type === 'fan') {
    const m = value.match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }
  if (type === 'airConditioning' || type === 'heating') {
    const m = value.match(/(-?\d+)/);
    return m ? Number(m[1]) : 0;
  }
  return 0;
}

function clampValue(type: string, value: number): number {
  if (type === 'lighting') return Math.max(0, Math.min(100, value));
  if (type === 'fan') return Math.max(0, Math.min(100, value));
  if (type === 'airConditioning') return Math.max(16, Math.min(30, value));
  if (type === 'heating') return Math.max(16, Math.min(28, value));
  return value;
}

function makeLinePoints(
  values: number[],
  viewW: number,
  viewH: number,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): ChartPoint[] {
  const count = Math.max(1, values.length);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = Math.max(0.001, maxV - minV);
  const pad = span * 0.15;
  const low = minV - pad;
  const high = maxV + pad;

  const usableW = xMax - xMin;
  const usableH = yMax - yMin;

  return values.map((v, idx) => {
    const t = count === 1 ? 0 : idx / (count - 1);
    const x = xMin + t * usableW;
    const vn = (v - low) / Math.max(0.001, high - low);
    const y = yMax - vn * usableH;
    return {
      x,
      y,
      value: v,
      label: v.toFixed(1),
    };
  });
}

function makePath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}
