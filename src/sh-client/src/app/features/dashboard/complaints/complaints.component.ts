import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule, AsyncPipe, SlicePipe, UpperCasePipe, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ComplaintsService } from '../../../core/services/complaints.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import type { ComplaintRecord } from '../../../core/interfaces/complaint.interface';

@Component({
  selector: 'app-complaints',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    AsyncPipe,
    SlicePipe,
    UpperCasePipe,
    DatePipe,
  ],
  templateUrl: './complaints.component.html',
  styleUrl: './complaints.component.scss',
})
export class ComplaintsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly complaintsService = inject(ComplaintsService);
  private readonly notificationsService = inject(NotificationsService);

  readonly currentUser$ = this.auth.currentUser$;
  readonly unreadNotificationsCount = this.notificationsService.unreadCount;

  readonly isDarkSidebar = signal<boolean>(true);
  readonly complaints = signal<ComplaintRecord[]>([]);
  readonly loadingList = signal<boolean>(true);
  readonly isFormOpen = signal<boolean>(false);
  readonly submitting = signal<boolean>(false);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  readonly statusFilter = signal<'all' | 'pending' | 'reviewed' | 'resolved' | 'rejected'>('all');
  readonly searchQuery = signal<string>('');

  readonly totalCount = computed(() => this.complaints().length);
  readonly pendingCount = computed(() => this.complaints().filter((c) => c.status === 'pending').length);
  readonly reviewedCount = computed(() => this.complaints().filter((c) => c.status === 'reviewed').length);
  readonly resolvedCount = computed(() => this.complaints().filter((c) => c.status === 'resolved').length);

  readonly filteredComplaints = computed(() => {
    const filter = this.statusFilter();
    const query = this.searchQuery().toLowerCase().trim();
    return this.complaints().filter((c) => {
      const matchStatus = filter === 'all' || c.status === filter;
      const matchQuery =
        !query ||
        (c.title && c.title.toLowerCase().includes(query)) ||
        (c.message && c.message.toLowerCase().includes(query)) ||
        (c.adminResponse && c.adminResponse.toLowerCase().includes(query));
      return matchStatus && matchQuery;
    });
  });

  complaintForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    category: ['general', [Validators.required]],
    message: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  ngOnInit() {
    this.loadComplaints();
  }

  async loadComplaints() {
    this.loadingList.set(true);
    try {
      const list = await this.complaintsService.getMyComplaints();
      this.complaints.set(list);
    } catch {
      // ignore
    } finally {
      this.loadingList.set(false);
    }
  }

  toggleAddForm() {
    this.successMsg.set(null);
    this.errorMsg.set(null);
    this.isFormOpen.update((open) => !open);
  }

  closeForm() {
    this.isFormOpen.set(false);
    this.complaintForm.reset({ category: 'general' });
    this.successMsg.set(null);
    this.errorMsg.set(null);
  }

  setStatusFilter(filter: 'all' | 'pending' | 'reviewed' | 'resolved' | 'rejected') {
    this.statusFilter.set(filter);
  }

  onSearchChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value ?? '');
  }

  async submitComplaint() {
    if (this.complaintForm.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.successMsg.set(null);
    this.errorMsg.set(null);

    const val = this.complaintForm.value;
    const titleWithCategory =
      val.category && val.category !== 'general'
        ? `[${val.category.toUpperCase()}] ${val.title.trim()}`
        : val.title.trim();

    try {
      const created = await this.complaintsService.create({
        title: titleWithCategory,
        message: val.message.trim(),
      });
      this.successMsg.set('Your complaint has been submitted successfully.');
      this.complaints.update((curr) => [created, ...curr]);
      this.complaintForm.reset({ category: 'general' });
      setTimeout(() => {
        this.isFormOpen.set(false);
        this.successMsg.set(null);
      }, 2500);
    } catch (err: any) {
      this.errorMsg.set(err?.error?.message ?? err?.message ?? 'Failed to submit complaint.');
    } finally {
      this.submitting.set(false);
    }
  }

  logout() {
    this.auth.logout();
  }
}
