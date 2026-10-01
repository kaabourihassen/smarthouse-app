export type ScreenshotRecord = {
  id: string;
  cameraId: string;
  title: string;
  roomLabel?: string;
  capturedAt: string;
  sizeBytes: number;
  fileUrl: string;
};

export type ScreenshotItem = ScreenshotRecord & {
  dateLabel: string;
  timeLabel: string;
  sizeLabel: string;
};
