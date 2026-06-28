import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface UploadedImage {
  id: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  filePath: string;
}

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const CLEANUP_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly images = new Map<string, UploadedImage>();

  constructor() {
    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  }

  async saveImage(file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<UploadedImage> {
    const id = uuidv4();
    const ext = path.extname(file.originalname) || '.jpg';
    const filePath = path.join(UPLOAD_DIR, `${id}${ext}`);

    await fs.promises.writeFile(filePath, file.buffer);

    let width = 0;
    let height = 0;
    try {
      const metadata = await sharp(file.buffer).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;
    } catch {
      this.logger.warn(`Could not read image dimensions for ${file.originalname}`);
    }

    const image: UploadedImage = {
      id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      width,
      height,
      size: file.size,
      filePath,
    };

    this.images.set(id, image);

    // Auto-cleanup after 5 minutes
    setTimeout(() => this.deleteImage(id), CLEANUP_MS);

    this.logger.log(`Saved image: ${file.originalname} (${width}x${height}, ${file.size} bytes)`);

    return image;
  }

  getImage(id: string): UploadedImage {
    const image = this.images.get(id);
    if (!image) {
      throw new Error(`Image not found: ${id}`);
    }
    return image;
  }

  async getImageBuffer(id: string): Promise<Buffer> {
    const image = this.getImage(id);
    return fs.promises.readFile(image.filePath);
  }

  getImageFilePath(id: string): string {
    const image = this.getImage(id);
    return image.filePath;
  }

  async deleteImage(id: string): Promise<boolean> {
    const image = this.images.get(id);
    if (!image) return false;

    try {
      await fs.promises.unlink(image.filePath);
    } catch {
      // File may already be deleted
    }

    this.images.delete(id);
    this.logger.log(`Cleaned up image: ${id}`);
    return true;
  }
}