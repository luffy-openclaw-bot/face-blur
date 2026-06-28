import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface FaceDetection {
  id: number;
  type: 'face';
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface DetectResult {
  width: number;
  height: number;
  faces: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly scriptPath: string;
  private modelReady = false;

  constructor() {
    this.scriptPath = path.join(__dirname, '..', 'scripts', 'detect_blur.py');
    this.checkPythonReady();
  }

  private async checkPythonReady() {
    try {
      const { stdout } = await execFileAsync('python3', [
        '-c',
        'import cv2; print(cv2.FaceDetectorYN)',
      ]);
      this.modelReady = true;
      this.logger.log('Python + OpenCV YuNet ready');
    } catch {
      this.logger.error('Python/OpenCV not available — face detection will not work');
      this.modelReady = false;
    }
  }

  async detectFaces(
    imageFilePath: string,
    threshold: number = 0.5,
  ): Promise<FaceDetection[]> {
    const { stdout } = await execFileAsync('python3', [
      this.scriptPath,
      'detect',
      imageFilePath,
      '--threshold',
      String(threshold),
    ]);

    const result: DetectResult = JSON.parse(stdout);

    return result.faces.map((face, index) => ({
      id: index,
      type: 'face' as const,
      bbox: {
        x: face.x,
        y: face.y,
        width: face.width,
        height: face.height,
      },
      confidence: face.confidence,
    }));
  }

  /**
   * Blur faces in an image using the Python script.
   * Returns the output image buffer.
   */
  async blurFaces(
    imageFilePath: string,
    threshold: number = 0.5,
    blurStrength: number = 25,
    padding: number = 0.3,
  ): Promise<Buffer> {
    const outputPath = imageFilePath + '.blurred.jpg';

    await execFileAsync('python3', [
      this.scriptPath,
      'blur',
      imageFilePath,
      outputPath,
      '--threshold',
      String(threshold),
      '--blur',
      String(blurStrength),
      '--padding',
      String(padding),
    ]);

    const fs = await import('fs/promises');
    const buffer = await fs.readFile(outputPath);

    // Clean up temp file
    await fs.unlink(outputPath).catch(() => {});

    return buffer;
  }

  isReady(): boolean {
    return this.modelReady;
  }
}