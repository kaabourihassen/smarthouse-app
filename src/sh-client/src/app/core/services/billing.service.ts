import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_URL = '/api/billing';
const OPTS = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);

  createCheckoutSession(planId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${API_URL}/checkout-session`, { planId }, OPTS);
  }

  syncCheckoutSession(sessionId: string): Observable<{ synced: boolean }> {
    return this.http.post<{ synced: boolean }>(`${API_URL}/sync-checkout-session`, { sessionId }, OPTS);
  }

  cancelSubscription(): Observable<{ canceled: boolean }> {
    return this.http.post<{ canceled: boolean }>(`${API_URL}/cancel-subscription`, {}, OPTS);
  }
}
