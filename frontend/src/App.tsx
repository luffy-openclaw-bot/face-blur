import { useState, useCallback } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { DetectionCanvas } from './components/DetectionCanvas';
import { BlurResult } from './components/BlurResult';
import { ReferenceUploader } from './components/ReferenceUploader';
import { api } from './services/api';
import type {
  FaceDetection,
  ProcessingStep,
  UploadResponse,
  FaceRegion,
  ReferenceFace,
  FaceMatch,
  MatchAction,
} from './types';

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

  // Reference faces state
  const [referenceFaces, setReferenceFaces] = useState<ReferenceFace[]>([]);
  const [referenceActions, setReferenceActions] = useState<Record<string, MatchAction>>({});

  // Matching state
  const [isMatching, setIsMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<FaceMatch[]>([]);

  // Blur state
  const [isBlurring, setIsBlurring] = useState(false);
  const [blurredBlob, setBlurredBlob] = useState<Blob | null>(null);
  const [blurStrength, setBlurStrength] = useState(25);
  const [padding, setPadding] = useState(0.3);
  const [threshold, setThreshold] = useState(0.5);
  const [matchThreshold, setMatchThreshold] = useState(0.4);

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

      // Auto-select all faces
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

  const handleReferenceAdded = useCallback((ref: ReferenceFace) => {
    setReferenceFaces((prev) => [...prev, ref]);
    setReferenceActions((prev) => ({ ...prev, [ref.refId]: 'blur' }));
  }, []);

  const handleRemoveReference = useCallback((refId: string) => {
    setReferenceFaces((prev) => prev.filter((r) => r.refId !== refId));
    setReferenceActions((prev) => {
      const next = { ...prev };
      delete next[refId];
      return next;
    });
  }, []);

  const handleActionChange = useCallback((refId: string, action: MatchAction) => {
    setReferenceActions((prev) => ({ ...prev, [refId]: action }));
  }, []);

  const handleMatchFaces = useCallback(async () => {
    if (!uploadData || referenceFaces.length === 0) return;

    setError(null);
    setIsMatching(true);

    try {
      const refs = referenceFaces.map((ref) => ({
        refId: ref.refId,
        embedding: ref.embedding,
      }));

      const result = await api.matchFaces(
        uploadData.imageId,
        refs,
        threshold,
        matchThreshold,
      );

      setMatchResults(result.matches);

      // Auto-select matched faces based on actions
      const newSelectedIds = new Set<number>();

      // First, start with all faces selected (for "blur all" behavior)
      detections.forEach((d) => newSelectedIds.add(d.id));

      // Then process reference face matches
      for (const match of result.matches) {
        if (match.isMatch && match.matchedRef) {
          const action = referenceActions[match.matchedRef];
          if (action === 'exclude') {
            // Remove this face from selection (keep it clear)
            newSelectedIds.delete(match.faceIndex);
          }
          // If action is 'blur', it's already selected
        }
      }

      setSelectedIds(newSelectedIds);
      setStep('match');
    } catch (err) {
      setError(err instanceof Error ? err.message : '面部匹配失敗');
    } finally {
      setIsMatching(false);
    }
  }, [uploadData, referenceFaces, referenceActions, threshold, matchThreshold, detections]);

  const handleBlur = useCallback(async () => {
    if (!uploadData) return;

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
      setStep('match');
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
    setReferenceFaces([]);
    setReferenceActions({});
    setMatchResults([]);
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
              <p className="text-xs text-[var(--text-muted)]">YuNet 面部偵測 + SFace 面部匹配</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-block w-2 h-2 rounded-full ${isModelReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-[var(--text-muted)]">
              {isModelReady ? '模型就緒' : '模型載入中...'}
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
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-bold mb-3">上載群組相片</h2>
              <p className="text-[var(--text-muted)]">
                上載一張群組相片，系統會自動偵測所有面部。之後你可以上載參考面部相片，
                搵出指定嘅人並選擇模糊或保留。
              </p>
            </div>
            <ImageUploader onUpload={handleUpload} isLoading={isUploading} />

            <div className="card max-w-md w-full space-y-4">
              <div>
                <label className="text-sm font-semibold block mb-2">偵測靈敏度 (threshold)</label>
                <p className="text-xs text-[var(--text-muted)] mb-2">越低偵測越多面部</p>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="0.3" max="0.9" step="0.05" value={threshold}
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
          </div>
        )}

        {/* Step: Select faces + reference upload */}
        {(step === 'select' || step === 'match') && uploadData && (
          <div className="flex flex-col gap-6">
            {/* Detection results header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">選擇要模糊處理嘅面部</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  偵測到 {detections.length} 個面部 — 按一下邊界框嚟選擇/取消選擇
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSelectAll} className="btn-secondary text-sm">全選</button>
                <button onClick={handleDeselectAll} className="btn-secondary text-sm">全不選</button>
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
                matchResults={matchResults}
                referenceActions={referenceActions}
                onToggleDetection={handleToggleDetection}
              />
            </div>

            {/* Reference Face Section */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">🔍 參考面部匹配</h3>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                上載一張清晰嘅面部相片，系統會搵出群組相中同一個人嘅面。你可以設定每個參考面部嘅動作。
              </p>

              {/* Reference faces list */}
              {referenceFaces.length > 0 && (
                <div className="space-y-3 mb-4">
                  {referenceFaces.map((ref) => (
                    <div key={ref.refId} className="flex items-center gap-4 p-3 bg-[var(--bg-dark)] rounded-lg">
                      {/* Face crop preview */}
                      {ref.faceCropBase64 && (
                        <img
                          src={`data:image/jpeg;base64,${ref.faceCropBase64}`}
                          alt={ref.label}
                          className="w-12 h-12 rounded-full object-cover border-2 border-[var(--primary)]"
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{ref.label || `參考 ${referenceFaces.indexOf(ref) + 1}`}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {matchResults.filter(m => m.isMatch && m.matchedRef === ref.refId).length} 個匹配
                        </div>
                      </div>

                      {/* Action selector */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleActionChange(ref.refId, 'blur')}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                            referenceActions[ref.refId] === 'blur'
                              ? 'bg-red-600 text-white'
                              : 'bg-[var(--bg-dark)] text-[var(--text-muted)] hover:bg-red-900/30'
                          }`}
                        >
                          🔒 模糊
                        </button>
                        <button
                          onClick={() => handleActionChange(ref.refId, 'exclude')}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                            referenceActions[ref.refId] === 'exclude'
                              ? 'bg-green-600 text-white'
                              : 'bg-[var(--bg-dark)] text-[var(--text-muted)] hover:bg-green-900/30'
                          }`}
                        >
                          ✅ 排除
                        </button>
                      </div>

                      <button
                        onClick={() => handleRemoveReference(ref.refId)}
                        className="text-[var(--text-muted)] hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Match threshold */}
              {referenceFaces.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold">匹配閾值</label>
                    <span className="text-sm text-[var(--text-muted)]">{matchThreshold}</span>
                  </div>
                  <input
                    type="range" min="0.2" max="0.8" step="0.05" value={matchThreshold}
                    onChange={(e) => setMatchThreshold(Number(e.target.value))}
                    className="w-full accent-[var(--primary)]"
                  />
                  <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                    <span>嚴格（只匹配極似）</span>
                    <span>寬鬆（匹配更多）</span>
                  </div>
                </div>
              )}

              {/* Match button */}
              {referenceFaces.length > 0 && (
                <button
                  onClick={handleMatchFaces}
                  disabled={isMatching}
                  className="btn-primary w-full mb-4"
                >
                  {isMatching ? '🔄 匹配中...' : `🔍 匹配 ${referenceFaces.length} 個參考面部`}
                </button>
              )}

              {/* Upload new reference */}
              <ReferenceUploader
                onReferenceAdded={handleReferenceAdded}
                isProcessing={isBlurring}
              />
            </div>

            {/* Match results */}
            {matchResults.length > 0 && (
              <div className="card">
                <h3 className="font-semibold mb-3">匹配結果</h3>
                <div className="space-y-2">
                  {matchResults.map((m) => {
                    const matchedRef = referenceFaces.find(r => r.refId === m.matchedRef);
                    const action = m.matchedRef ? referenceActions[m.matchedRef] : null;
                    return (
                      <div
                        key={m.faceIndex}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedIds.has(m.faceIndex)
                            ? 'bg-red-900/30 border border-red-500'
                            : 'bg-green-900/20 border border-green-800'
                        }`}
                        onClick={() => handleToggleDetection(m.faceIndex)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {m.isMatch ? (action === 'exclude' ? '✅' : '🔒') : '😊'}
                          </span>
                          <div>
                            <span className="font-medium">面部 {m.faceIndex + 1}</span>
                            {m.isMatch && matchedRef && (
                              <span className="text-sm ml-2 text-[var(--primary)]">
                                → {matchedRef.label}
                              </span>
                            )}
                            <span className="text-xs text-[var(--text-muted)] ml-2">
                              偵測 {Math.round(m.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.isMatch && (
                            <span className="text-xs px-2 py-1 rounded bg-[var(--primary)]/20 text-[var(--primary)]">
                              匹配 {Math.round(m.matchScore * 100)}%
                            </span>
                          )}
                          <span className="text-xs text-[var(--text-muted)]">
                            ({m.bbox.x}, {m.bbox.y}) {m.bbox.width}×{m.bbox.height}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Blur settings */}
            <div className="card space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">模糊強度</label>
                  <span className="text-sm text-[var(--text-muted)]">{blurStrength}</span>
                </div>
                <input
                  type="range" min="5" max="50" value={blurStrength}
                  onChange={(e) => setBlurStrength(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                  <span>輕微</span><span>強烈</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">面部框擴展 (padding)</label>
                  <span className="text-sm text-[var(--text-muted)]">{Math.round(padding * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="0.6" step="0.05" value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                  <span>貼面</span><span>寬鬆</span>
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

            {/* Detection list (without matches) */}
            {matchResults.length === 0 && (
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
                        ({d.bbox.x}, {d.bbox.y}) — {d.bbox.width}×{d.bbox.height}px
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
        <p>🎭 FaceBlur — YuNet + SFace 面部偵測與模糊處理 — 所有處理喺本地完成</p>
      </footer>
    </div>
  );
}

export default App;