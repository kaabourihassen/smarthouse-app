import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationsService } from '../../../core/services/notifications.service';

type Period = 'day' | 'week' | 'month';

type KpiTrend = 'up' | 'down' | 'flat';
type KpiIcon = 'bolt' | 'sun' | 'tnd' | 'avg';
type Kpi = {
  icon: KpiIcon;
  value: string;
  label: string;
  hint: string;
  trend: KpiTrend;
};

type ChartPoint = {
  x: number;
  y: number;
  label: string;
  value: number;
};

const COMPLAINTS_API_URL = '/api/complaints';

const L33T_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
};

const BANNED_TOKENS = new Set([
  // English
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'pussy',
  'cunt',
  // French
  'merde',
  'putain',
  'connard',
  'salope',
]);

@Component({
  selector: 'app-energy-management',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './energy-management.component.html',
  styleUrl: './energy-management.component.scss',
})
export class EnergyManagementComponent {
  private readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly notificationsService = inject(NotificationsService);

  readonly isDarkSidebar = signal(true);
  readonly currentUser$ = this.authService.currentUser$;
  readonly unreadNotificationsCount = this.notificationsService.unreadCount;
  readonly period = signal<Period>('week');

  // Approximate Tunisian electricity tariff (TND per kWh).
  // Not meant to be precise — just functional.
  private readonly tndPerKwh = 0.35;

  readonly isComplaintOpen = signal(false);
  readonly complaintSubmitting = signal(false);
  readonly complaintSuccess = signal<string | null>(null);
  readonly complaintError = signal<string | null>(null);

