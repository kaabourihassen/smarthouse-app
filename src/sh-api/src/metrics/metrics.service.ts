import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
  Collector,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly registry: Registry;
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDuration: Histogram<string>;
  private readonly httpRequestsActive: Gauge<string>;

  constructor() {
    // Create a new registry to avoid collisions during hot reloads
    this.registry = new Registry();

    // Collect default Node.js metrics (CPU, memory, event loop, GC, etc.)
    collectDefaultMetrics({
      register: this.registry,
      prefix: '',
      gcDurationBuckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2],
    });

    // Define custom HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.httpRequestsActive = new Gauge({
      name: 'http_requests_active',
      help: 'Current number of active HTTP requests',
      labelNames: ['method', 'route'],
      registers: [this.registry],
    });
  }

  /**
   * Returns the Prometheus registry
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Increments the active requests gauge
   */
  incrementActiveRequests(method: string, route: string): void {
    this.httpRequestsActive.inc({ method, route });
  }

  /**
   * Decrements the active requests gauge
   */
  decrementActiveRequests(method: string, route: string): void {
    this.httpRequestsActive.dec({ method, route });
  }

  /**
   * Records an HTTP request metric
   */
  recordRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
  ): void {
    this.httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
    this.httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      duration,
    );
  }

  /**
   * Clean up on module destroy (useful for hot reloads)
   */
  onModuleDestroy(): void {
    // Clear the registry to prevent duplicate metrics on HMR
    this.registry.clear();
  }
}
