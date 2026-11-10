import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('FRONTEND_URL', 'http://localhost:3000'),
    credentials: true, // allow the auth cookie
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip fields not in the DTO
      forbidNonWhitelisted: true, // reject unknown fields
      transform: true, // turn payloads into DTO instances
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number(config.get('PORT') ?? 5000);
  await app.listen(port);
  Logger.log(`🚀 API running on http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();