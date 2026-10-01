export type DeviceType =
  | 'lighting'
  | 'airConditioning'
  | 'heating'
  | 'fan'
  | 'temperatureHumidity'
  | 'gas'
  | 'flame';

export type DeviceIcon = 'wind' | 'bulb' | 'fan' | 'thermo' | 'flame';

export type Device = {
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

export type CreateDevicePayload = {
  title: string;
  room: string;
  type: DeviceType;
  on: boolean;
  consumptionKwh: number;
  valueNumber: number;
};

export type UpdateDevicePayload = Partial<Pick<Device, 'title' | 'on' | 'consumptionKwh'>> & {
  valueNumber?: number;
};

export type DeviceTimelinePoint = {
  id: string;
  deviceId: string;
  title: string;
  room: string;
  type: DeviceType;
  value: string;
  on: boolean;
  temperatureC?: number;
  humidityPct?: number;
  gasValue?: number;
  gasDetected?: boolean;
  gasLevel?: string;
  flameDetected?: boolean;
  createdAt: string;
};
