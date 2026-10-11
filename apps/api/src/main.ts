import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Caddy is the only client-facing hop; trust its X-Forwarded-For for client IPs.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.disable('x-powered-by');
  // LiveKit signs the exact raw body, so the webhook must receive it unparsed.
  app.use('/api/livekit/webhook', express.text({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API listening on :${config.port} for ${config.publicOrigin}`, 'Bootstrap');
}

void bootstrap();
