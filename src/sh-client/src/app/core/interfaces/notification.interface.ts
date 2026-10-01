export type NotificationType = 'security' | 'alerts' | 'system' | 'other';
export type NotificationTone = 'success' | 'warning' | 'info' | 'danger';
export type NotificationIcon =
  | 'info'
  | 'drop'
  | 'check'
  | 'alert'
  | 'bolt'
  | 'camera'
  | 'thermo'
  | 'shield'
  | 'tip';

export type NotificationStatus = 'unread' | 'read';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  tone: NotificationTone;
  icon: NotificationIcon;
  title: string;
  message: string;
  urgent: boolean;
  status: NotificationStatus;
  createdAt: string;
}

export type NotificationCategory = 'all' | Exclude<NotificationType, 'other'>;

export interface NotificationItem extends Omit<NotificationRecord, 'createdAt'> {
  timeLabel: string;
  createdAt: string;
}
