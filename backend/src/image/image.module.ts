import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { UploadService } from './upload.service';
import { BlurService } from './blur.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ImageController],
  providers: [UploadService, BlurService],
})
export class ImageModule {}