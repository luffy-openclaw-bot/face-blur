import { useState, useRef, useCallback } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

interface ImageUploaderProps {
  onUpload: (file: File) => void;
  isLoading: boolean;
}

export function ImageUploader({ onUpload, isLoading }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        onUpload(file);
      }
    },
    [onUpload],
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onUpload(file);
      }
    },
    [onUpload],
  );

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className={`upload-zone w-full max-w-lg ${isDragging ? 'dragging' : ''} ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="loading-spinner w-10 h-10" />
            <p className="text-[var(--text-muted)]">上載中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg className="w-16 h-16 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16" />
            </svg>
            <p className="text-lg font-medium">拖放相片到呢度</p>
            <p className="text-sm text-[var(--text-muted)]">或者按一下選擇檔案</p>
            <p className="text-xs text-[var(--text-muted)]">支援 JPEG、PNG、WebP（最大 10MB）</p>
          </div>
        )}
      </div>
    </div>
  );
}