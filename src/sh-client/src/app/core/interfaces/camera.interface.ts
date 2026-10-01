export type CameraStatus = 'online' | 'offline';

export type CameraRecord = {
  id: string;
  name: string;
  roomKey?: string;
  roomLabel?: string;
  status: CameraStatus;
  detectionEnabled: boolean;
  streamUrl?: string;
  qualityLabel: string;
  storageTotalGb: number;
  createdAt: string;
};
