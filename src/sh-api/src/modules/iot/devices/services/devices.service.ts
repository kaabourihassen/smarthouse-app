import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Device, DeviceDocument, DeviceIcon, DeviceType } from '../schemas/device.schema';
import { DeviceReading, DeviceReadingDocument } from '../schemas/device-reading.schema';
import { HistoryService } from '../../../core_domain/history/services/history.service';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

export type DeviceRecord = {
  id: string;
  title: string;
  room: string;
  type: DeviceType;
  value: string;
  consumptionKwh: number;
  icon: DeviceIcon;
  on: boolean;
  muted: boolean;
};

type TemperatureHumidityInput = {
  title: string;
  room: string;
  temperatureC: number;
  humidityPct: number;
};

type GasInput = {
  title: string;
  room: string;
  gasValue: number;
  gasDetected: boolean;
  gasLevel: 'normal' | 'warning' | 'danger';
};

type FlameInput = {
  title: string;
  room: string;
  detected: boolean;
};

type NewDeviceInput = {
  title: string;
  room: string;
  type: DeviceType;
  on: boolean;
  consumptionKwh: number;
  valueNumber: number;
};

type UpdateDeviceInput = {
  title?: string;
  on?: boolean;
  consumptionKwh?: number;
  valueNumber?: number;
};

// const DEFAULT_DEVICES: ReadonlyArray<Omit<NewDeviceInput, 'room'> & { room: string }> = [
//   {
//     title: 'Air conditioning',
//     room: 'living',
//     type: 'airConditioning',
//     on: true,
//     consumptionKwh: 2.5,
//     valueNumber: 21,
//   },
//   {
//     title: 'LED lights',
//     room: 'living',
//     type: 'lighting',
//     on: true,
//     consumptionKwh: 0.5,
//     valueNumber: 85,
//   },
//   {
//     title: 'Fan',
//     room: 'bedroom',
//     type: 'fan',
//     on: false,
//     consumptionKwh: 0.3,
//     valueNumber: 36,
//   },
//   {
//     title: 'Heating',
//     room: 'bathroom',
//     type: 'heating',
//     on: true,
//     consumptionKwh: 1.8,
//     valueNumber: 22,
//   },
//   {
//     title: 'Kitchen lights',
//     room: 'kitchen',
//     type: 'lighting',
//     on: true,
//     consumptionKwh: 0.4,
//     valueNumber: 100,
//   },
//   {
//     title: 'Ceiling fan',
//     room: 'living',
//     type: 'fan',
//     on: true,
//     consumptionKwh: 0.2,
//     valueNumber: 20,
//   },
// ];

@Injectable()
export class DevicesService {
  constructor(
    @InjectModel(Device.name) private readonly deviceModel: Model<DeviceDocument>,
    @InjectModel(DeviceReading.name) private readonly deviceReadingModel: Model<DeviceReadingDocument>,
    private readonly historyService: HistoryService,
    @InjectMetric('smarthouse_devices_created_total') private readonly devicesCreatedCounter: Counter<string>,
    @InjectMetric('smarthouse_devices_deleted_total') private readonly devicesDeletedCounter: Counter<string>,
    @InjectMetric('smarthouse_device_actions_total') private readonly deviceActionsCounter: Counter<string>,
  ) {}

  async listTimelineForDevice(userId: string, deviceId: string, limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const items = await this.deviceReadingModel
      .find({ userId, deviceId })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();

    // Oldest -> newest for a natural timeline.
    return items
      .reverse()
      .map((r) => ({
        id: String(r._id ?? (r as any).id),
        deviceId: String((r as any).deviceId ?? ''),
        title: String((r as any).title ?? ''),
        room: String((r as any).room ?? ''),
        type: (r as any).type as DeviceType,
        value: String((r as any).value ?? ''),
        on: Boolean((r as any).on),
        temperatureC: typeof (r as any).temperatureC === 'number' ? (r as any).temperatureC : undefined,
        humidityPct: typeof (r as any).humidityPct === 'number' ? (r as any).humidityPct : undefined,
        gasValue: typeof (r as any).gasValue === 'number' ? (r as any).gasValue : undefined,
        gasDetected: typeof (r as any).gasDetected === 'boolean' ? (r as any).gasDetected : undefined,
        gasLevel: typeof (r as any).gasLevel === 'string' ? (r as any).gasLevel : undefined,
        flameDetected: typeof (r as any).flameDetected === 'boolean' ? (r as any).flameDetected : undefined,
        createdAt: new Date((r as any).createdAt ?? Date.now()).toISOString(),
      }));
  }

