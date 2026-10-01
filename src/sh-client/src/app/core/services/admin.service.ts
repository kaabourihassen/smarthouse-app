import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type AdminUserRole = 'admin' | 'resident' | 'member';

export type AdminUserRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AdminUserRole;
  banned: boolean;
  createdAt: string;
};

export type AdminComplaintStatus = 'open' | 'resolved';

export type AdminComplaintRecord = {
  id: string;
  userId: string;
  userEmail?: string;
  title: string;
  message: string;
  status: AdminComplaintStatus;
  createdAt: string;
};

export type AdminDeviceRecord = {
  id: string;
  title: string;
  room: string;
  type: string;
  value: string;
  consumptionKwh: number;
  icon: string;
  on: boolean;
  muted: boolean;
};

export type AdminDeviceTimelinePoint = {
  id: string;
  deviceId: string;
  title: string;
  room: string;
  type: string;
  value: string;
  on: boolean;
  temperatureC?: number;
  humidityPct?: number;
  createdAt: string;
};

export type AdminSubscriptionRecord = {
  id: string;
  userId: string;
  user?: AdminUserRecord;
  status?: string;
  planId?: string;
  priceId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  membersCount: number;
  members?: Array<{
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
    addedAt: string;
  }>;
  createdAt: string;
};

const API_URL = '/api/admin';
const OPTS = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  listUsers(): Promise<AdminUserRecord[]> {
    return firstValueFrom(this.http.get<{ users: AdminUserRecord[] }>(`${API_URL}/users`, OPTS)).then((r) => r.users);
  }

  updateUser(userId: string, patch: { role?: AdminUserRole; banned?: boolean }): Promise<AdminUserRecord> {
    return firstValueFrom(
      this.http.patch<{ user: AdminUserRecord }>(`${API_URL}/users/${encodeURIComponent(userId)}`, patch, OPTS),
    ).then((r) => r.user);
  }

  deleteUser(userId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_URL}/users/${encodeURIComponent(userId)}`, OPTS)).then(() => undefined);
  }

  listComplaints(): Promise<AdminComplaintRecord[]> {
    return firstValueFrom(
      this.http.get<{ complaints: AdminComplaintRecord[] }>(`${API_URL}/complaints`, OPTS),
    ).then((r) => r.complaints);
  }

  resolveComplaint(complaintId: string): Promise<AdminComplaintRecord> {
    return firstValueFrom(
      this.http.patch<{ complaint: AdminComplaintRecord }>(
        `${API_URL}/complaints/${encodeURIComponent(complaintId)}`,
        { status: 'resolved' },
        OPTS,
      ),
    ).then((r) => r.complaint);
  }

  getReadingsByUser(userId: string): Promise<{ user: AdminUserRecord; devices: AdminDeviceRecord[] }> {
    return firstValueFrom(
      this.http.get<{ user: AdminUserRecord; devices: AdminDeviceRecord[] }>(
        `${API_URL}/readings/${encodeURIComponent(userId)}`,
        OPTS,
      ),
    );
  }

  getDeviceTimeline(userId: string, deviceId: string, limit = 50): Promise<AdminDeviceTimelinePoint[]> {
    const qs = `?limit=${encodeURIComponent(String(limit))}`;
    return firstValueFrom(
      this.http.get<{ points: AdminDeviceTimelinePoint[] }>(
        `${API_URL}/readings/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}/timeline${qs}`,
        OPTS,
      ),
    ).then((r) => r.points);
  }

  listSubscriptions(): Promise<AdminSubscriptionRecord[]> {
    return firstValueFrom(
      this.http.get<{ subscriptions: AdminSubscriptionRecord[] }>(`${API_URL}/subscriptions`, OPTS),
    ).then((r) => r.subscriptions);
  }
}
