import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { RecordingsService } from '../../../core/services/recordings.service';
import type { RecordingMode, RecordingItem } from '../../../core/interfaces/recording.interface';

type FilterKey = 'all' | RecordingMode;
type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-recordings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './recordings.component.html',
  styleUrl: './recordings.component.scss',
})
export class RecordingsComponent {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly recordingsService = inject(RecordingsService);

  readonly currentUser$ = this.authService.currentUser$;
  readonly isDarkSidebar = signal(true);

  readonly query = signal('');
  readonly selected = signal<FilterKey>('all');
  readonly viewMode = signal<ViewMode>('grid');

  readonly activeRecording = signal<RecordingItem | null>(null);
  readonly videoBlobUrl = signal<string | null>(null);
  readonly isLoadingVideo = signal(false);
  readonly videoError = signal<string | null>(null);

  readonly items = this.recordingsService.recordings;

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sel = this.selected();
    return this.items().filter((r) => {
      if (sel !== 'all' && r.mode !== sel) return false;
      if (!q) return true;
      const hay = `${r.title} ${r.roomLabel ?? ''} ${r.modeLabel}`.toLowerCase();
      return hay.includes(q);
    });
  });

  readonly counts = computed(() => {
    const list = this.items();
    const detection = list.filter((r) => r.mode === 'detection').length;
    const manual = list.filter((r) => r.mode === 'manual').length;
    const scheduled = list.filter((r) => r.mode === 'scheduled').length;
    return {
      all: list.length,
      detection,
      manual,
      scheduled,
    } as const;
  });

  constructor() {
    this.recordingsService.refresh();
  }

  logout(): void {
    this.authService.logout();
  }

  setFilter(value: FilterKey): void {
    this.selected.set(value);
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
    const current = this.videoBlobUrl();
    if (current) {
      URL.revokeObjectURL(current);
      this.videoBlobUrl.set(null);
    }
  }
}
