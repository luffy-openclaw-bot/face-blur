import { useState } from 'react';

interface BlurResultProps {
  originalUrl: string;
  blurredBlob: Blob | null;
  isProcessing: boolean;
  onReset: () => void;
  onDownload: () => void;
}

export function BlurResult({
  originalUrl,
  blurredBlob,
  isProcessing,
  onReset,
  onDownload,
}: BlurResultProps) {
  const [blurredUrl, setBlurredUrl] = useState<string | null>(null);

  // Create object URL for blurred image
  if (blurredBlob && !blurredUrl) {
    const url = URL.createObjectURL(blurredBlob);
    setBlurredUrl(url);
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {isProcessing && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="loading-spinner w-12 h-12" />
          <p className="text-lg text-[var(--text-muted)]">正在處理模糊效果...</p>
        </div>
      )}

      {blurredUrl && !isProcessing && (
        <div className="flex flex-col items-center gap-6 w-full">
          <h3 className="text-xl font-bold text-[var(--success)]">✅ 模糊處理完成！</h3>

          <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl">
            {/* Original */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--text-muted)]">原圖</h4>
              <img
                src={originalUrl}
                alt="原圖"
                className="max-w-full max-h-80 rounded-lg border border-[var(--border)]"
              />
            </div>

            {/* Blurred */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--success)]">模糊處理後</h4>
              <img
                src={blurredUrl}
                alt="模糊處理後"
                className="max-w-full max-h-80 rounded-lg border border-[var(--success)]"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button onClick={onDownload} className="btn-primary flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              下載處理後相片
            </button>
            <button onClick={onReset} className="btn-secondary">
              處理另一張相片
            </button>
          </div>
        </div>
      )}
    </div>
  );
}