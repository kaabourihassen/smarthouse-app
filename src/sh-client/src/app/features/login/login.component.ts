import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthLayoutComponent } from '../../shared/components/layout/auth-layout/auth-layout.component';
import { ShInputComponent } from '../../shared/components/forms/sh-input/sh-input.component';
import { ShCheckboxComponent } from '../../shared/components/forms/sh-checkbox/sh-checkbox.component';
import { ShButtonComponent } from '../../shared/components/buttons/sh-button/sh-button.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AuthLayoutComponent,
    ShInputComponent,
    ShCheckboxComponent,
    ShButtonComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';

  private googleInitialized = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      rememberMe: [false],
    });
  }

  private extractErrorMessage(err: unknown): string {
    const anyErr = err as any;
    const msg = anyErr?.error?.message;
    const status = anyErr?.status;
    if (status === 401) return 'Email or password incorrect.';
    if (Array.isArray(msg)) return msg.join(' ');
    if (typeof msg === 'string' && msg.trim()) {
      if (msg.toLowerCase().includes('invalid credentials')) {
        return 'Email or password incorrect.';
      }
      return msg;
    }
    return 'Login failed. Please try again.';
  }

  onSignIn(): void {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    const { email, password } = this.loginForm.value;

    this.authService.login({ email, password }).subscribe({
      next: (res) => {
        const role = res?.user?.role;
        const target = role === 'admin' ? ['/admin/users'] : ['/dashboard'];
        this.router.navigate(target).finally(() => {
          this.isLoading = false;
        });
      },
      error: (err) => {
        this.errorMessage = this.extractErrorMessage(err);
        this.isLoading = false;
      },
    });
  }

  onGoogleSignIn(): void {
    const clientId = (window as any).__GOOGLE_CLIENT_ID__ as string | undefined;
    if (!clientId) {
      this.errorMessage = 'Google sign-in is not configured (missing GOOGLE_CLIENT_ID).';
      return;
    }

    const accountsId = (window as any).google?.accounts?.id;
    if (!accountsId) {
      this.errorMessage = 'Google sign-in script not loaded. Please refresh and try again.';
      return;
    }

    if (!this.googleInitialized) {
      accountsId.initialize({
        client_id: clientId,
        callback: (response: any) => {
          const credential = response?.credential as string | undefined;
          if (!credential) {
            this.errorMessage = 'Google sign-in failed. Please try again.';
            return;
          }

          this.isLoading = true;
          this.errorMessage = '';

          this.authService.googleLogin(credential).subscribe({
            next: (res) => {
              const role = res?.user?.role;
              const target = role === 'admin' ? ['/admin/users'] : ['/dashboard'];
              this.router.navigate(target).finally(() => {
                this.isLoading = false;
              });
            },
            error: (err) => {
              this.errorMessage = this.extractErrorMessage(err);
              this.isLoading = false;
            },
          });
        },
      });
      this.googleInitialized = true;
    }

    // Shows Google's account chooser / One Tap UI.
    accountsId.prompt();
  }

  onForgotPassword(): void {
    console.log('Forgot password clicked');
  }

  navigateToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
