import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  
  // Serve static files from uploads directory
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`FaceBlur backend running on http://localhost:${port}`);
}
bootstrap();