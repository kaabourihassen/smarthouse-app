import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ComplaintRecord, CreateComplaintPayload } from '../interfaces/complaint.interface';

const API_URL = '/api/complaints';
const OPTS = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class ComplaintsService {
  private readonly http = inject(HttpClient);

  create(payload: CreateComplaintPayload): Promise<ComplaintRecord> {
    return firstValueFrom(this.http.post<{ complaint: ComplaintRecord }>(API_URL, payload, OPTS)).then((r) => r.complaint);
  }

  getMyComplaints(): Promise<ComplaintRecord[]> {
    return firstValueFrom(this.http.get<{ complaints: ComplaintRecord[] }>(`${API_URL}/me`, OPTS)).then((r) => r.complaints ?? []);
  }
}
