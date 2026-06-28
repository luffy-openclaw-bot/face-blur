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

export interface FaceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
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

export interface FaceCrop {
  id: number;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  cropBase64: string;
}

export interface CropResult {
  width: number;
  height: number;
  faces: FaceCrop[];
}

export interface FaceEmbedding {
  embedding: number[];
  embeddingDim: number;
  faceBbox: { x: number; y: number; width: number; height: number };
  faceCropBase64: string;
}

export interface FaceMatch {
  faceIndex: number;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  matchedRef: string | null;
  matchScore: number;
  isMatch: boolean;
}

export interface MatchResult {
  width: number;
  height: number;
  facesDetected: number;
  matches: FaceMatch[];
  matchThreshold: number;
}

export interface RefFace {
  refId: string;
  embedding: number[];
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
   * Detect faces and return cropped face images as base64.
   */
  async cropFaces(
    imageFilePath: string,
    threshold: number = 0.5,
  ): Promise<CropResult> {
    const { stdout } = await execFileAsync('python3', [
      this.scriptPath,
      'crop_faces',
      imageFilePath,
      '--threshold',
      String(threshold),
    ]);

    return JSON.parse(stdout);
  }

  /**
   * Extract face embedding from a reference face image.
   */
  async extractFaceEmbedding(
    imageFilePath: string,
    threshold: number = 0.5,
  ): Promise<FaceEmbedding> {
    const { stdout } = await execFileAsync('python3', [
      this.scriptPath,
      'extract_embedding',
      imageFilePath,
      '--threshold',
      String(threshold),
    ]);

    const raw = JSON.parse(stdout);
    return {
      embedding: raw.embedding,
      embeddingDim: raw.embedding_dim,
      faceBbox: raw.face_bbox,
      faceCropBase64: raw.face_crop_base64,
    };
  }

  /**
   * Match faces in a group photo against reference face embeddings.
   */
  async matchFaces(
    imageFilePath: string,
    refs: RefFace[],
    threshold: number = 0.5,
    matchThreshold: number = 0.4,
  ): Promise<MatchResult> {
    const refsJson = JSON.stringify(refs);

    const { stdout } = await execFileAsync('python3', [
      this.scriptPath,
      'match_faces',
      imageFilePath,
      '--refs',
      refsJson,
      '--threshold',
      String(threshold),
      '--match-threshold',
      String(matchThreshold),
    ]);

    const raw = JSON.parse(stdout);
    return {
      width: raw.width,
      height: raw.height,
      facesDetected: raw.faces_detected,
      matches: raw.matches.map((m: any) => ({
        faceIndex: m.face_index,
        bbox: m.bbox,
        confidence: m.confidence,
        matchedRef: m.matched_ref,
        matchScore: m.match_score,
        isMatch: m.is_match,
      })),
      matchThreshold: raw.match_threshold,
    };
  }

  /**
   * Blur ALL faces in an image using YuNet detection.
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
    await fs.unlink(outputPath).catch(() => {});
    return buffer;
  }

  /**
   * Blur SELECTED face regions only.
   */
  async blurSpecificFaces(
    imageFilePath: string,
    faces: FaceRegion[],
    blurStrength: number = 25,
    padding: number = 0.3,
  ): Promise<Buffer> {
    const outputPath = imageFilePath + '.blurred.jpg';
    const regionsJson = JSON.stringify(faces);

    await execFileAsync('python3', [
      this.scriptPath,
      'blur_regions',
      imageFilePath,
      outputPath,
      '--regions',
      regionsJson,
      '--blur',
      String(blurStrength),
      '--padding',
      String(padding),
    ]);

    const fs = await import('fs/promises');
    const buffer = await fs.readFile(outputPath);
    await fs.unlink(outputPath).catch(() => {});
    return buffer;
  }

  isReady(): boolean {
    return this.modelReady;
  }
}