  async listForUser(
    userId: string,
    options: { seedDefaults?: boolean } = {},
  ): Promise<DeviceRecord[]> {
    const seedDefaults = options.seedDefaults ?? true;
    if (seedDefaults) {
      await this.ensureDefaults(userId);
    }

    const devices = await this.deviceModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return devices.map((d) => this.toRecord(d));
  }

  async createForUser(userId: string, input: NewDeviceInput, actorName?: string): Promise<DeviceRecord> {
    const title = input.title.trim();
    const room = input.room.trim();

    console.log('Creating device with:', {
      userId,
      title,
      room,
      type: input.type,
      valueNumber: input.valueNumber,
      on: input.on,
      consumptionKwh: input.consumptionKwh,
      consumptionKwhType: typeof input.consumptionKwh,
    });

    const created = await this.deviceModel.create({
      userId,
      title,
      room,
      type: input.type,
      ...deriveComputedFields(input.type, input.valueNumber, input.on),
      consumptionKwh: input.consumptionKwh,
    });

    const saved = await created.save();
    const record = this.toRecord(saved.toObject());

    this.devicesCreatedCounter.inc();

    // Best-effort timeline point.
    try {
      await this.deviceReadingModel.create({
        userId,
        deviceId: record.id,
        title: record.title,
        room: record.room,
        type: record.type,
        value: record.value,
        on: record.on,
      });
    } catch {
      // Ignore timeline errors.
    }

    // Log into history.
    try {
      await this.historyService.createForUser(userId, {
        category: 'devices',
        icon: 'bulb',
        title: "Ajout d'un capteur",
        subtitle: `${record.title} ajouté`,
        actorName: actorName?.trim() || undefined,
        locationLabel: toRoomLabel(record.room),
        detail: record.value ? `Valeur: ${record.value}` : undefined,
      });
    } catch {
      // Ignore history errors.
    }

    return record;
  }

  async updateForUser(
    userId: string,
    id: string,
    patch: UpdateDeviceInput,
    actorName?: string,
  ): Promise<DeviceRecord | null> {
    const before = await this.deviceModel
      .findOne({ _id: id, userId }, { title: 1, room: 1, type: 1, on: 1, value: 1 })
      .lean()
      .exec();

    if (!before) return null;

    const update: Partial<Device> & { $set?: any } = {};

    if (typeof patch.title === 'string') {
      update.title = patch.title.trim();
    }

    if (typeof patch.on === 'boolean') {
      update.on = patch.on;
      update.muted = !patch.on;
    }

    if (typeof patch.consumptionKwh === 'number') {
      update.consumptionKwh = patch.consumptionKwh;
    }

    if (typeof patch.valueNumber === 'number') {
      const computed = deriveComputedFields(before.type as DeviceType, patch.valueNumber, undefined);
      update.value = computed.value;
      update.icon = computed.icon;
    }

    const updated = await this.deviceModel
      .findOneAndUpdate({ _id: id, userId }, { $set: update }, { returnDocument: 'after' })
      .lean()
      .exec();

    if (!updated) return null;

    const record = this.toRecord(updated);

    if (typeof patch.on === 'boolean') {
      this.deviceActionsCounter.inc({ action: 'toggle', type: record.type });
    }
    if (typeof patch.valueNumber === 'number') {
      this.deviceActionsCounter.inc({ action: 'adjust', type: record.type });
    }

    // Write to timeline only for state/value changes.
    try {
      if (typeof patch.on === 'boolean' || typeof patch.valueNumber === 'number') {
        await this.deviceReadingModel.create({
          userId,
          deviceId: record.id,
          title: record.title,
          room: record.room,
          type: record.type,
          value: record.value,
          on: record.on,
        });
      }
    } catch {
      // Ignore timeline errors.
    }

    // Best-effort history logging (don't block the API on history issues).
    try {
      const actor = actorName?.trim() || undefined;
      const locationLabel = toRoomLabel(String(updated.room ?? ''));

      if (typeof patch.on === 'boolean') {
        await this.historyService.createForUser(userId, {
          category: 'devices',
          icon: 'bulb',
          title: patch.on ? "Activation de l'appareil" : "Désactivation de l'appareil",
          subtitle: `${record.title} ${patch.on ? 'activé' : 'désactivé'}`,
          actorName: actor,
          locationLabel,
          detail: record.value ? `Valeur: ${record.value}` : undefined,
        });
      } else if (typeof patch.valueNumber === 'number') {
        await this.historyService.createForUser(userId, {
          category: 'devices',
          icon: 'bulb',
          title: 'Réglage appareil',
          subtitle: `${record.title} réglé à ${record.value}`,
          actorName: actor,
          locationLabel,
        });
      } else if (typeof patch.title === 'string') {
        await this.historyService.createForUser(userId, {
          category: 'devices',
          icon: 'bulb',
          title: "Modification de l'appareil",
          subtitle: `${String(before.title ?? 'Appareil')} renommé en ${record.title}`,
          actorName: actor,
          locationLabel,
        });
      }
    } catch {
      // Ignore history errors.
    }

    return record;
  }

