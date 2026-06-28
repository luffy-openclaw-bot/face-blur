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

export interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UploadResponse {
  imageId: string;
  originalName: string;
  width: number;
  height: number;
  size: number;
}

export interface DetectResponse {
  imageId: string;
  detections: FaceDetection[];
  count: number;
}

export interface ModelStatus {
  ready: boolean;
  model: string;
  description: string;
}

export type ProcessingStep = 'upload' | 'detect' | 'select' | 'blur' | 'done';