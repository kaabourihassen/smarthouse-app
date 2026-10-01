import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationsGateway } from '../gateways/notifications.gateway';
import {
  Notification,
  NotificationDocument,
  NotificationIcon,
  NotificationTone,
  NotificationType,
} from '../schemas/notification.schema';

export type NotificationStatus = 'unread' | 'read';

export type NotificationRecord = {
  id: string;
  type: NotificationType;
  tone: NotificationTone;
  icon: NotificationIcon;
  title: string;
  message: string;
  urgent: boolean;
  status: NotificationStatus;
  createdAt: string;
};

type SeedNotification = Omit<Notification, 'userId' | 'readAt'> & { readAt?: Date | null };

const DEFAULT_NOTIFICATIONS: ReadonlyArray<SeedNotification> = [
  {
    type: 'system',
    tone: 'success',
    icon: 'info',
    title: 'Mise à jour disponible',
    message: 'Une nouvelle version du système est disponible (v2.4.1)',
    urgent: false,
    readAt: new Date(),
  },
  {
    type: 'alerts',
    tone: 'warning',
    icon: 'drop',
    title: 'Humidité anormale',
    message: "Taux d'humidité inhabituel détecté dans la chambre (75%)",
    urgent: false,
    readAt: new Date(),
  },
  {
    type: 'system',
    tone: 'info',
    icon: 'check',
    title: 'Sauvegarde réussie',
    message: 'Sauvegarde automatique des données effectuée avec succès',
    urgent: false,
    readAt: new Date(),
  },
  {
    type: 'security',
    tone: 'danger',
    icon: 'alert',
    title: "Tentative d'accès",
    message: 'Code incorrect saisi 3 fois sur le portail',
    urgent: true,
    readAt: null,
  },
  {
    type: 'alerts',
    tone: 'warning',
    icon: 'bolt',
    title: 'Consommation élevée',
    message: 'Pic de consommation électrique détecté (5.2 kW)',
    urgent: false,
    readAt: null,
  },
  {
    type: 'alerts',
    tone: 'warning',
    icon: 'thermo',
    title: 'Température élevée',
    message: 'La température dans la cuisine a atteint 28°C',
    urgent: true,
    readAt: null,
  },
  {
    type: 'security',
    tone: 'danger',
    icon: 'camera',
    title: 'Détection de mouvement',
    message: 'Mouvement détecté dans le salon via la caméra principale',
    urgent: true,
    readAt: null,
  },
  {
    type: 'security',
    tone: 'warning',
    icon: 'shield',
    title: "Porte d'entrée ouverte",
    message: "La porte d'entrée a été ouverte à 13:15",
    urgent: false,
    readAt: new Date(),
  },
  {
    type: 'other',
    tone: 'info',
    icon: 'tip',
    title: 'Conseil du jour',
    message: 'Activez les notifications critiques pour renforcer la sécurité.',
    urgent: false,
    readAt: new Date(),
  },
];

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async listForUser(userId: string): Promise<NotificationRecord[]> {
    await this.ensureDefaults(userId);

    const items = await this.notificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return items.map((n) => this.toRecord(n));
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const res = await this.notificationModel
      .updateMany(
        { userId, readAt: null },
        { $set: { readAt: new Date() } },
      )
      .exec();

    const updated = (res as any).modifiedCount ?? (res as any).nModified ?? 0;
    const payload = { updated: Number(updated) };

    this.notificationsGateway.emitReadAll(userId, payload);
    return payload;
  }

  async markRead(userId: string, id: string): Promise<NotificationRecord | null> {
    const updated = await this.notificationModel
      .findOneAndUpdate(
        { _id: id, userId },
        { $set: { readAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!updated) return null;

    const record = this.toRecord(updated);
    this.notificationsGateway.emitUpdated(userId, record);
    return record;
  }

  async createForUser(
    userId: string,
    input: {
      type: NotificationType;
      tone: NotificationTone;
      icon: NotificationIcon;
      title: string;
      message: string;
      urgent?: boolean;
    },
  ): Promise<NotificationRecord> {
    const dedupeWindowMs = (() => {
      const raw = process.env.NOTIFICATIONS_DEDUPE_WINDOW_MS;
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 60_000;
    })();

    if (input.type === 'alerts' || input.type === 'security') {
      const since = new Date(Date.now() - dedupeWindowMs);
      const existing = await this.notificationModel
        .findOne({ userId, type: input.type, title: input.title.trim(), createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (existing) {
        return this.toRecord(existing);
      }
    }

    const created = await this.notificationModel.create({
      userId,
      type: input.type,
      tone: input.tone,
      icon: input.icon,
      title: input.title.trim(),
      message: input.message.trim(),
      urgent: Boolean(input.urgent),
      readAt: null,
    });

    const saved = await created.save();
    const record = this.toRecord(saved.toObject());
    this.notificationsGateway.emitNew(userId, record);
    return record;
  }

  private async ensureDefaults(userId: string): Promise<void> {
    const count = await this.notificationModel.countDocuments({ userId }).exec();
    if (count > 0) return;

    try {
      await this.notificationModel.insertMany(
        DEFAULT_NOTIFICATIONS.map((n) => ({
          userId,
          type: n.type,
          tone: n.tone,
          icon: n.icon,
          title: n.title,
          message: n.message,
          urgent: n.urgent,
          readAt: n.readAt ?? null,
        })),
        { ordered: false },
      );
    } catch {
      // Ignore duplicates / race conditions.
    }
  }

  private toRecord(raw: any): NotificationRecord {
    const readAt = raw.readAt ? new Date(raw.readAt) : null;

    return {
      id: String(raw._id ?? raw.id),
      type: raw.type as NotificationType,
      tone: raw.tone as NotificationTone,
      icon: raw.icon as NotificationIcon,
      title: String(raw.title ?? ''),
      message: String(raw.message ?? ''),
      urgent: Boolean(raw.urgent),
      status: readAt ? 'read' : 'unread',
      createdAt: new Date(raw.createdAt ?? Date.now()).toISOString(),
    };
  }
}
