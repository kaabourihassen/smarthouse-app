import { Controller, Get, Res, Header } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain')
  async getMetrics(@Res() res: Response): Promise<void> {
    try {
      const metrics = await this.metricsService.getRegistry().metrics();
      res.send(metrics);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
}
