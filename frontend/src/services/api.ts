import type { UploadResponse, DetectResponse, FaceRegion, ReferenceFace, MatchResult, ModelStatus } from '../types';

const API_BASE = '/api';

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      message = errorData.message || message;
    } catch {}
    throw new ApiError(response.status, message);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }

  // For blob responses (blurred images)
  return response.blob() as unknown as T;
}

export const api = {
  /** Check if the AI model is ready */
  async getModelStatus(): Promise<ModelStatus> {
    const response = await fetch(`${API_BASE}/model-status`);
    return handleResponse<ModelStatus>(response);
  },

  /** Upload a group photo */
  async uploadImage(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<UploadResponse>(response);
  },

  /** Upload a reference face image and extract embedding */
  async uploadReferenceFace(file: File, label?: string): Promise<ReferenceFace> {
    const formData = new FormData();
    formData.append('image', file);
    if (label) {
      formData.append('label', label);
    }

    const response = await fetch(`${API_BASE}/upload-ref`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<ReferenceFace>(response);
  },

  /** Detect faces in an uploaded image */
  async detectFaces(imageId: string, threshold: number = 0.5): Promise<DetectResponse> {
    const response = await fetch(`${API_BASE}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, threshold }),
    });
    return handleResponse<DetectResponse>(response);
  },

  /** Match faces against reference embeddings */
  async matchFaces(
    imageId: string,
    refs: Array<{ refId: string; embedding: number[] }>,
    threshold: number = 0.5,
    matchThreshold: number = 0.4,
  ): Promise<MatchResult> {
    const response = await fetch(`${API_BASE}/match-faces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, refs, threshold, matchThreshold }),
    });
    return handleResponse<MatchResult>(response);
  },

  /** Blur ALL faces in an image */
  async blurAllFaces(
    imageId: string,
    threshold: number = 0.5,
    blurStrength: number = 25,
    padding: number = 0.3,
  ): Promise<Blob> {
    const response = await fetch(`${API_BASE}/blur`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, threshold, blurStrength, padding }),
    });
    return handleResponse<Blob>(response);
  },

  /** Blur SELECTED faces only */
  async blurSelectedFaces(
    imageId: string,
    faces: FaceRegion[],
    blurStrength: number = 25,
    padding: number = 0.3,
  ): Promise<Blob> {
    const response = await fetch(`${API_BASE}/blur-faces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, faces, blurStrength, padding }),
    });
    return handleResponse<Blob>(response);
  },

  /** Get the URL for an uploaded image */
  getImageUrl(imageId: string): string {
    return `${API_BASE}/image/${imageId}`;
  },

  /** Cleanup an uploaded image */
  async cleanup(imageId: string): Promise<void> {
    await fetch(`${API_BASE}/cleanup/${imageId}`, { method: 'DELETE' });
  },
};