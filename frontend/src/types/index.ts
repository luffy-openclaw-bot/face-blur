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

export interface ReferenceFace {
  refId: string;
  label: string;
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
  imageId: string;
  width: number;
  height: number;
  facesDetected: number;
  matches: FaceMatch[];
  matchThreshold: number;
}

export type MatchAction = 'blur' | 'exclude';

export interface ReferenceWithAction {
  ref: ReferenceFace;
  action: MatchAction;
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
}

export type ProcessingStep = 'upload' | 'detect' | 'select' | 'match' | 'blur' | 'done';