  readonly complaintForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(120)],
    }),
    message: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(2000)],
    }),
  });

  // Demo weekly series (kWh). Cost is derived from this via `tndPerKwh`.
  readonly consumptionSeriesWeek = [
    { label: 'Mon', kwh: 7.0 },
    { label: 'Tue', kwh: 10.8 },
    { label: 'Wed', kwh: 8.6 },
    { label: 'Thu', kwh: 12.6 },
    { label: 'Fri', kwh: 10.4 },
    { label: 'Sat', kwh: 8.0 },
    { label: 'Sun', kwh: 6.6 },
  ] as const;

  readonly productionSeriesWeek = [
    { label: 'Mon', kwh: 8.2 },
    { label: 'Tue', kwh: 11.4 },
    { label: 'Wed', kwh: 9.8 },
    { label: 'Thu', kwh: 12.2 },
    { label: 'Fri', kwh: 10.6 },
    { label: 'Sat', kwh: 9.0 },
    { label: 'Sun', kwh: 7.8 },
  ] as const;

  readonly consumptionSeriesDay = [
    { label: '00', kwh: 0.6 },
    { label: '04', kwh: 0.9 },
    { label: '08', kwh: 1.6 },
    { label: '12', kwh: 2.4 },
    { label: '16', kwh: 2.0 },
    { label: '20', kwh: 1.2 },
  ] as const;

  readonly productionSeriesDay = [
    { label: '00', kwh: 0.0 },
    { label: '04', kwh: 0.1 },
    { label: '08', kwh: 0.8 },
    { label: '12', kwh: 2.2 },
    { label: '16', kwh: 1.1 },
    { label: '20', kwh: 0.1 },
  ] as const;

  readonly consumptionSeriesMonth = [
    { label: 'W1', kwh: 56 },
    { label: 'W2', kwh: 62 },
    { label: 'W3', kwh: 58 },
    { label: 'W4', kwh: 64 },
  ] as const;

  readonly productionSeriesMonth = [
    { label: 'W1', kwh: 60 },
    { label: 'W2', kwh: 66 },
    { label: 'W3', kwh: 61 },
    { label: 'W4', kwh: 68 },
  ] as const;

  readonly breakdown = [
    { label: 'Air conditioning', value: 35 },
    { label: 'Lighting', value: 25 },
    { label: 'Heating', value: 20 },
    { label: 'Other', value: 20 },
  ] as const;

  readonly totalConsumptionWeek = computed(() =>
    this.sum(this.consumptionSeriesWeek.map((p) => p.kwh)),
  );

  readonly totalProductionWeek = computed(() =>
    this.sum(this.productionSeriesWeek.map((p) => p.kwh)),
  );

  readonly totalCostWeekTnd = computed(() => this.totalConsumptionWeek() * this.tndPerKwh);

  readonly dailyAverageWeek = computed(() => this.totalConsumptionWeek() / this.consumptionSeriesWeek.length);

  readonly kpis = computed(() => {
    const totalConsumption = this.totalConsumptionWeek();
    const totalProduction = this.totalProductionWeek();
    const totalCost = this.totalCostWeekTnd();
    const dailyAvg = this.dailyAverageWeek();

    const items: Kpi[] = [
      {
        icon: 'bolt',
        value: `${this.formatKwh(totalConsumption)} kWh`,
        label: 'Total consumption',
        hint: 'This week',
        trend: 'up',
      },
      {
        icon: 'sun',
        value: `${this.formatKwh(totalProduction)} kWh`,
        label: 'Solar production',
        hint: 'This week',
        trend: 'up',
      },
      {
        icon: 'tnd',
        value: this.formatTnd(totalCost),
        label: 'Estimated cost',
        hint: `~${this.tndPerKwh.toFixed(2)} TND / kWh`,
        trend: 'flat',
      },
      {
        icon: 'avg',
        value: `${this.formatKwh(dailyAvg)} kWh`,
        label: 'Daily average',
        hint: 'This week',
        trend: 'flat',
      },
    ];

    return items;
  });

  readonly costSeriesWeekTnd = computed(() =>
    this.consumptionSeriesWeek.map((p) => ({ label: p.label, value: p.kwh * this.tndPerKwh })),
  );

  readonly costChart = computed(() => {
    const series = this.costSeriesWeekTnd();
    const values = series.map((p) => p.value);
    const points = this.makeLinePoints(values, 760, 220, 60, 40, 660, 160);
    const path = this.makePath(points);
    const labels = series.map((p, i) => ({ x: points[i]!.x, label: p.label }));
    return { points, path, labels };
  });

  readonly compareChart = computed(() => {
    const period = this.period();
    const { consumption, production } = this.getSeriesForPeriod(period);

    const maxValue = Math.max(
      1,
      ...consumption.map((p) => p.kwh),
      ...production.map((p) => p.kwh),
    );

    // Bar chart in a 760x300-ish viewbox (matches placeholder height).
    const viewWidth = 760;
    const viewHeight = 300;
    const left = 44;
    const top = 22;
    const chartW = 690;
    const chartH = 220;
    const baseY = top + chartH;

    const count = consumption.length;
    const groupW = chartW / Math.max(1, count);
    const innerGap = Math.min(10, groupW * 0.18);
    const barW = Math.max(10, (groupW - innerGap) / 2);
    const x0 = left;

    const bars = consumption.map((c, idx) => {
      const p = production[idx]!;
      const cx = x0 + idx * groupW;
      const ch = (c.kwh / maxValue) * chartH;
      const ph = (p.kwh / maxValue) * chartH;
      return {
        label: c.label,
        consumption: {
          x: cx + 6,
          y: baseY - ch,
          w: barW,
          h: ch,
          value: c.kwh,
        },
        production: {
          x: cx + 6 + barW + innerGap,
          y: baseY - ph,
          w: barW,
          h: ph,
          value: p.kwh,
        },
        tickX: cx + groupW / 2,
      };
    });

    const yGrid = [
      { y: top + chartH * 0.25 },
      { y: top + chartH * 0.5 },
      { y: top + chartH * 0.75 },
    ];

    return {
      viewBox: `0 0 ${viewWidth} ${viewHeight}`,
      left,
      top,
      chartW,
      chartH,
      baseY,
      bars,
      yGrid,
    };
  });

  logout(): void {
    this.authService.logout();
  }

  exportData(): void {
    void this.exportEnergyPdf();
  }

  createReport(): void {
    const next = !this.isComplaintOpen();
    this.isComplaintOpen.set(next);

    if (next) {
      this.complaintSuccess.set(null);
      this.complaintError.set(null);
      this.complaintForm.markAsPristine();
      this.complaintForm.markAsUntouched();
    }
  }

  closeComplaint(): void {
    this.isComplaintOpen.set(false);
    this.complaintSubmitting.set(false);
    this.complaintSuccess.set(null);
    this.complaintError.set(null);
  }

  titleError(): string | null {
    const c = this.complaintForm.controls.title;
    if (!(c.touched || c.dirty)) return null;
    if (c.hasError('required')) return 'Title is required.';
    if (c.hasError('minlength')) return 'Title must be at least 3 characters.';
    if (c.hasError('maxlength')) return 'Title must be at most 120 characters.';
    return null;
  }

  messageError(): string | null {
    const c = this.complaintForm.controls.message;
    if (!(c.touched || c.dirty)) return null;
    if (c.hasError('required')) return 'Message is required.';
    if (c.hasError('minlength')) return 'Message must be at least 3 characters.';
    if (c.hasError('maxlength')) return 'Message must be at most 2000 characters.';
    return null;
  }

  async submitComplaint(): Promise<void> {
    this.complaintSuccess.set(null);
    this.complaintError.set(null);

    if (this.complaintForm.invalid) {
      this.complaintForm.markAllAsTouched();
      return;
    }

    const title = this.complaintForm.controls.title.value.trim();
    const message = this.complaintForm.controls.message.value.trim();

    // Keep client-side trimming consistent with the API expectations.
    if (title.length < 3 || message.length < 3) {
      this.complaintForm.controls.title.setValue(title);
      this.complaintForm.controls.message.setValue(message);
      this.complaintForm.markAllAsTouched();
      return;
    }

    const bad = this.findOffensiveToken(`${title} ${message}`);
    if (bad) {
      this.complaintError.set(
        'Your complaint contains offensive language. Please rephrase and try again.',
      );
      return;
    }

    this.complaintSubmitting.set(true);
    try {
      await firstValueFrom(this.http.post(COMPLAINTS_API_URL, { title, message }));
      this.complaintForm.reset({ title: '', message: '' });
      this.complaintSuccess.set('Your complaint has been sent.');
    } catch (err) {
      const message = this.extractApiErrorMessage(err);
      this.complaintError.set(message ?? 'Failed to send complaint. Please try again.');
    } finally {
      this.complaintSubmitting.set(false);
    }
  }

  private normalizeForModeration(text: string): string {
    const lowered = (text ?? '').toLowerCase();
    const noMarks = lowered
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '');

    const mapped = noMarks
      .split('')
      .map((ch) => L33T_MAP[ch] ?? ch)
      .join('');

    return mapped
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findOffensiveToken(input: string): string | null {
    const norm = this.normalizeForModeration(input);
    if (!norm) return null;

    const tokens = norm.split(' ').filter(Boolean);
    for (const token of tokens) {
      if (BANNED_TOKENS.has(token)) return token;
      const collapsed = token.replace(/(.)\1{2,}/g, '$1$1');
      if (BANNED_TOKENS.has(collapsed)) return collapsed;
    }
    return null;
  }

  private extractApiErrorMessage(err: unknown): string | null {
    if (!(err instanceof HttpErrorResponse)) return null;

    // NestJS default error shape: { statusCode, message, error }
    const data = err.error as any;
    const msg = typeof data?.message === 'string' ? data.message : null;
    return msg;
  }

  private sum(values: number[]): number {
    return values.reduce((acc, v) => acc + v, 0);
  }

  private async exportEnergyPdf(): Promise<void> {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 40;
    let y = 54;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Energy report', marginX, y);

    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const generatedAt = new Date();
    doc.text(`Generated: ${generatedAt.toLocaleString()}`, marginX, y);

    y += 16;
    doc.text(`Period: ${this.period().toUpperCase()}`, marginX, y);

    y += 16;
    doc.text(`Tariff (approx): ~${this.tndPerKwh.toFixed(2)} TND / kWh`, marginX, y);

    y += 18;
    const kpiRows = this.kpis().map((k) => [k.label, k.value, k.hint]);
    autoTable(doc, {
      startY: y,
      head: [['KPI', 'Value', 'Note']],
      body: kpiRows,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [7, 30, 52], textColor: 255 },
      margin: { left: marginX, right: marginX },
    });

    const afterKpisY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY;
    y = (afterKpisY ?? y) + 18;

    const { consumption, production } = this.getSeriesForPeriod(this.period());
    const seriesRows = consumption.map((c, idx) => {
      const p = production[idx]!;
      const net = p.kwh - c.kwh;
      const costTnd = c.kwh * this.tndPerKwh;
      return [
        c.label,
        `${this.formatKwh(c.kwh)} kWh`,
        `${this.formatKwh(p.kwh)} kWh`,
        `${this.formatKwh(net)} kWh`,
        this.formatTnd(costTnd),
      ];
    });

    const totalConsumption = this.sum(consumption.map((p) => p.kwh));
    const totalProduction = this.sum(production.map((p) => p.kwh));
    const totalNet = totalProduction - totalConsumption;
    const totalCostTnd = totalConsumption * this.tndPerKwh;
    seriesRows.push([
      'Total',
      `${this.formatKwh(totalConsumption)} kWh`,
      `${this.formatKwh(totalProduction)} kWh`,
      `${this.formatKwh(totalNet)} kWh`,
      this.formatTnd(totalCostTnd),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Slot', 'Consumption', 'Production', 'Net', 'Est. cost (TND)']],
      body: seriesRows,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [15, 184, 212], textColor: [13, 51, 82] },
      margin: { left: marginX, right: marginX },
    });

    const stamp = `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(
      generatedAt.getDate(),
    ).padStart(2, '0')}`;
    doc.save(`energy-${this.period()}-${stamp}.pdf`);
  }

  private formatTnd(amount: number): string {
    return `${amount.toFixed(2)} TND`;
  }

  private formatKwh(kwh: number): string {
    // Display friendly values; keep 0 decimals if large.
    const decimals = kwh >= 50 ? 0 : 1;
    return kwh.toFixed(decimals);
  }

  private makeLinePoints(
    values: number[],
    viewW: number,
    viewH: number,
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
  ): ChartPoint[] {
    const count = Math.max(1, values.length);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);

    // Add a little padding so the line breathes.
    const span = Math.max(0.001, maxV - minV);
    const pad = span * 0.15;
    const low = minV - pad;
    const high = maxV + pad;

    const usableW = xMax - xMin;
    const usableH = yMax - yMin;

    return values.map((v, idx) => {
      const t = count === 1 ? 0 : idx / (count - 1);
      const x = xMin + t * usableW;
      const vn = (v - low) / Math.max(0.001, high - low);
      const y = yMax - vn * usableH;
      return {
        x,
        y,
        value: v,
        label: this.formatTnd(v),
      };
    });
  }

  private makePath(points: ChartPoint[]): string {
    if (points.length === 0) return '';
    return points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }

  private getSeriesForPeriod(period: Period): {
    consumption: ReadonlyArray<{ label: string; kwh: number }>;
    production: ReadonlyArray<{ label: string; kwh: number }>;
  } {
    if (period === 'day') {
      return { consumption: this.consumptionSeriesDay, production: this.productionSeriesDay };
    }
    if (period === 'month') {
      return { consumption: this.consumptionSeriesMonth, production: this.productionSeriesMonth };
    }
    return { consumption: this.consumptionSeriesWeek, production: this.productionSeriesWeek };
  }
}
