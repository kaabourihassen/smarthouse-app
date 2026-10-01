import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { BillingService } from '../../../core/services/billing.service';
import { SubscriptionsService } from '../../../core/services/subscriptions.service';
import type { SubscriptionMeRecord } from '../../../core/services/subscriptions.service';
import { take } from 'rxjs';

type OfferPlan = {
  id: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  billingLabel: string;
  features: readonly string[];
  badgeLeft?: string;
};

type FamilyRole = 'spouse' | 'child' | 'parent' | 'guest';

type FamilyMember = {
  fullName: string;
  email: string;
  relationLabel: string;
  isActive: boolean;
};

@Component({
  selector: 'app-subscription-management',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './subscription-management.component.html',
  styleUrl: './subscription-management.component.scss',
})
export class SubscriptionManagementComponent {
  private readonly authService = inject(AuthService);
  private readonly billingService = inject(BillingService);
  private readonly subscriptionsService = inject(SubscriptionsService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  readonly isDarkSidebar = signal(true);

  constructor() {
    this.route.queryParamMap.pipe(take(1)).subscribe((params) => {
      const checkout = params.get('checkout');
      const sessionId = params.get('session_id');

      if (checkout === 'success' && sessionId) {
        this.billingService.syncCheckoutSession(sessionId).subscribe({
          next: () => this.subscriptionsService.refresh(),
          error: () => this.subscriptionsService.refresh(),
        });
      }
    });
  }

  private isSubscriptionActive(sub: SubscriptionMeRecord | null): boolean {
    if (!sub) return false;
    const planId = typeof sub.planId === 'string' ? sub.planId.trim() : '';
    if (!planId) return false;

    const end = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : NaN;
    if (Number.isFinite(end) && end <= Date.now()) return false;

    const statusRaw = typeof sub.status === 'string' ? sub.status.trim().toLowerCase() : '';
    if (!statusRaw) return true;
    if (statusRaw === 'active' || statusRaw === 'trialing') return true;
    if (statusRaw === 'canceled') return true;
    if (statusRaw === 'paid' || statusRaw === 'succeeded') return true;
    return false;
  }

  private isSubscriptionCanceledValue(sub: SubscriptionMeRecord | null): boolean {
    const statusRaw = typeof sub?.status === 'string' ? sub.status.trim().toLowerCase() : '';
    return statusRaw === 'canceled';
  }

  readonly hasActiveSubscription = computed(() => this.isSubscriptionActive(this.subscriptionsService.subscription()));
  readonly isSubscriptionCanceled = computed(() => this.isSubscriptionCanceledValue(this.subscriptionsService.subscription()));
  readonly canCancelSubscription = computed(() => this.hasActiveSubscription() && !this.isSubscriptionCanceled());

  readonly currentPlanId = computed(() => {
    if (!this.hasActiveSubscription()) return null;
    const planId = this.subscriptionsService.subscription()?.planId;
    return typeof planId === 'string' && planId.trim() ? planId : null;
  });

  readonly currentPlan = computed<OfferPlan | null>(() => {
    const id = this.currentPlanId();
    if (!id) return null;
    const match = this.offerPlans.find((p) => p.id === id);
    return match ?? null;
  });

  readonly checkoutError = signal<string | null>(null);
  readonly cancelError = signal<string | null>(null);
  readonly isCancelConfirmOpen = signal(false);

  readonly isPlanOwner = computed(() => this.subscriptionsService.subscription()?.isOwner === true);
  readonly isFamilyOwner = computed(() => this.subscriptionsService.subscription()?.isOwner === true);

  readonly offerPlans: readonly OfferPlan[] = [
    {
      id: 'basic',
      title: 'Basic',
      subtitle: 'For individuals',
      priceLabel: '€19.99/mo',
      billingLabel: 'Annual billing',
      features: [
        'Up to 5 connected sensors',
        'Real-time dashboard',
        '7-day history',
        'Email support',
        'Mobile app',
        'Basic alerts',
      ],
    },
    {
      id: 'premium-plus',
      title: 'Premium Plus',
      subtitle: 'For connected families',
      priceLabel: '€49.99/mo',
      billingLabel: 'Annual billing',
      features: [
        'Up to 15 connected sensors',
        'Advanced dashboard + analytics',
        'Unlimited history',
        'Priority 24/7 support',
        'Multi-users (5 members)',
        'Smart automations',
        'Live HD camera',
        'API integrations',
      ],
      badgeLeft: 'Recommended',
    },
    {
      id: 'extended-pro',
      title: 'Extended Pro',
      subtitle: 'For professionals',
      priceLabel: '€99.99/mo',
      billingLabel: 'Annual billing',
      features: [
        'Unlimited sensors',
        'Customizable dashboard',
        'History + cloud backup',
        'Dedicated support + training',
        'Unlimited multi-users',
        'Advanced predictive AI',
        '4K multi-camera',
        'White-label available',
      ],
    },
  ] as const;

  readonly isAddMemberOpen = signal(false);
  readonly addMemberMessage = signal('');
  readonly addMemberMessageTone = signal<'success' | 'error' | ''>('');

  readonly isStartingCheckout = signal(false);
  readonly isCanceling = signal(false);

  private readonly relationLabelByRole: Readonly<Record<FamilyRole, string>> = {
    spouse: 'Spouse',
    child: 'Child',
    parent: 'Parent',
    guest: 'Guest',
  };

  readonly familyMembers = computed<readonly FamilyMember[]>(() => {
    const sub = this.subscriptionsService.subscription();
    const members = sub?.members ?? [];

    return members.map((m) => ({
      fullName: m.fullName,
      email: m.email,
      relationLabel: this.relationLabelByRole[m.role],
      isActive: m.isActive,
    }));
  });

  readonly activeFamilyMembersCount = computed(() => this.familyMembers().filter((m) => m.isActive).length);

  readonly removingMemberEmail = signal<string | null>(null);

  readonly addMemberForm = this.formBuilder.nonNullable.group({
    email: this.formBuilder.nonNullable.control('', {
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
  });

  isPlanActive(planId: string): boolean {
    return !!this.currentPlanId() && planId === this.currentPlanId();
  }

  startCheckout(planId: string): void {
    if (!this.isPlanOwner() && this.hasActiveSubscription()) {
      this.checkoutError.set('Only the subscription owner can change the plan.');
      return;
    }
    if (this.isPlanActive(planId)) return;
    if (this.isStartingCheckout()) return;

    this.checkoutError.set(null);

    this.isStartingCheckout.set(true);
    this.billingService.createCheckoutSession(planId).subscribe({
      next: ({ url }) => {
        window.location.assign(url);
      },
      error: () => {
        this.checkoutError.set('Unable to start the payment page. Please try again.');
        this.isStartingCheckout.set(false);
      },
      complete: () => {
        this.isStartingCheckout.set(false);
      },
    });
  }

  getActionLabelForPlan(planId: string): string {
    if (!this.isPlanOwner() && this.hasActiveSubscription()) return 'Owner only';
    if (this.isPlanActive(planId)) return 'Current plan';
    if (this.currentPlanId()) return 'Change plan';
    return 'Subscribe';
  }

  cancelSubscription(): void {
    if (!this.isPlanOwner()) {
      this.cancelError.set('Only the subscription owner can cancel the plan.');
      return;
    }
    if (!this.hasActiveSubscription()) return;
    if (this.isSubscriptionCanceled()) return;
    if (this.isCanceling()) return;

    this.cancelError.set(null);
    this.isCancelConfirmOpen.set(true);
  }

  closeCancelConfirm(): void {
    if (this.isCanceling()) return;
    this.isCancelConfirmOpen.set(false);
  }

  confirmCancelSubscription(): void {
    if (!this.isPlanOwner()) return;
    if (!this.hasActiveSubscription()) return;
    if (this.isSubscriptionCanceled()) return;
    if (this.isCanceling()) return;

    this.cancelError.set(null);
    this.isCanceling.set(true);
    this.billingService.cancelSubscription().subscribe({
      next: () => this.subscriptionsService.refresh(),
      error: () => {
        this.cancelError.set('Unable to cancel the subscription. Please try again.');
        this.isCanceling.set(false);
      },
      complete: () => {
        this.isCanceling.set(false);
        this.isCancelConfirmOpen.set(false);
      },
    });
  }

  toggleAddMember(): void {
    if (!this.isFamilyOwner()) return;
    const nextOpen = !this.isAddMemberOpen();
    this.isAddMemberOpen.set(nextOpen);

    if (nextOpen) {
      this.addMemberMessage.set('');
      this.addMemberMessageTone.set('');
      this.addMemberForm.reset({ email: '' });
    }
  }

  cancelAddMember(): void {
    this.isAddMemberOpen.set(false);
    this.addMemberForm.reset({ email: '' });
  }

  submitAddMember(): void {
    if (!this.isFamilyOwner()) return;
    this.addMemberMessage.set('');
    this.addMemberMessageTone.set('');
    if (this.addMemberForm.invalid) {
      this.addMemberForm.markAllAsTouched();
      return;
    }

    const email = this.addMemberForm.controls.email.value.trim();

    if (!email) {
      return;
    }
    this.subscriptionsService.addMember({ email }).then((result) => {
      if (result.ok) {
        this.addMemberMessage.set('Member added successfully.');
        this.addMemberMessageTone.set('success');
        this.addMemberForm.reset({ email: '' });
        return;
      }
      this.addMemberMessage.set(result.message ?? 'Unable to add member.');
      this.addMemberMessageTone.set('error');
    });
  }

  deleteMember(email: string): void {
    if (!this.isFamilyOwner()) return;
    const normalized = (email ?? '').trim();
    if (!normalized) return;
    if (this.removingMemberEmail()) return;

    this.removingMemberEmail.set(normalized);
    this.subscriptionsService
      .removeMember(normalized)
      .finally(() => {
        if (this.removingMemberEmail() === normalized) {
          this.removingMemberEmail.set(null);
        }
      });
  }

  logout(): void {
    this.authService.logout();
  }
}
