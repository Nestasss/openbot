import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'https://app.notificbot.ru',
      'https://chat.notificbot.ru',
      'http://localhost:5173',
      'http://localhost:8080',
    ],
    credentials: true,
  });

  // serve uploaded files (dev)
  const uploadsDir = join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
