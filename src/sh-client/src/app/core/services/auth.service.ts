import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, lastValueFrom, map, of, tap } from 'rxjs';
import {
  AuthUser,
  ChangePasswordPayload,
  SessionResponse,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from '../interfaces/auth.interface';

const API_URL = '/api/auth';
const OPTS = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);

  readonly currentUser$ = this.currentUserSubject.asObservable();

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  /** Called once at app startup to restore session from httpOnly cookie. */
  initSession(): Promise<void> {
    return lastValueFrom(
      this.http.get<AuthUser>(`${API_URL}/me`, OPTS).pipe(
        tap((user) => this.currentUserSubject.next(user)),
        catchError(() => {
          this.currentUserSubject.next(null);
          return of(null);
        }),
      ),
    ).then(() => undefined);
  }

  login(payload: LoginPayload): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(`${API_URL}/login`, payload, OPTS)
      .pipe(tap((res) => this.currentUserSubject.next(res.user)));
  }

  register(payload: RegisterPayload): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(`${API_URL}/register`, payload, OPTS)
      .pipe(tap((res) => this.currentUserSubject.next(res.user)));
  }

  googleLogin(credential: string): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(`${API_URL}/google`, { credential }, OPTS)
      .pipe(tap((res) => this.currentUserSubject.next(res.user)));
  }

  logout(): void {
    this.http.post(`${API_URL}/logout`, {}, OPTS).subscribe({
      complete: () => {
        this.currentUserSubject.next(null);
        this.router.navigate(['/login']);
      },
    });
  }

  updateProfile(payload: UpdateProfilePayload): Observable<AuthUser> {
    return this.http
      .patch<{ user: AuthUser }>(`${API_URL}/me`, payload, OPTS)
      .pipe(
        tap((res) => this.currentUserSubject.next(res.user)),
        map((res) => res.user),
      );
  }

  changePassword(payload: ChangePasswordPayload): Observable<AuthUser> {
    return this.http
      .post<{ user: AuthUser }>(`${API_URL}/change-password`, payload, OPTS)
      .pipe(
        tap((res) => this.currentUserSubject.next(res.user)),
        map((res) => res.user),
      );
  }
}
