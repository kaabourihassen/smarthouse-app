export type HistoryCategory =
  | 'all'
  | 'devices'
  | 'security'
  | 'energy'
  | 'automation'
  | 'system'
  | 'users';

export type HistoryIcon =
  | 'bulb'
  | 'lock'
  | 'bolt'
  | 'robot'
  | 'gear'
  | 'user'
  | 'clock';

export type HistoryRecord = {
  id: string;
  category: Exclude<HistoryCategory, 'all'>;
  title: string;
  subtitle: string;
  actorName?: string;
  locationLabel?: string;
  detail?: string;
  icon: HistoryIcon;
  createdAt: string;
};

export type HistoryItem = HistoryRecord & {
  timeLabel: string;
  categoryLabel: string;
};
