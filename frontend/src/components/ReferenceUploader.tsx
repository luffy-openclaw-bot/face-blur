import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { ReferenceFace } from '../types';

interface ReferenceUploaderProps {
  onReferenceAdded: (ref: ReferenceFace) => void;
  isProcessing: boolean;
}

export function ReferenceUploader({ onReferenceAdded, isProcessing }: ReferenceUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setError(null);
    setIsUploading(true);

    try {
      const ref = await api.uploadReferenceFace(file, label || undefined);
      onReferenceAdded(ref);
      setLabel('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '上載參考面部失敗';
      if (message.includes('No face detected')) {
        setError('偵測唔到面部，請上載一張清晰嘅面部相片');
      } else {
        setError(message);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [label, onReferenceAdded]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-3">🔍 上載參考面部</h3>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        上載一張清晰嘅面部相片，系統會提取面部特徵並喺群組相中搵出同一個人。
        你可以上載多張參考面部，每張設定「模糊」或「排除」動作。
      </p>

      {/* Label input */}
      <div className="mb-3">
        <label className="text-sm font-medium block mb-1">名稱（選填）</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例如：張三、朋友A..."
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-[var(--text-light)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-[var(--border)] rounded-lg p-6 text-center cursor-pointer hover:border-[var(--primary)] transition-colors"
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="loading-spinner w-8 h-8" />
            <span className="text-sm text-[var(--text-muted)]">正在提取面部特徵...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <span className="text-3xl">📎</span>
            <span className="text-sm text-[var(--text-muted)]">
              拖放或按一下上載參考面部相片
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              支援 JPEG、PNG、WebP（最大 5MB）
            </span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading || isProcessing}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 bg-red-900/30 border border-red-500 rounded-lg text-red-200 text-sm">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}