  async upsertTemperatureHumidityForUser(userId: string, input: TemperatureHumidityInput): Promise<DeviceRecord> {
    const title = input.title.trim();
    const room = input.room.trim();

    if (!title || !room) {
      throw new BadRequestException('Invalid device input');
    }

    const temp = Number(input.temperatureC);
    const hum = Number(input.humidityPct);
    if (!Number.isFinite(temp) || !Number.isFinite(hum)) {
      throw new BadRequestException('Invalid sensor readings');
    }

    const value = `Temp: ${temp.toFixed(1)}°C | Hum: ${hum.toFixed(1)}%`;

    const updated = await this.deviceModel
      .findOneAndUpdate(
        { userId, title, room, type: 'temperatureHumidity' },
        {
          $setOnInsert: {
            userId,
            title,
            room,
            type: 'temperatureHumidity',
            consumptionKwh: 0,
          },
          $set: {
            value,
            icon: 'thermo',
            on: true,
            muted: false,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const record = this.toRecord(updated);

    // Best-effort timeline point for every ingest.
    try {
      await this.deviceReadingModel.create({
        userId,
        deviceId: record.id,
        title: record.title,
        room: record.room,
        type: record.type,
        value: record.value,
        on: record.on,
        temperatureC: temp,
        humidityPct: hum,
      });
    } catch {
      // Ignore timeline errors.
    }

    return record;
  }

  async upsertGasForUser(userId: string, input: GasInput): Promise<DeviceRecord> {
    const title = input.title.trim();
    const room = input.room.trim();

    if (!title || !room) {
      throw new BadRequestException('Invalid device input');
    }

    const gasValue = Number(input.gasValue);
    if (!Number.isFinite(gasValue) || gasValue < 0) {
      throw new BadRequestException('Invalid gas reading');
    }

    const gasDetected = Boolean(input.gasDetected);
    const gasLevel = input.gasLevel;

    // Compact, UI-friendly value string.
    const value = `Gas: ${gasLevel} (${Math.round(gasValue)})`;

    const updated = await this.deviceModel
      .findOneAndUpdate(
        { userId, title, room, type: 'gas' },
        {
          $setOnInsert: {
            userId,
            title,
            room,
            type: 'gas',
            consumptionKwh: 0,
          },
          $set: {
            value,
            icon: 'wind',
            on: true,
            muted: false,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const record = this.toRecord(updated);

    // Best-effort timeline point for every ingest.
    try {
      await this.deviceReadingModel.create({
        userId,
        deviceId: record.id,
        title: record.title,
        room: record.room,
        type: record.type,
        value: record.value,
        on: record.on,
        gasValue,
        gasDetected,
        gasLevel,
      });
    } catch {
      // Ignore timeline errors.
    }

    return record;
  }

  async upsertFlameForUser(userId: string, input: FlameInput): Promise<DeviceRecord> {
    const title = input.title.trim();
    const room = input.room.trim();

    if (!title || !room) {
      throw new BadRequestException('Invalid device input');
    }

    const detected = Boolean(input.detected);
    const value = detected ? 'Flame: detected' : 'Flame: normal';

    const updated = await this.deviceModel
      .findOneAndUpdate(
        { userId, title, room, type: 'flame' },
        {
          $setOnInsert: {
            userId,
            title,
            room,
            type: 'flame',
            consumptionKwh: 0,
          },
          $set: {
            value,
            icon: 'flame',
            on: true,
            muted: false,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const record = this.toRecord(updated);

    // Best-effort timeline point for every ingest.
    try {
      await this.deviceReadingModel.create({
        userId,
        deviceId: record.id,
        title: record.title,
        room: record.room,
        type: record.type,
        value: record.value,
        on: record.on,
        flameDetected: detected,
      });
    } catch {
      // Ignore timeline errors.
    }

    return record;
  }

  async upsertLampForUser(
    userId: string,
    input: { title: string; room: string; on: boolean; color?: string },
  ): Promise<DeviceRecord> {
    const title = input.title.trim();
    const room = input.room.trim();

    if (!title || !room) {
      throw new BadRequestException('Invalid device input');
    }

    const on = Boolean(input.on);
    const color = (input.color ?? '').trim();
    const value = on ? (color ? `Couleur: ${color}` : 'Allumée') : 'Éteinte';

    const updated = await this.deviceModel
      .findOneAndUpdate(
        { userId, title, room, type: 'lighting' },
        {
          $setOnInsert: {
            userId,
            title,
            room,
            type: 'lighting',
            consumptionKwh: 0.05,
          },
          $set: {
            value,
            icon: 'bulb',
            on,
            muted: false,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const record = this.toRecord(updated);

    try {
      await this.deviceReadingModel.create({
        userId,
        deviceId: record.id,
        title: record.title,
        room: record.room,
        type: record.type,
        value: record.value,
        on: record.on,
      });
    } catch {
      // Ignore timeline errors.
    }

    return record;
  }

  async deleteForUser(userId: string, id: string, actorName?: string): Promise<DeviceRecord | null> {
    const deleted = await this.deviceModel.findOneAndDelete({ _id: id, userId }).lean().exec();
    if (!deleted) return null;

    const record = this.toRecord(deleted);
    this.devicesDeletedCounter.inc();

    // Best-effort cleanup.
    try {
      await this.deviceReadingModel.deleteMany({ userId, deviceId: record.id }).exec();
    } catch {
      // Ignore cleanup errors.
    }

    // Best-effort history logging.
    try {
      await this.historyService.createForUser(userId, {
        category: 'devices',
        icon: 'bulb',
        title: "Suppression de l'appareil",
        subtitle: `${record.title} supprimé`,
        actorName: actorName?.trim() || undefined,
        locationLabel: toRoomLabel(record.room),
      });
    } catch {
      // Ignore history errors.
    }

    return record;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const deletedResult = await this.deviceModel.deleteMany({ userId }).exec();
    if (deletedResult.deletedCount && deletedResult.deletedCount > 0) {
      this.devicesDeletedCounter.inc(deletedResult.deletedCount);
    }
    await this.deviceReadingModel.deleteMany({ userId }).exec();
  }

  private async ensureDefaults(userId: string): Promise<void> {
    const count = await this.deviceModel
      .countDocuments({ userId })
      .exec();

    if (count > 0) return;

    
  }

  private toRecord(raw: any): DeviceRecord {
    return {
      id: String(raw._id ?? raw.id),
      title: String(raw.title ?? ''),
      room: String(raw.room ?? ''),
      type: raw.type as DeviceType,
      value: String(raw.value ?? ''),
      consumptionKwh: Number(raw.consumptionKwh ?? 0),
      icon: raw.icon as DeviceIcon,
      on: Boolean(raw.on),
      muted: Boolean(raw.muted),
    };
  }
}

function clampValue(type: DeviceType, value: number): number {
  if (type === 'lighting') return Math.max(0, Math.min(100, value));
  if (type === 'fan') return Math.max(0, Math.min(100, value));
  if (type === 'airConditioning') return Math.max(16, Math.min(30, value));
  if (type === 'heating') return Math.max(16, Math.min(28, value));
  if (type === 'gas') return Math.max(0, Math.min(4095, value));
  return value;
}

function formatValue(type: DeviceType, valueNumber: number): string {
  const clamped = clampValue(type, valueNumber);
  if (type === 'lighting') return `${Math.round(clamped)}%`;
  if (type === 'fan') return `${Math.round(clamped)}%`;
  if (type === 'airConditioning' || type === 'heating') return `${Math.round(clamped)}°C`;
  if (type === 'temperatureHumidity') return `Temp: ${clamped.toFixed(1)}°C`;
  if (type === 'gas') return `${Math.round(clamped)}`;
  return '';
}

function iconForType(type: DeviceType): DeviceIcon {
  if (type === 'airConditioning') return 'wind';
  if (type === 'heating') return 'thermo';
  if (type === 'temperatureHumidity') return 'thermo';
  if (type === 'gas') return 'wind';
  if (type === 'fan') return 'fan';
  if (type === 'flame') return 'flame';
  return 'bulb';
}

function deriveComputedFields(type: DeviceType, valueNumber: number, on?: boolean): Pick<Device, 'value' | 'icon' | 'muted'> {
  return {
    value: formatValue(type, valueNumber),
    icon: iconForType(type),
    muted: typeof on === 'boolean' ? !on : false,
  };
}

function toRoomLabel(roomKey: string): string | undefined {
  const key = (roomKey ?? '').trim();
  if (!key) return undefined;
  const map: Record<string, string> = {
    living: 'Living room',
    kitchen: 'Kitchen',
    bedroom: 'Bedroom',
    bathroom: 'Bathroom',
    office: 'Office',
  };
  return map[key] ?? key;
}
