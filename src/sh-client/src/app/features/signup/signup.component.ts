import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ShInputComponent } from '../../shared/components/forms/sh-input/sh-input.component';
import { ShButtonComponent } from '../../shared/components/buttons/sh-button/sh-button.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ShInputComponent,
    ShButtonComponent,
  ],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class SignupComponent {
  signupForm: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
  ) {
    this.signupForm = this.fb.group(
      {
        firstName: ['', [Validators.required]],
        lastName: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    return null;
  }

  private extractErrorMessage(err: unknown): string {
    const anyErr = err as any;
    const msg = anyErr?.error?.message;
    if (Array.isArray(msg)) return msg.join(' ');
    if (typeof msg === 'string' && msg.trim()) return msg;
    return 'Registration failed. Please try again.';
  }

  onCreateAccount(): void {
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();

      if (this.signupForm.hasError('passwordMismatch')) {
        this.errorMessage = 'Passwords do not match.';
      } else {
        this.errorMessage = 'Please fill in all required fields correctly.';
      }
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const { firstName, lastName, email, password } = this.signupForm.value;

    this.authService.register({ firstName, lastName, email, password }).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/dashboard/devices']);
      },
      error: (err) => {
        this.errorMessage = this.extractErrorMessage(err);
        this.isLoading = false;
      },
    });
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }
}
