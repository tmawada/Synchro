import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for the React frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'https://synchro-workspace.vercel.app',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3030);
}
bootstrap();
