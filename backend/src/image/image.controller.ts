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
import { AiService, FaceRegion, RefFace } from '../ai/ai.service';

class DetectDto {
  imageId!: string;
  threshold?: number;
}

class BlurDto {
  imageId!: string;
  threshold?: number;
  blurStrength?: number;
  padding?: number;
  shape?: string;
  feather?: number;
}

class BlurFacesDto {
  imageId!: string;
  faces!: FaceRegion[];
  blurStrength?: number;
  padding?: number;
  shape?: string;
  feather?: number;
}

class MatchFacesDto {
  imageId!: string;
  refs!: RefFace[];
  threshold?: number;
  matchThreshold?: number;
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

  /**
   * Upload a reference face image and extract its embedding.
   * Returns the embedding vector and a face crop preview.
   */
  @Post('upload-ref')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
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
  async uploadReferenceFace(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    @Body() body: { label?: string },
  ) {
    if (!file) {
      throw new HttpException('No image file provided', HttpStatus.BAD_REQUEST);
    }

    if (!this.aiService.isReady()) {
      throw new HttpException(
        'AI model is not available — check Python/OpenCV setup',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Save the reference image temporarily
    const image = await this.uploadService.saveImage(file);
    const filePath = this.uploadService.getImageFilePath(image.id);

    try {
      // Extract face embedding
      const embedding = await this.aiService.extractFaceEmbedding(filePath);

      return {
        refId: image.id,
        label: body.label || `Person ${Date.now()}`,
        embedding: embedding.embedding,
        embeddingDim: embedding.embeddingDim,
        faceBbox: embedding.faceBbox,
        faceCropBase64: embedding.faceCropBase64,
      };
    } catch (error: any) {
      // Clean up the uploaded reference if embedding extraction fails
      await this.uploadService.deleteImage(image.id).catch(() => {});
      throw new HttpException(
        error.message?.includes('No face detected')
          ? 'No face detected in the reference image. Please upload a clear face photo.'
          : `Failed to extract face embedding: ${error.message || 'Unknown error'}`,
        HttpStatus.BAD_REQUEST,
      );
    }
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
   * Detect faces and return cropped face images as base64.
   */
  @Post('crop-faces')
  async cropFaces(@Body() body: DetectDto) {
    const { imageId, threshold = 0.5 } = body;

    if (!imageId) {
      throw new HttpException('imageId is required', HttpStatus.BAD_REQUEST);
    }

    if (!this.aiService.isReady()) {
      throw new HttpException(
        'AI model is not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const filePath = this.uploadService.getImageFilePath(imageId);
    const result = await this.aiService.cropFaces(filePath, threshold);

    return {
      imageId,
      ...result,
    };
  }

  /**
   * Match faces in a group photo against reference face embeddings.
   */
  @Post('match-faces')
  async matchFaces(@Body() body: MatchFacesDto) {
    const {
      imageId,
      refs,
      threshold = 0.5,
      matchThreshold = 0.4,
    } = body;

    if (!imageId) {
      throw new HttpException('imageId is required', HttpStatus.BAD_REQUEST);
    }

    if (!refs || !Array.isArray(refs) || refs.length === 0) {
      throw new HttpException('refs array is required and must not be empty', HttpStatus.BAD_REQUEST);
    }

    if (!this.aiService.isReady()) {
      throw new HttpException(
        'AI model is not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const filePath = this.uploadService.getImageFilePath(imageId);
    const result = await this.aiService.matchFaces(filePath, refs, threshold, matchThreshold);

    return {
      imageId,
      ...result,
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
      shape = 'oval',
      feather = 0.3,
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
      shape,
      feather,
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
   */
  @Post('blur-faces')
  async blurSelectedFaces(@Body() body: BlurFacesDto, @Res() res: Response) {
    const {
      imageId,
      faces,
      blurStrength = 25,
      padding = 0.3,
      shape = 'oval',
      feather = 0.3,
    } = body;

    if (!imageId) {
      throw new HttpException('imageId is required', HttpStatus.BAD_REQUEST);
    }

    if (!faces || !Array.isArray(faces) || faces.length === 0) {
      throw new HttpException('faces array is required and must not be empty', HttpStatus.BAD_REQUEST);
    }

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
      shape,
      feather,
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