import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UploadService } from './upload.service';
import { BlurService } from './blur.service';
import { AiService, FaceRegion } from '../ai/ai.service';

class DetectDto {
  imageId!: string;
  threshold?: number;
}

class BlurDto {
  imageId!: string;
  threshold?: number;
  blurStrength?: number;
  padding?: number;
}

class BlurFacesDto {
  imageId!: string;
  faces!: FaceRegion[];
  blurStrength?: number;
  padding?: number;
}

@Controller('api')
export class ImageController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly blurService: BlurService,
    private readonly aiService: AiService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req: any, file: any, cb: any) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
          cb(
            new HttpException(
              'Only JPEG, PNG, and WebP images are allowed',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  ) {
    if (!file) {
      throw new HttpException('No image file provided', HttpStatus.BAD_REQUEST);
    }

    const image = await this.uploadService.saveImage(file);

    return {
      imageId: image.id,
      originalName: image.originalName,
      width: image.width,
      height: image.height,
      size: image.size,
    };
  }

  @Post('detect')
  async detectFaces(@Body() body: DetectDto) {
    const { imageId, threshold = 0.5 } = body;

    if (!imageId) {
      throw new HttpException('imageId is required', HttpStatus.BAD_REQUEST);
    }

    if (!this.aiService.isReady()) {
      throw new HttpException(
        'AI model is not available — check Python/OpenCV setup',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const filePath = this.uploadService.getImageFilePath(imageId);
    const detections = await this.aiService.detectFaces(filePath, threshold);

    return {
      imageId,
      detections,
      count: detections.length,
    };
  }

  /**
   * Blur ALL faces — re-detects with YuNet, then blurs everything found.
   */
  @Post('blur')
  async blurAllFaces(@Body() body: BlurDto, @Res() res: Response) {
    const {
      imageId,
      threshold = 0.5,
      blurStrength = 25,
      padding = 0.3,
    } = body;

    if (!imageId) {
      throw new HttpException('imageId is required', HttpStatus.BAD_REQUEST);
    }

    const filePath = this.uploadService.getImageFilePath(imageId);
    const image = this.uploadService.getImage(imageId);

    const resultBuffer = await this.aiService.blurFaces(
      filePath,
      threshold,
      blurStrength,
      padding,
    );

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `inline; filename="blurred_${image.originalName}"`,
      'Content-Length': resultBuffer.length,
    });

    res.send(resultBuffer);
  }

  /**
   * Blur SELECTED faces only — takes an array of face regions from detection results.
   * This allows the user to choose which faces to blur via the web UI or API.
   */
  @Post('blur-faces')
  async blurSelectedFaces(@Body() body: BlurFacesDto, @Res() res: Response) {
    const {
      imageId,
      faces,
      blurStrength = 25,
      padding = 0.3,
    } = body;

    if (!imageId) {
      throw new HttpException('imageId is required', HttpStatus.BAD_REQUEST);
    }

    if (!faces || !Array.isArray(faces) || faces.length === 0) {
      throw new HttpException('faces array is required and must not be empty', HttpStatus.BAD_REQUEST);
    }

    // Validate each face region has required fields
    for (const face of faces) {
      if (typeof face.x !== 'number' || typeof face.y !== 'number' ||
          typeof face.width !== 'number' || typeof face.height !== 'number') {
        throw new HttpException(
          'Each face must have x, y, width, height as numbers',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const filePath = this.uploadService.getImageFilePath(imageId);
    const image = this.uploadService.getImage(imageId);

    const resultBuffer = await this.aiService.blurSpecificFaces(
      filePath,
      faces,
      blurStrength,
      padding,
    );

    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `inline; filename="blurred_${image.originalName}"`,
      'Content-Length': resultBuffer.length,
    });

    res.send(resultBuffer);
  }

  @Get('image/:id')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    const imageBuffer = await this.uploadService.getImageBuffer(id);
    const image = this.uploadService.getImage(id);

    res.set({
      'Content-Type': image.mimeType,
      'Content-Length': imageBuffer.length,
    });

    res.send(imageBuffer);
  }

  @Delete('cleanup/:id')
  async cleanup(@Param('id') id: string) {
    const deleted = await this.uploadService.deleteImage(id);
    return { success: deleted, imageId: id };
  }
}