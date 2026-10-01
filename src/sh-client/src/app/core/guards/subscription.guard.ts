import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SubscriptionsService, type SubscriptionMeRecord } from '../services/subscriptions.service';

function hasActiveSubscription(sub: SubscriptionMeRecord | null): boolean {
  if (!sub) return false;

  const planId = typeof sub.planId === 'string' ? sub.planId.trim() : '';
  if (!planId) return false;

  const status = typeof sub.status === 'string' ? sub.status.toLowerCase() : '';
  if (typeof sub.currentPeriodEnd === 'string' && sub.currentPeriodEnd) {
    const ts = Date.parse(sub.currentPeriodEnd);
    if (Number.isFinite(ts) && ts <= Date.now()) return false;
  }

  if (!status) {
    // Legacy data: treat as active if not expired.
    return true;
  }

  if (status === 'active' || status === 'trialing') return true;
  if (status === 'paid' || status === 'succeeded') return true;
  return false;
}

/**
 * Requires the user to be logged in AND have an active subscription.
 * Redirects non-subscribed users to /dashboard/subscription.
 */
export const subscriptionGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const subscriptionsService = inject(SubscriptionsService);
  const router = inject(Router);

  if (!authService.isLoggedIn) {
    return router.createUrlTree(['/login']);
  }

  // Admins always have access.
  if (authService.currentUser?.role === 'admin') {
    return true;
  }

  // Allow reaching the subscription page so users can pay.
  if (state.url.startsWith('/dashboard/subscription')) {
    return true;
  }

  await subscriptionsService.ensureLoaded();

  if (hasActiveSubscription(subscriptionsService.subscription())) {
    return true;
  }

  return router.createUrlTree(['/dashboard/subscription']);
};
