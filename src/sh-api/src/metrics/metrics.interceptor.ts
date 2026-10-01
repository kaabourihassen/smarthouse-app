import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const route = request.route?.path ?? request.path;

    // Increment active requests
    this.metricsService.incrementActiveRequests(method, route);

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.recordResponse(method, route, start, 200, context),
        error: (err) => {
          // Extract status code from error if available, otherwise 500
          const statusCode =
            err?.response?.status ?? err?.status ?? 500;
          this.recordResponse(method, route, start, statusCode, context);
          // Re-throw the error so Nest can handle it
          throw err;
        },
      }),
    );
  }

  private recordResponse(
    method: string,
    route: string,
    start: number,
    statusCode: number,
    context: ExecutionContext,
  ): void {
    const end = Date.now();
    const duration = (end - start) / 1000; // Convert to seconds

    // Record the metrics
    this.metricsService.recordRequest(method, route, statusCode, duration);

    // Decrement active requests
    this.metricsService.decrementActiveRequests(method, route);
  }
}
