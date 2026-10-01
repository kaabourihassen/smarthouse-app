import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { DevicesService } from '../../../core/services/devices.service';
import { RoomsService } from '../../../core/services/rooms.service';
import { SubscriptionsService } from '../../../core/services/subscriptions.service';
import type { AuthUser } from '../../../core/interfaces/auth.interface';
import { startWith } from 'rxjs';

type SubscriptionInfo = {
  planName: string;
  planTag: string;
  statusLabel: string;
  durationLabel: string;
  renewalLabel: string;
  priceLabel: string;
};

type FamilyMember = {
  fullName: string;
  email: string;
  relationLabel: string;
  isActive: boolean;
};

type FamilyRole = 'spouse' | 'child' | 'parent' | 'guest';

@Component({
  selector: 'app-profile-management',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './profile-management.component.html',
  styleUrl: './profile-management.component.scss',
})
export class ProfileManagementComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly devicesService = inject(DevicesService);
  private readonly roomsService = inject(RoomsService);
  private readonly subscriptionsService = inject(SubscriptionsService);

  readonly currentUser$ = this.authService.currentUser$;

  readonly userFallback: AuthUser = {
    id: 'local',
    firstName: 'Amine',
    lastName: 'Bennour',
    email: 'amine.bennour@email.com',
    role: 'resident',
    createdAt: new Date().toISOString(),
  };

  readonly isDarkSidebar = signal(true);

  readonly currentUserSnapshot = signal<AuthUser>(this.userFallback);

  readonly isEditProfileOpen = signal(true);
  readonly isChangePasswordOpen = signal(false);

  readonly showOldPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly profileForm = this.formBuilder.nonNullable.group({
    fullName: this.formBuilder.nonNullable.control('', {
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    email: this.formBuilder.nonNullable.control('', {
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
  });

  readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: this.formBuilder.nonNullable.control('', {
      validators: [Validators.required],
    }),
    newPassword: this.formBuilder.nonNullable.control('', {
      validators: [Validators.required, Validators.minLength(8)],
    }),
    confirmPassword: this.formBuilder.nonNullable.control('', {
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  constructor() {
    this.currentUser$
      .pipe(startWith(null), takeUntilDestroyed())
      .subscribe((user) => {
        const effectiveUser = user ?? this.userFallback;
        this.currentUserSnapshot.set(effectiveUser);

        if (this.profileForm.dirty) return;

        const fullName = `${effectiveUser.firstName} ${effectiveUser.lastName}`.trim();
        this.profileForm.setValue(
          {
            fullName,
            email: effectiveUser.email,
          },
          { emitEvent: false },
        );
      });
  }

  private readonly roleLabelByKey: Readonly<Record<string, string>> = {
    admin: 'Primary administrator',
    resident: 'Primary administrator',
    member: 'Family member',
    user: 'User',
  };

  roleLabel(role?: AuthUser['role'] | null): string {
    if (!role) return 'Primary administrator';
    return this.roleLabelByKey[role] ?? 'Primary administrator';
  }

  readonly sensorsTotal = computed(() => this.devicesService.devicesList().length);

  readonly sensorsByRoom = computed(() => {
    const devices = this.devicesService.devicesList();
    const rooms = this.roomsService.roomsList();

    const countByRoom = new Map<string, number>();
    for (const d of devices) {
      const key = (d.room ?? '').trim();
      if (!key) continue;
      countByRoom.set(key, (countByRoom.get(key) ?? 0) + 1);
    }

    return rooms
      .map((r) => ({ label: r.label, value: countByRoom.get(r.key) ?? 0 }))
      .filter((r) => r.value > 0);
  });

  private readonly subscriptionInfo = computed<SubscriptionInfo>(() => {
    const sub = this.subscriptionsService.subscription();
    if (!sub) {
      return {
        planName: '—',
        planTag: '—',
        statusLabel: 'No subscription',
        durationLabel: '—',
        renewalLabel: '—',
        priceLabel: '—',
      };
    }

    const plan = this.planDisplay(sub.planId);
    const statusLabel = this.statusDisplay(sub.status, sub.cancelAtPeriodEnd);
    const periodEndLabel = this.periodEndLabel(sub.currentPeriodEnd, sub.cancelAtPeriodEnd);
    const priceLabel = this.priceLabelFromStripe(sub) ?? this.priceLabelFromPlanId(sub.planId);

    return {
      planName: plan.name,
      planTag: plan.tag,
      statusLabel,
      durationLabel: 'Subscription',
      renewalLabel: periodEndLabel,
      priceLabel,
    };
  });

  get subscription(): SubscriptionInfo {
    return this.subscriptionInfo();
  }

  readonly isAddMemberOpen = signal(false);

  readonly addMemberMessage = signal('');
  readonly addMemberMessageTone = signal<'success' | 'error' | ''>('');

  readonly removingMemberEmail = signal<string | null>(null);

  private readonly relationLabelByRole: Readonly<Record<FamilyRole, string>> = {
    spouse: 'Spouse',
    child: 'Child',
    parent: 'Parent',
    guest: 'Guest',
  };

  readonly addMemberForm = this.formBuilder.nonNullable.group({
    email: this.formBuilder.nonNullable.control('', {
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
  });

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

  readonly accountInfo = {
    memberSince: 'January 2024',
    lastLogin: 'Today, 09:30',
  };

  readonly profileErrorMessage = signal('');

  private extractErrorMessage(err: unknown): string {
    const anyErr = err as any;
    const msg = anyErr?.error?.message;
    if (Array.isArray(msg)) return msg.join(' ');
    if (typeof msg === 'string' && msg.trim()) return msg;
    return 'Profile update failed. Please try again.';
  }

  saveProfile(): void {
    this.profileErrorMessage.set('');

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.profileErrorMessage.set('Please fill in all required fields correctly.');
      return;
    }

    const { firstName, lastName } = this.parseFullName(this.profileForm.controls.fullName.value);
    const fallback = this.currentUserSnapshot();

    const safeFirstName = firstName || fallback.firstName;
    const safeLastName = lastName || fallback.lastName;

    this.authService
      .updateProfile({
        firstName: safeFirstName,
        lastName: safeLastName,
        email: this.profileForm.controls.email.value.trim(),
      })
      .subscribe({
        next: (user) => {
          this.currentUserSnapshot.set(user);
          this.profileForm.markAsPristine();
        },
        error: (err) => {
          this.profileErrorMessage.set(this.extractErrorMessage(err));
        },
      });
  }

  resetProfileForm(): void {
    const user = this.currentUserSnapshot();
    this.profileForm.setValue(
      {
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
      },
      { emitEvent: false },
    );
    this.profileForm.markAsPristine();
  }

  submitPasswordChange(): void {
    if (this.passwordForm.invalid) return;

    const currentPassword = this.passwordForm.controls.currentPassword.value;
    const newPassword = this.passwordForm.controls.newPassword.value;
    const confirmPassword = this.passwordForm.controls.confirmPassword.value;
    if (newPassword !== confirmPassword) return;

    this.authService
      .changePassword({ currentPassword, newPassword })
      .subscribe({
        next: (user) => {
          this.currentUserSnapshot.set(user);
          this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
          this.showOldPassword.set(false);
          this.showNewPassword.set(false);
          this.showConfirmPassword.set(false);
          this.isChangePasswordOpen.set(false);
        },
      });
  }

  toggleAddMember(): void {
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

  private planDisplay(planId?: string): { name: string; tag: string } {
    if (planId === 'basic') return { name: 'Basic', tag: 'Basic' };
    if (planId === 'premium-plus') return { name: 'Premium Plus', tag: 'Pro' };
    if (planId === 'extended-pro') return { name: 'Extended Pro', tag: 'Pro' };
    if (planId && planId.trim()) return { name: planId, tag: 'Plan' };
    return { name: '—', tag: '—' };
  }

  private statusDisplay(status?: string, cancelAtPeriodEnd?: boolean): string {
    const key = (status ?? '').toLowerCase();
    const base =
      key === 'active'
        ? 'Active'
        : key === 'trialing'
          ? 'Trial'
          : key === 'past_due'
            ? 'Past due'
            : key === 'canceled'
              ? 'Canceled'
              : key === 'unpaid'
                ? 'Unpaid'
                : key
                  ? key
                  : 'Unknown';

    if (cancelAtPeriodEnd && key === 'active') return `${base} (canceling)`;
    return base;
  }

  private periodEndLabel(iso?: string, cancelAtPeriodEnd?: boolean): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';

    const label = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(date)
      .replace('.', '');

    return cancelAtPeriodEnd ? `Ends: ${label}` : `Renewal: ${label}`;
  }

  private priceLabelFromStripe(sub: {
    priceUnitAmount?: number;
    priceCurrency?: string;
    priceInterval?: string;
    priceIntervalCount?: number;
    priceId?: string;
  }): string | null {
    const amount = sub.priceUnitAmount;
    const currency = sub.priceCurrency;
    if (typeof amount !== 'number' || !currency) return null;

    const normalizedCurrency = currency.toUpperCase();
    const formattedAmount = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount / 100);

    const interval = (sub.priceInterval ?? '').toLowerCase();
    const count = typeof sub.priceIntervalCount === 'number' ? sub.priceIntervalCount : 1;

    const unit = interval === 'year' ? 'year' : interval === 'week' ? 'week' : interval === 'day' ? 'day' : 'month';
    const suffix = count === 1 ? `/${unit}` : `/${count} ${unit}s`;
    return `${formattedAmount}${suffix}`;
  }

  private priceLabelFromPlanId(planId?: string): string {
    if (planId === 'basic') return '€19.99/mo';
    if (planId === 'premium-plus') return '€49.99/mo';
    if (planId === 'extended-pro') return '€99.99/mo';
    return '—';
  }

  private parseFullName(raw: string): { firstName: string; lastName: string } {
    const parts = raw
      .trim()
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
  }

  logout(): void {
    this.authService.logout();
  }
}
