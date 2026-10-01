import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';

import { AdminLayoutComponent } from './features/admin/admin-layout/admin-layout.component';
import { AdminUsersComponent } from './features/admin/admin-users/admin-users.component';
import { AdminComplaintsComponent } from './features/admin/admin-complaints/admin-complaints.component';
import { AdminReadingsComponent } from './features/admin/admin-readings/admin-readings.component';
import { AdminSubscriptionsComponent } from './features/admin/admin-subscriptions/admin-subscriptions.component';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./features/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'resident',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/main-dashboard/main-dashboard.component').then(
        (m) => m.MainDashboardComponent,
      ),
    canActivate: [authGuard, subscriptionGuard],
  },
  {
    path: 'dashboard/devices',
    loadComponent: () =>
      import('./features/dashboard/device-management/device-management.component').then(
        (m) => m.DeviceManagementComponent,
      ),
    canActivate: [authGuard, subscriptionGuard],
  },
  {
    path: 'dashboard/energy',
    loadComponent: () =>
      import('./features/dashboard/energy-management/energy-management.component').then(
        (m) => m.EnergyManagementComponent,
      ),
    canActivate: [authGuard, subscriptionGuard],
  },
  {
    path: 'dashboard/complaints',
    loadComponent: () =>
      import('./features/dashboard/complaints/complaints.component').then(
        (m) => m.ComplaintsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'complaints',
    redirectTo: 'dashboard/complaints',
    pathMatch: 'full',
  },
  {
    path: 'complaint',
    redirectTo: 'dashboard/complaints',
    pathMatch: 'full',
  },
  {
    path: 'dashboard/profile',
    loadComponent: () =>
      import('./features/dashboard/profile-management/profile-management.component').then(
        (m) => m.ProfileManagementComponent,
      ),
    canActivate: [authGuard, subscriptionGuard],
  },
  {
    path: 'dashboard/subscription',
    loadComponent: () =>
      import('./features/dashboard/subscription-management/subscription-management.component').then(
        (m) => m.SubscriptionManagementComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard/notifications',
    loadComponent: () =>
      import('./features/dashboard/notifications/notifications.component').then(
        (m) => m.NotificationsComponent,
      ),
    canActivate: [authGuard, subscriptionGuard],
  },
  {
    path: 'dashboard/history',
    loadComponent: () =>
      import('./features/dashboard/history/history.component').then(
        (m) => m.HistoryComponent,
      ),
    canActivate: [authGuard, subscriptionGuard],
  },
  {
    path: 'dashboard/recordings',
    loadComponent: () =>
      import('./features/dashboard/recordings/recordings.component').then(
        (m) => m.RecordingsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard/camera',
    loadComponent: () =>
      import('./features/dashboard/camera/camera.component').then(
        (m) => m.CameraComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    component: AdminLayoutComponent,
    children: [
      { path: 'users', component: AdminUsersComponent },
      { path: 'complaints', component: AdminComplaintsComponent },
      { path: 'readings', component: AdminReadingsComponent },
      { path: 'subscriptions', component: AdminSubscriptionsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'users' },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
