export type RecordingMode = 'detection' | 'manual' | 'scheduled';

export type RecordingRecord = {
  id: string;
  cameraId: string;
  mode: RecordingMode;
  title: string;
  roomLabel?: string;
  startedAt: string;
  durationSeconds: number;
  sizeBytes: number;
  fileUrl?: string;
  thumbnailUrl?: string;
};

export type RecordingItem = RecordingRecord & {
  modeLabel: string;
  durationLabel: string;
  dateLabel: string;
  timeLabel: string;
  sizeLabel: string;
};
