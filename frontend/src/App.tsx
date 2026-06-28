import { useState, useCallback } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { DetectionCanvas } from './components/DetectionCanvas';
import { BlurResult } from './components/BlurResult';
import { api } from './services/api';
import type { FaceDetection, ProcessingStep, UploadResponse, FaceRegion } from './types';

function App() {
  const [step, setStep] = useState<ProcessingStep>('upload');
  const [isModelReady, setIsModelReady] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);

  // Detection state
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<FaceDetection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Blur state
  const [isBlurring, setIsBlurring] = useState(false);
  const [blurredBlob, setBlurredBlob] = useState<Blob | null>(null);
  const [blurStrength, setBlurStrength] = useState(25);
  const [padding, setPadding] = useState(0.3);
  const [threshold, setThreshold] = useState(0.5);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Check model status on mount
  useState(() => {
    api.getModelStatus().then((status) => {
      setIsModelReady(status.ready);
    }).catch(() => {
      setIsModelReady(false);
    });
  });

  const handleUpload = useCallback(async (file: File) => {
    setError(null);
    setIsUploading(true);

    try {
      const data = await api.uploadImage(file);
      setUploadData(data);
      setStep('detect');
      setIsUploading(false);

      // Automatically start face detection
      setIsDetecting(true);
      const result = await api.detectFaces(data.imageId, threshold);
      setDetections(result.detections);

      // Auto-select all faces for blurring
      const allIds = new Set<number>(result.detections.map((d: FaceDetection) => d.id));
      setSelectedIds(allIds);
      setStep('select');
      setIsDetecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上載失敗，請重試');
      setIsUploading(false);
      setIsDetecting(false);
    }
  }, [threshold]);

  const handleToggleDetection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(detections.map((d) => d.id)));
  }, [detections]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBlur = useCallback(async () => {
    if (!uploadData) return;

    // Get selected face regions (bbox coordinates)
    const selectedFaces: FaceRegion[] = detections
      .filter((d) => selectedIds.has(d.id))
      .map((d) => ({
        x: d.bbox.x,
        y: d.bbox.y,
        width: d.bbox.width,
        height: d.bbox.height,
      }));

    if (selectedFaces.length === 0) {
      setError('請至少選擇一個面部進行模糊處理');
      return;
    }

    setError(null);
    setIsBlurring(true);
    setStep('blur');

    try {
      const blob = await api.blurSelectedFaces(
        uploadData.imageId,
        selectedFaces,
        blurStrength,
        padding,
      );

      setBlurredBlob(blob);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '模糊處理失敗，請重試');
      setStep('select');
    } finally {
      setIsBlurring(false);
    }
  }, [uploadData, detections, selectedIds, blurStrength, padding]);

  const handleDownload = useCallback(() => {
    if (!blurredBlob || !uploadData) return;

    const url = URL.createObjectURL(blurredBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blurred_${uploadData.originalName}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [blurredBlob, uploadData]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setUploadData(null);
    setDetections([]);
    setSelectedIds(new Set());
    setBlurredBlob(null);
    setError(null);

    if (uploadData) {
      api.cleanup(uploadData.imageId).catch(() => {});
    }
  }, [uploadData]);

  return (
    <div className="min-h-screen bg-[var(--bg-dark)] text-[var(--text-light)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎭</span>
            <div>
              <h1 className="text-xl font-bold">FaceBlur</h1>
              <p className="text-xs text-[var(--text-muted)]">YuNet 面部模糊處理工具</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block w-2 h-2 rounded-full ${isModelReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-[var(--text-muted)]">
              {isModelReady ? 'YuNet 模型就緒' : '模型載入中...'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-lg text-red-200 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-bold mb-3">上載相片</h2>
              <p className="text-[var(--text-muted)]">
                上載一張相片，系統會用 YuNet 模型自動偵測入面嘅面部，然後你可以選擇邊啲面部要模糊處理。
              </p>
            </div>
            <ImageUploader onUpload={handleUpload} isLoading={isUploading} />

            {/* Settings */}
            <div className="card max-w-md w-full space-y-4">
              <div>
                <label className="text-sm font-semibold block mb-2">偵測靈敏度 (threshold)</label>
                <p className="text-xs text-[var(--text-muted)] mb-2">越低偵測越多面部，但可能出現誤判</p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.05"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="flex-1 accent-[var(--primary)]"
                  />
                  <span className="text-sm text-[var(--text-muted)] w-12 text-right">{threshold}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Detecting */}
        {step === 'detect' && isDetecting && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="loading-spinner w-16 h-16" />
            <p className="text-xl text-[var(--text-muted)]">正在偵測面部...</p>
            <p className="text-sm text-[var(--text-muted)]">YuNet 模型分析中，請稍候</p>
          </div>
        )}

        {/* Step: Select faces to blur */}
        {step === 'select' && uploadData && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">選擇要模糊處理嘅面部</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  偵測到 {detections.length} 個面部 — 按一下邊界框嚟選擇/取消選擇
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSelectAll} className="btn-secondary text-sm">
                  全選
                </button>
                <button onClick={handleDeselectAll} className="btn-secondary text-sm">
                  全不選
                </button>
              </div>
            </div>

            {/* Detection Canvas */}
            <div className="flex justify-center">
              <DetectionCanvas
                imageUrl={api.getImageUrl(uploadData.imageId)}
                imageWidth={uploadData.width}
                imageHeight={uploadData.height}
                detections={detections}
                selectedIds={selectedIds}
                onToggleDetection={handleToggleDetection}
              />
            </div>

            {/* Blur strength + padding sliders */}
            <div className="card space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">模糊強度</label>
                  <span className="text-sm text-[var(--text-muted)]">{blurStrength}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={blurStrength}
                  onChange={(e) => setBlurStrength(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                  <span>輕微</span>
                  <span>強烈</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">面部框擴展 (padding)</label>
                  <span className="text-sm text-[var(--text-muted)]">{Math.round(padding * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.6"
                  step="0.05"
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                  <span>貼面</span>
                  <span>寬鬆</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center gap-4">
              <button onClick={handleReset} className="btn-secondary">
                ← 重新上載
              </button>
              <button
                onClick={handleBlur}
                disabled={selectedIds.size === 0}
                className="btn-primary"
              >
                🎭 模糊處理已選嘅 {selectedIds.size} 個面部
              </button>
            </div>

            {/* Detection list */}
            <div className="card">
              <h3 className="font-semibold mb-3">偵測結果詳情</h3>
              <div className="space-y-2">
                {detections.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedIds.has(d.id)
                        ? 'bg-red-900/30 border border-red-500'
                        : 'bg-green-900/20 border border-green-800'
                    }`}
                    onClick={() => handleToggleDetection(d.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedIds.has(d.id) ? '🔒' : '😊'}</span>
                      <div>
                        <span className="font-medium">面部 {d.id + 1}</span>
                        <span className="text-xs text-[var(--text-muted)] ml-2">
                          {Math.round(d.confidence * 100)}% 置信度
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      位置: ({d.bbox.x}, {d.bbox.y}) — {d.bbox.width}×{d.bbox.height}px
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Blur result */}
        {(step === 'blur' || step === 'done') && uploadData && (
          <BlurResult
            originalUrl={api.getImageUrl(uploadData.imageId)}
            blurredBlob={blurredBlob}
            isProcessing={isBlurring}
            onReset={handleReset}
            onDownload={handleDownload}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] mt-12 py-6 text-center text-sm text-[var(--text-muted)]">
        <p>🎭 FaceBlur — YuNet 面部模糊處理工具 — 所有處理喺本地完成，唔會上傳到第三方</p>
      </footer>
    </div>
  );
}

export default App;