import type { UploadResponse, DetectResponse, FaceRegion, ModelStatus } from '../types';

const API_BASE = '/api';

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message || response.statusText);
  }
  return response.json();
}

export const api = {
  async getModelStatus(): Promise<ModelStatus> {
    const response = await fetch(`${API_BASE}/model-status`);
    return handleResponse<ModelStatus>(response);
  },

  async uploadImage(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });

    return handleResponse<UploadResponse>(response);
  },

  async detectFaces(
    imageId: string,
    threshold: number = 0.5,
  ): Promise<DetectResponse> {
    const response = await fetch(`${API_BASE}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, threshold }),
    });

    return handleResponse<DetectResponse>(response);
  },

  /**
   * Blur ALL faces in an image — re-detects with YuNet and blurs everything.
   */
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

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, body.message || response.statusText);
    }

    return response.blob();
  },

  /**
   * Blur SELECTED faces only — takes an array of face regions from detection results.
   * This is the preferred method for the web UI where users choose which faces to blur.
   */
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

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, body.message || response.statusText);
    }

    return response.blob();
  },

  async cleanup(imageId: string): Promise<void> {
    await fetch(`${API_BASE}/cleanup/${imageId}`, { method: 'DELETE' });
  },

  getImageUrl(imageId: string): string {
    return `${API_BASE}/image/${imageId}`;
  },
};