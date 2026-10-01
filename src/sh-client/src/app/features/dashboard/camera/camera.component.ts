import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, ElementRef, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { CamerasService } from '../../../core/services/cameras.service';
import { RecordingsService } from '../../../core/services/recordings.service';
import { ScreenshotsService } from '../../../core/services/screenshots.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import type { RecordingItem } from '../../../core/interfaces/recording.interface';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './camera.component.html',
  styleUrl: './camera.component.scss',
})
export class CameraComponent {
  @ViewChild('liveImg') private readonly liveImg?: ElementRef<HTMLImageElement>;
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly camerasService = inject(CamerasService);
  private readonly recordingsService = inject(RecordingsService);
  private readonly screenshotsService = inject(ScreenshotsService);
  private readonly notificationsService = inject(NotificationsService);

  // Fallback (legacy) stream endpoint
  private readonly legacyLiveStreamUrl = 'http://192.168.1.13/';
  // Offline/dev fallback (works with sh-api fake:cam)
  private readonly localFakeStreamUrl = 'http://localhost:8090/stream';

  readonly currentUser$ = this.authService.currentUser$;
  readonly isDarkSidebar = signal(true);
  readonly unreadNotificationsCount = this.notificationsService.unreadCount;

  readonly camera = computed(() => this.camerasService.cameras()[0] ?? null);
  readonly screenshots = this.screenshotsService.screenshots;

  readonly liveStreamUrl = computed(() => {
    if (this.isLivePaused()) return '';
    const c = this.camera();
    const url = (c?.streamUrl ?? '').trim();
    const cameraId = c?.id ?? 'default';
    const proxyUrl = this.proxyStreamUrl(cameraId);

    if (this.shouldUseProxyStream()) return proxyUrl;

    if (url) return this.normalizeStreamUrl(url);

    const host = (() => {
      try {
        return typeof window !== 'undefined' ? window.location.hostname : '';
      } catch {
        return '';
      }
    })();

    if (host === 'localhost' || host === '127.0.0.1') {
      return this.normalizeStreamUrl(this.legacyLiveStreamUrl || this.localFakeStreamUrl);
    }
    return this.normalizeStreamUrl(this.legacyLiveStreamUrl || this.localFakeStreamUrl);
  });

  private shouldUseProxyStream(): boolean {
    return true;
  }

  private proxyStreamUrl(cameraId: string): string {
    const safeId = encodeURIComponent(cameraId || 'default');
    return `/api/cameras/${safeId}/stream`;
  }

  private streamUrlForApi(): string | undefined {
    const url = this.liveStreamUrl();
    if (!url) return undefined;
    if (url.startsWith('/')) return undefined;
    return url;
  }

  private normalizeStreamUrl(raw: string): string {
    const value = raw.trim();
    if (!value) return '';

    try {
      const url = new URL(value);
      if (!url.pathname || url.pathname === '') url.pathname = '/';
      return url.toString();
    } catch {
      return value.endsWith('/') ? value : `${value}/`;
    }
  }

  readonly stats = computed(() => {
    const camera = this.camera();
    const recordings = this.recordingsService.recordings();

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const detectionsToday = recordings.filter(
      (r) => r.mode === 'detection' && new Date(r.startedAt) >= startOfDay,
    ).length;

    const totalSeconds = recordings.reduce((acc, r) => acc + (r.durationSeconds ?? 0), 0);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const totalDurationLabel = `${h}h ${m}min`;

    const usedBytes = recordings.reduce((acc, r) => acc + (r.sizeBytes ?? 0), 0);
    const usedGb = usedBytes / (1024 * 1024 * 1024);
    const totalGb = camera?.storageTotalGb ?? 50;
    const usedLabel = `${usedGb.toFixed(1)} GB / ${totalGb} GB`;

    return {
      qualityLabel: camera?.qualityLabel ?? '—',
      totalDurationLabel,
      detectionsToday,
      storageLabel: usedLabel,
    };
  });

  readonly nowLabel = computed(() => {
    const dt = new Date();
    const date = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(dt);
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(dt);
    return `${capitalize(date)} - ${time}`;
  });

  readonly isMicOn = signal(true);
  readonly isSoundOn = signal(false);
  readonly isLivePaused = signal(false);
  readonly isRecording = signal(false);
  readonly isRecordingPending = signal(false);
  private readonly recordingSessionId = signal<string | null>(null);

  readonly isCapturePending = signal(false);
  readonly captureError = signal<string | null>(null);

  readonly recordings = this.recordingsService.recordings;
  readonly activeRecording = signal<RecordingItem | null>(null);
  readonly videoBlobUrl = signal<string | null>(null);
  readonly isLoadingVideo = signal(false);
  readonly videoError = signal<string | null>(null);

