import { useState, useRef, useEffect, useCallback } from 'react';
import type { FaceDetection, FaceMatch, MatchAction } from '../types';

interface DetectionCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections: FaceDetection[];
  selectedIds: Set<number>;
  matchResults?: FaceMatch[];
  referenceActions?: Record<string, MatchAction>;
  onToggleDetection: (id: number) => void;
}

export function DetectionCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  detections,
  selectedIds,
  matchResults = [],
  referenceActions = {},
  onToggleDetection,
}: DetectionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Calculate display size maintaining aspect ratio
  useEffect(() => {
    const maxWidth = 800;
    const maxHeight = 600;
    const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
    setCanvasSize({
      width: Math.round(imageWidth * scale),
      height: Math.round(imageHeight * scale),
    });
  }, [imageWidth, imageHeight]);

  // Draw image on canvas
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
  }, [canvasSize, imageLoaded]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const scaleX = canvasSize.width / imageWidth;
  const scaleY = canvasSize.height / imageHeight;

  // Build a map from faceIndex to match info
  const matchMap = new Map<number, FaceMatch>();
  for (const m of matchResults) {
    matchMap.set(m.faceIndex, m);
  }

  return (
    <div className="relative inline-block" style={{ width: canvasSize.width, height: canvasSize.height }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="rounded-lg"
      />

      {/* Face detection overlay boxes */}
      {detections.map((detection) => {
        const isSelected = selectedIds.has(detection.id);
        const match = matchMap.get(detection.id);
        const boxX = detection.bbox.x * scaleX;
        const boxY = detection.bbox.y * scaleY;
        const boxW = detection.bbox.width * scaleX;
        const boxH = detection.bbox.height * scaleY;

        // Determine border color based on match status
        let borderColor = isSelected ? 'border-red-500' : 'border-green-500';
        let bgColor = isSelected ? 'bg-red-500' : 'bg-green-500';
        let label = `面部 ${detection.id + 1}`;
        let icon = isSelected ? ' 🔒' : '';

        if (match && match.isMatch) {
          const action = match.matchedRef ? referenceActions[match.matchedRef] : undefined;
          if (action === 'exclude') {
            borderColor = 'border-green-400';
            bgColor = 'bg-green-400';
            icon = ' ✅';
          } else {
            borderColor = 'border-orange-500';
            bgColor = 'bg-orange-500';
            icon = ' 🔒';
          }
          label = `面部 ${detection.id + 1} → ${match.matchedRef || '?'}`;
        }

        return (
          <div
            key={detection.id}
            className={`absolute border-2 cursor-pointer transition-all hover:border-white ${borderColor} ${
              isSelected ? 'selected' : 'unselected'
            }`}
            style={{
              left: boxX,
              top: boxY,
              width: boxW,
              height: boxH,
            }}
            onClick={() => onToggleDetection(detection.id)}
            title={`${label} — 置信度: ${Math.round(detection.confidence * 100)}%${icon}`}
          >
            <div className={`absolute -top-6 left-0 text-xs px-2 py-0.5 rounded whitespace-nowrap ${bgColor} text-white`}>
              {label} ({Math.round(detection.confidence * 100)}%){icon}
            </div>
          </div>
        );
      })}
    </div>
  );
}