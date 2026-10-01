# Prometheus Metrics Module

This module provides production-ready Prometheus metrics collection for NestJS applications using the `prom-client` library.

## Features

- Collection of default Node.js metrics (CPU, memory, event loop, GC, etc.)
- HTTP request metrics:
  - Counter: `http_requests_total` (method, route, status_code)
  - Histogram: `http_request_duration_seconds` (method, route, status_code)
  - Gauge: `http_requests_active` (method, route)
- Global interceptor that automatically instruments all HTTP requests
- Proper cleanup to prevent duplicate metric registration during hot reload
- Exposes metrics at `/api/metrics` endpoint

## Installation

The `prom-client` package is already included in the project dependencies:
```json
"prom-client": "^15.1.3"
```

## Usage

The metrics module is automatically registered in `AppModule` and the interceptor is globally applied, so no additional setup is required.

## Metrics Endpoint

Access metrics at: `GET /api/metrics`

Response format: Plain text in Prometheus exposition format

## Example Metrics Output

After processing some HTTP requests, the metrics endpoint would return something like:

```
# HELP http_requests_active Current number of active HTTP requests
# TYPE http_requests_active gauge
http_requests_active{method="GET",route="/users/:id"} 1
http_requests_active{method="POST",route="/auth/login"} 0

# HELP http_requests_duration_seconds Duration of HTTP requests in seconds
# TYPE http_requests_duration_seconds histogram
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="0.005"} 5
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="0.01"} 12
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="0.025"} 25
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="0.05"} 40
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="0.1"} 60
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="0.25"} 80
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="0.5"} 90
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="1"} 95
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="2"} 98
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="5"} 100
http_requests_duration_seconds_bucket{method="GET",route="/users/:id",status_code="200",le="+Inf"} 100
http_requests_duration_seconds_sum{method="GET",route="/users/:id",status_code="200"} 15.5
http_requests_duration_seconds_count{method="GET",route="/users/:id",status_code="200"} 100

# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/users/:id",status_code="200"} 100
http_requests_total{method="POST",route="/auth/login",status_code="200"} 50
http_requests_total{method="POST",route="/auth/login",status_code="401"} 5

# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 12.34

# HELP process_resident_memory_bytes Resident memory size in bytes
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 1.23e+7
```

## Default Node.js Metrics Included

The module automatically collects:
- Process metrics: `process_*`
- Node.js event loop metrics: `nodejs_eventloop_*`
- Node.js garbage collection metrics: `nodejs_gc_*`
- Node.js memory metrics: `nodejs_memory_*`

## Implementation Details

### Metrics Service
- Creates a dedicated Registry to avoid collisions during hot reloads
- Defines custom HTTP metrics (counter, histogram, gauge)
- Provides methods to increment/decrement active requests and record request metrics
- Implements `OnModuleDestroy` to clear registry on module destruction

### Metrics Interceptor
- Globally intercepts all HTTP requests
- Tracks active requests via gauge
- Measures request duration
- Records metrics with method, route, and status code labels
- Handles both successful and error responses
- Uses NestJS route template when available to avoid high-cardinality labels

### Metrics Controller
- Exposes `/metrics` endpoint
- Sets proper Content-Type header (`text/plain`)
- Returns metrics in Prometheus exposition format

### Hot Reload Protection
- Each MetricsService instance creates its own Registry
- Registry is cleared on module destroy to prevent duplicate registrations
- Uses `collectDefaultMetrics` with custom GC buckets for detailed GC monitoring

## Configuration

No additional configuration is required. The module works out-of-the-box with:
- NestJS v10+
- Express adapter
- TypeScript

## Prometheus Integration

Example scrape configuration (see `.infra/prometheus/scrape.yml`):

```yaml
scrape_configs:
  - job_name: 'nestjs-app'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/api/metrics'
    scrape_interval: 15s
```

## Labels and Cardinality

- `method`: HTTP method (GET, POST, PUT, DELETE, etc.) - low cardinality
- `route`: Route template (e.g., `/users/:id`) - low cardinality when using route templates
- `status_code`: HTTP status code - low cardinality

Avoid using raw URLs or parameters as route labels to prevent high cardinality issues.