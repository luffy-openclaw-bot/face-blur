import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { AiService } from './ai.service';

class DetectDto {
  imageId!: string;
  threshold?: number;
}

@Controller('api')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('model-status')
  getModelStatus() {
    return {
      ready: this.aiService.isReady(),
      model: 'YuNet (OpenCV)',
      description: 'Detects faces in images for targeted blurring',
    };
  }

  @Post('detect')
  async detectFaces(@Body() dto: DetectDto) {
    if (!dto.imageId) {
      throw new HttpException('imageId is required', HttpStatus.BAD_REQUEST);
    }

    if (!this.aiService.isReady()) {
      throw new HttpException(
        'AI model is not available — check Python/OpenCV setup',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Detection is handled by ImageController which has access to the file
    return { imageId: dto.imageId, model: 'YuNet' };
  }
}