  constructor() {
    this.camerasService.refresh();
    this.recordingsService.refresh();

    effect(() => {
      const cameraId = this.camera()?.id ?? 'default';
      this.screenshotsService.refresh({ cameraId, limit: 12 });
      this.recordingsService.refresh({ cameraId });
    });

    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        // trigger computed refresh for timestamp
        this.nowLabel();
      });

    interval(5000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.camerasService.refresh();
        const cameraId = this.camera()?.id ?? 'default';
        this.screenshotsService.refresh({ cameraId, limit: 12 });
        this.recordingsService.refresh({ cameraId });
      });
  }

  logout(): void {
    this.authService.logout();
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecordingPending()) return;

    const camera = this.camera();
    const cameraId = camera?.id ?? 'default';
    const cameraName = camera?.name ?? 'Caméra principale';
    const roomLabel = camera?.roomLabel ?? 'Living Room';

    const sessionId = this.recordingSessionId();
    if (sessionId) {
      this.isRecordingPending.set(true);
      this.recordingsService.stopRecording(sessionId).subscribe({
        next: () => {
          this.recordingSessionId.set(null);
          this.isRecording.set(false);
          this.isRecordingPending.set(false);
          this.isLivePaused.set(false);
          // refresh stats/list after persisting
          this.recordingsService.refresh(camera ? { cameraId } : {});
        },
        error: (err) => {
          this.isRecordingPending.set(false);
          // keep previous state; stop failed
          // eslint-disable-next-line no-console
          console.error('Stop recording failed', err);
          this.isLivePaused.set(false);
        },
      });
      return;
    }

    await this.pauseLiveForRecording();
    this.isRecordingPending.set(true);
    this.recordingsService
      .startRecording({
        cameraId,
        mode: 'manual',
        title: `Recording · ${cameraName}`,
        roomLabel,
        streamUrl: this.streamUrlForApi(),
      })
      .subscribe({
        next: (res) => {
          this.isRecordingPending.set(false);
          if (!res?.sessionId) {
            this.isLivePaused.set(false);
            return;
          }
          this.recordingSessionId.set(res.sessionId);
          this.isRecording.set(true);
        },
        error: (err) => {
          this.isRecordingPending.set(false);
          this.recordingSessionId.set(null);
          this.isRecording.set(false);
          this.isLivePaused.set(false);
          // eslint-disable-next-line no-console
          console.error('Start recording failed', err);
        },
      });
  }

  private pauseLiveForRecording(): Promise<void> {
    this.isLivePaused.set(true);
    return new Promise((resolve) => setTimeout(resolve, 2500));
  }

  onStreamError(): void {
    if (this.isLivePaused()) return;
    this.isLivePaused.set(true);
    setTimeout(() => {
      this.isLivePaused.set(false);
    }, 1500);
  }

  captureScreenshot(): void {
    if (this.isCapturePending()) return;
    this.captureError.set(null);

    const camera = this.camera();
    const cameraId = camera?.id ?? 'default';
    const cameraName = camera?.name ?? 'Caméra principale';
    const roomLabel = camera?.roomLabel ?? 'Living Room';

    this.isCapturePending.set(true);
    this.captureScreenshotFromImage()
      .then((base64) => {
        if (base64) {
          return this.screenshotsService.captureFromClient({
            cameraId,
            imageBase64: base64,
            roomLabel,
            title: `Screenshot · ${cameraName}`,
          });
        }

        return this.screenshotsService.captureFromLive({
          cameraId,
          streamUrl: this.streamUrlForApi(),
          roomLabel,
          title: `Screenshot · ${cameraName}`,
        });
      })
      .then((obs) => {
        obs.subscribe({
          next: () => {
            this.isCapturePending.set(false);
            this.screenshotsService.refresh({ cameraId, limit: 12 });
          },
          error: (err) => {
            this.isCapturePending.set(false);
            const msg = String(err?.error?.message ?? err?.message ?? 'Capture failed');
            this.captureError.set(msg);
            // eslint-disable-next-line no-console
            console.error('Capture screenshot failed', err);
          },
        });
      })
      .catch((err) => {
        this.isCapturePending.set(false);
        const msg = String(err?.message ?? 'Capture failed');
        this.captureError.set(msg);
        // eslint-disable-next-line no-console
        console.error('Capture screenshot failed', err);
      });
  }

  thumbBg(r: RecordingItem): string {
    const url = (r.thumbnailUrl ?? '').trim() || '/assets/camera/recording.jpg';
    return `url("${url}")`;
  }

  playRecording(r: RecordingItem): void {
    this.cleanupBlob();
    this.activeRecording.set(r);
    this.videoError.set(null);

    const url = r.fileUrl;
    if (!url) {
      this.videoBlobUrl.set(null);
      return;
    }

    this.isLoadingVideo.set(true);
    this.http.get(url, { responseType: 'blob', withCredentials: true }).subscribe({
      next: (blob) => {
        const objUrl = URL.createObjectURL(blob);
        this.videoBlobUrl.set(objUrl);
        this.isLoadingVideo.set(false);
      },
      error: () => {
        this.isLoadingVideo.set(false);
        this.videoError.set('Impossible de charger le fichier vidéo.');
      },
    });
  }

  closePlayer(): void {
    this.cleanupBlob();
    this.activeRecording.set(null);
    this.videoError.set(null);
  }

  private cleanupBlob(): void {
    const cur = this.videoBlobUrl();
    if (cur) {
      try {
        URL.revokeObjectURL(cur);
      } catch {
        // ignore
      }
      this.videoBlobUrl.set(null);
    }
  }

  downloadLatestVideo(): void {
    const list = this.recordings();
    if (list.length > 0) {
      this.playRecording(list[0]);
    }
  }

  private async captureScreenshotFromImage(): Promise<string | null> {
    const img = this.liveImg?.nativeElement;
    if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.9),
    );
    if (!blob) return null;

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read screenshot'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsDataURL(blob);
    });
  }
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
