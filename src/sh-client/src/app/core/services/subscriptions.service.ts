import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of, tap } from 'rxjs';
import { AuthService } from './auth.service';

export type SubscriptionMemberRole = 'spouse' | 'child' | 'parent' | 'guest';

export type SubscriptionMemberRecord = {
  fullName: string;
  email: string;
  role: SubscriptionMemberRole;
  isActive: boolean;
  addedAt: string;
};

export type SubscriptionMeRecord = {
  isOwner: boolean;
  status?: string;
  planId?: string;
  priceId?: string;
  priceUnitAmount?: number;
  priceCurrency?: string;
  priceInterval?: string;
  priceIntervalCount?: number;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  members: SubscriptionMemberRecord[];
};

export type AddMemberResult = {
  ok: boolean;
  message?: string;
};

const API_URL = '/api/subscriptions/me';
const OPTS = { withCredentials: true };

function isMemberRole(value: any): value is SubscriptionMemberRole {
  return value === 'spouse' || value === 'child' || value === 'parent' || value === 'guest';
}

function isMember(value: any): value is SubscriptionMemberRecord {
  return (
    !!value &&
    typeof value.fullName === 'string' &&
    typeof value.email === 'string' &&
    isMemberRole(value.role) &&
    typeof value.isActive === 'boolean' &&
    typeof value.addedAt === 'string'
  );
}

function isSubscriptionMe(value: any): value is SubscriptionMeRecord {
  return (
    !!value &&
    typeof value.isOwner === 'boolean' &&
    (value.status === undefined || typeof value.status === 'string') &&
    (value.planId === undefined || typeof value.planId === 'string') &&
    (value.priceId === undefined || typeof value.priceId === 'string') &&
    (value.priceUnitAmount === undefined || typeof value.priceUnitAmount === 'number') &&
    (value.priceCurrency === undefined || typeof value.priceCurrency === 'string') &&
    (value.priceInterval === undefined || typeof value.priceInterval === 'string') &&
    (value.priceIntervalCount === undefined || typeof value.priceIntervalCount === 'number') &&
    (value.currentPeriodEnd === undefined || typeof value.currentPeriodEnd === 'string') &&
    (value.cancelAtPeriodEnd === undefined || typeof value.cancelAtPeriodEnd === 'boolean') &&
    Array.isArray(value.members) &&
    value.members.every(isMember)
  );
}

@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly subscription = signal<SubscriptionMeRecord | null>(null);
  readonly loaded = signal(false);

  constructor() {
    this.authService.currentUser$
      .pipe(
        takeUntilDestroyed(),
        tap((user) => {
          if (!user) {
            this.subscription.set(null);
            this.loaded.set(false);
            return;
          }
          this.refresh();
        }),
      )
      .subscribe();
  }

  private async fetchOnce(): Promise<SubscriptionMeRecord | null> {
    try {
      const res = await firstValueFrom(this.http.get<{ subscription: SubscriptionMeRecord | null }>(API_URL, OPTS));
      const sub = (res as any)?.subscription;
      return isSubscriptionMe(sub) ? sub : null;
    } catch {
      return null;
    }
  }

  /**
   * Ensures we have attempted to load the current subscription at least once.
   * Useful for route guards to avoid redirecting while the initial fetch is still pending.
   */
  async ensureLoaded(): Promise<void> {
    if (!this.authService.isLoggedIn) {
      this.subscription.set(null);
      this.loaded.set(false);
      return;
    }

    if (this.loaded()) return;

    const sub = await this.fetchOnce();
    this.subscription.set(sub);
    this.loaded.set(true);
  }

  refresh(): void {
    this.loaded.set(false);
    this.http
      .get<{ subscription: SubscriptionMeRecord | null }>(API_URL, OPTS)
      .pipe(
        tap((res) => {
          const sub = (res as any)?.subscription;
          this.subscription.set(isSubscriptionMe(sub) ? sub : null);
          this.loaded.set(true);
        }),
        catchError(() => {
          this.subscription.set(null);
          this.loaded.set(true);
          return of({ subscription: null });
        }),
      )
      .subscribe();
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    const anyErr = err as any;
    const msg = anyErr?.error?.message;
    if (Array.isArray(msg) && msg.length > 0) {
      const first = String(msg[0] ?? '').trim();
      if (first) return first;
    }
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    return fallback;
  }

  async addMember(input: { email: string }): Promise<AddMemberResult> {
    const email = input.email.trim();
    if (!email) {
      return { ok: false, message: 'Please enter a valid email address.' };
    }

    try {
      const res = await firstValueFrom(
        this.http.post<{ subscription: SubscriptionMeRecord | null }>(
          `${API_URL}/members`,
          { email },
          OPTS,
        ),
      );

      const sub = (res as any)?.subscription;
      if (isSubscriptionMe(sub)) {
        this.subscription.set(sub);
      } else {
        this.refresh();
      }
      return { ok: true };
    } catch (err) {
      this.refresh();
      return { ok: false, message: this.extractErrorMessage(err, 'Unable to add member.') };
    }
  }

  async removeMember(emailInput: string): Promise<void> {
    const email = emailInput.trim();
    if (!email) return;

    try {
      const res = await firstValueFrom(
        this.http.delete<{ subscription: SubscriptionMeRecord | null }>(
          `${API_URL}/members/${encodeURIComponent(email)}`,
          OPTS,
        ),
      );

      const sub = (res as any)?.subscription;
      if (isSubscriptionMe(sub)) {
        this.subscription.set(sub);
      } else {
        this.refresh();
      }
    } catch {
      this.refresh();
    }
  }
}
