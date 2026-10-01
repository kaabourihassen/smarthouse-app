import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // We manage body parsing manually to support Stripe webhook signature verification.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  const stripeWebhookPath = '/api/webhooks/stripe';
  // Stripe requires the exact raw request body for signature verification.
  app.use(stripeWebhookPath, express.raw({ type: 'application/json' }));

  // JSON + urlencoded for all other routes.
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith(stripeWebhookPath)) return next();
    return express.json({ limit: '1mb' })(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith(stripeWebhookPath)) return next();
    return express.urlencoded({ extended: true })(req, res, next);
  });

  const isProd = configService.get('NODE_ENV') === 'production';
  const corsOrigin = configService.get<string>('CORS_ORIGIN');

  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser tools (curl/Postman) often have no Origin header.
      if (!origin) return callback(null, true);

      if (!isProd) return callback(null, true);

      if (!corsOrigin) return callback(new Error('CORS_ORIGIN is not configured'), false);
      return callback(null, origin === corsOrigin);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  // Bind on all interfaces so LAN devices (ESP32) can reach the API.
  await app.listen(port, '0.0.0.0');
  console.log(`Application running on: ${await app.getUrl()}`);
}
bootstrap();
