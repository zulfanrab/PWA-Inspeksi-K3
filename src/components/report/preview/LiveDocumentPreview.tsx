// src/components/report/preview/LiveDocumentPreview.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { getApiBaseUrl } from '../../../config';
import {
  loadCachedDocxTemplate,
  subscribeDocxTemplateUpdate,
} from '../../../utils/docxTemplateCache';
import {
  buildTemplateRenderData,
  type ReportPreviewData,
} from '../../../utils/reportTemplatePayload';
import { HtmlPaperMirror, hasDedicatedHtmlMirror } from './HtmlPaperMirror';

interface LiveDocumentPreviewProps {
  previewData: ReportPreviewData;
  mode: 'desktop' | 'mobile-modal';
  onHideDesktop?: () => void;
  onCloseMobile?: () => void;
}

type EngineState = 'loading-template' | 'docx-ready' | 'fallback-html';

export function LiveDocumentPreview({
  previewData,
  mode,
  onHideDesktop,
  onCloseMobile,
}: LiveDocumentPreviewProps) {
  const apiBase = getApiBaseUrl();
  const typeCode = String(previewData.inspectionTypeCode || 'IPP').toUpperCase();
  const isDesktop = mode === 'desktop';

  // Di Desktop: prioritas .docx live preview.
  // Di Mobile: HTML Paper Mirror instan untuk IPP/IL; untuk alat masa depan (tanpa mirror khusus), coba .docx on-demand!
  const shouldUseDocxEngine = isDesktop || !hasDedicatedHtmlMirror(typeCode);

  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [manualZoom, setManualZoom] = useState<number>(isDesktop ? 0.75 : 0.48);
  const [showMedia, setShowMedia] = useState<boolean>(!isDesktop);
  const [preferHtmlOnDesktop, setPreferHtmlOnDesktop] = useState<boolean>(false);

  const [templateBuffer, setTemplateBuffer] = useState<ArrayBuffer | null>(null);
  const [engineState, setEngineState] = useState<EngineState>(
    shouldUseDocxEngine ? 'loading-template' : 'fallback-html'
  );
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [isSyncingRender, setIsSyncingRender] = useState<boolean>(false);
  const [isRefreshingTemplate, setIsRefreshingTemplate] = useState<boolean>(false);

  // Cache dataUrl untuk foto Drive (hanya bila showMedia=true di mode .docx)
  const [resolvedMediaMap, setResolvedMediaMap] = useState<Record<string, string>>({});

  // Scroll viewport & scaling measurements (anti-loncat halaman 1 & anti-overflow)
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const docxBodyRef = useRef<HTMLDivElement>(null);
  const docxStyleRef = useRef<HTMLDivElement>(null);
  const mirrorWrapRef = useRef<HTMLDivElement>(null);

  const [viewportWidth, setViewportWidth] = useState<number>(600);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 816, h: 1120 });

  // Measure viewport width dynamically
  useEffect(() => {
    const el = scrollViewportRef.current;
    if (!el) return;
    const updateWidth = () => setViewportWidth(el.clientWidth || 600);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Unduh & cache Master .docx + pantau pembaruan otomatis jika ada revisi baru di Google Drive
  useEffect(() => {
    if (!shouldUseDocxEngine) return;
    let cancelled = false;
    setEngineState('loading-template');
    setFallbackReason(null);

    const unsubscribe = subscribeDocxTemplateUpdate(typeCode, (updated) => {
      if (cancelled || !updated.buffer) return;
      setTemplateBuffer(updated.buffer);
      setEngineState('docx-ready');
      setFallbackReason(null);
    });

    loadCachedDocxTemplate(typeCode, apiBase).then((res) => {
      if (cancelled) return;
      if (res.buffer) {
        setTemplateBuffer(res.buffer);
        setEngineState('docx-ready');
      } else {
        setTemplateBuffer(null);
        setEngineState('fallback-html');
        setFallbackReason(res.error || 'Template Word (.docx) belum tersedia di cache.');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [typeCode, apiBase, shouldUseDocxEngine]);

  const handleForceReloadTemplate = async () => {
    setIsRefreshingTemplate(true);
    setFallbackReason(null);
    try {
      const res = await loadCachedDocxTemplate(typeCode, apiBase, true);
      if (res.buffer) {
        setTemplateBuffer(res.buffer);
        setEngineState('docx-ready');
      } else {
        setEngineState('fallback-html');
        setFallbackReason(res.error || 'Template belum tersedia.');
      }
    } finally {
      setIsRefreshingTemplate(false);
    }
  };

  // Lazy resolve foto Drive (jika foto inspeksi belum memiliki base64 dataUrl lokal)
  useEffect(() => {
    if (!showMedia || !shouldUseDocxEngine || engineState !== 'docx-ready' || preferHtmlOnDesktop) {
      return;
    }
    const candidates = [
      ...previewData.gridPhotos,
      ...(previewData.jointPhoto ? [previewData.jointPhoto] : []),
    ].filter((p) => !p.dataUrl && p.driveFileId && !resolvedMediaMap[p.id]);

    if (candidates.length === 0 || !navigator.onLine) return;

    let cancelled = false;
    Promise.all(
      candidates.slice(0, 12).map(async (p) => {
        try {
          const res = await fetch(`${apiBase}/api/photo-proxy?fileId=${p.driveFileId}`);
          if (!res.ok) return [p.id, '__error__'] as const;
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(blob);
          });
          return [p.id, dataUrl || '__error__'] as const;
        } catch {
          return [p.id, '__error__'] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      const updates: Record<string, string> = {};
      pairs.forEach((pair) => {
        if (pair) updates[pair[0]] = pair[1];
      });
      if (Object.keys(updates).length > 0) {
        setResolvedMediaMap((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    showMedia,
    shouldUseDocxEngine,
    engineState,
    preferHtmlOnDesktop,
    previewData.gridPhotos,
    previewData.jointPhoto,
    resolvedMediaMap,
    apiBase,
  ]);

  const activeDocxMode =
    shouldUseDocxEngine && engineState === 'docx-ready' && templateBuffer !== null && !preferHtmlOnDesktop;

  // Render ulang .docx dengan debounce pintar 600ms & pertahankan posisi scroll
  useEffect(() => {
    if (!activeDocxMode || !templateBuffer) {
      setIsSyncingRender(false);
      return;
    }

    let cancelled = false;
    setIsSyncingRender(true);

    const timer = window.setTimeout(async () => {
      const bodyEl = docxBodyRef.current;
      const styleEl = docxStyleRef.current;
      const viewportEl = scrollViewportRef.current;
      if (!bodyEl || !styleEl || !viewportEl) {
        if (!cancelled) setIsSyncingRender(false);
        return;
      }

      const savedScrollTop = viewportEl.scrollTop;
      const savedScrollLeft = viewportEl.scrollLeft;

      try {
        const { renderFilledDocxIntoElement } = await import('../../../utils/browserDocxRenderer');
        if (cancelled) return;
        const renderPayload = buildTemplateRenderData(previewData, {
          includeMedia: showMedia,
          resolvedMediaMap,
        });
        await renderFilledDocxIntoElement(templateBuffer, renderPayload, bodyEl, styleEl);
        if (cancelled) return;

        // Ukur dimensi wrapper halaman .docx hasil render agar Fit Width akurat
        const wrapper =
          (bodyEl.querySelector('.aksara-docx-preview-wrapper') as HTMLElement | null) || bodyEl;
        const firstSection = bodyEl.querySelector('section.aksara-docx-preview') as HTMLElement | null;
        const measuredW = firstSection
          ? Math.max(firstSection.offsetWidth + 32, 790)
          : Math.max(wrapper.scrollWidth, 816);
        const measuredH = Math.max(wrapper.scrollHeight, 1000);
        setNaturalSize({ w: measuredW, h: measuredH });

        requestAnimationFrame(() => {
          if (scrollViewportRef.current) {
            scrollViewportRef.current.scrollTop = savedScrollTop;
            scrollViewportRef.current.scrollLeft = savedScrollLeft;
          }
        });
      } catch (err: any) {
        console.warn('[LiveDocumentPreview] Gagal render .docx client-side, fallback ke HTML:', err);
        if (!cancelled) {
          setEngineState('fallback-html');
          setFallbackReason('Template .docx tidak dapat diparsing di browser; beralih ke HTML Mirror.');
        }
      } finally {
        if (!cancelled) setIsSyncingRender(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDocxMode, templateBuffer, previewData, showMedia, resolvedMediaMap]);

  // Ukur tinggi alami HTML Mirror ketika aktif
  useEffect(() => {
    if (activeDocxMode) return;
    const el = mirrorWrapRef.current;
    if (!el) return;
    const measure = () => {
      setNaturalSize({
        w: 816,
        h: Math.max(el.scrollHeight, 1120),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeDocxMode, previewData, showMedia]);

  const effectiveScale = useMemo(() => {
    if (zoomMode === 'fit') {
      const avail = Math.max(viewportWidth - 32, 240);
      return Number(Math.max(0.28, Math.min(1.15, avail / Math.max(naturalSize.w, 816))).toFixed(3));
    }
    return manualZoom;
  }, [zoomMode, viewportWidth, naturalSize.w, manualZoom]);

  const stepZoom = (delta: number) => {
    const base = zoomMode === 'fit' ? effectiveScale : manualZoom;
    setZoomMode('manual');
    setManualZoom(Number(Math.max(0.3, Math.min(1.5, base + delta)).toFixed(2)));
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-200/80 select-text">
      {/* Toolbar Atas (dengan safe-area inset agar tidak menabrak notch/status bar HP) */}
      <div
        className="bg-white border-b border-gray-200 px-3 pb-2.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 shrink-0 shadow-sm"
        style={{
          paddingTop: !isDesktop ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : '8px',
        }}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                engineState === 'loading-template' || isSyncingRender
                  ? 'bg-amber-500 animate-pulse'
                  : activeDocxMode
                  ? 'bg-emerald-500'
                  : 'bg-sky-500'
              }`}
            />
            <span className="text-xs sm:text-[11px] font-bold text-gray-700 truncate">
              {engineState === 'loading-template'
                ? 'Memuat Master .docx...'
                : isSyncingRender && activeDocxMode
                ? 'Menyinkronkan preview...'
                : activeDocxMode
                ? 'Tersinkron (.docx Asli)'
                : 'Preview Laporan (Instan)'}
            </span>
          </div>
          {!isDesktop && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="px-3.5 py-2 min-h-[36px] rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-extrabold shadow-sm shrink-0 transition-all"
            >
              ✕ Tutup
            </button>
          )}
        </div>

        {/* Kontrol Zoom, Media & Hide */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => stepZoom(-0.1)}
              className="px-2 py-1 text-[11px] font-bold text-gray-700 hover:bg-white rounded-md"
              title="Perkecil"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoomMode('fit')}
              className={`px-2 py-1 text-[10px] font-bold rounded-md ${
                zoomMode === 'fit' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600'
              }`}
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomMode('manual');
                setManualZoom(0.75);
              }}
              className={`hidden sm:inline-block px-2 py-1 text-[10px] font-bold rounded-md ${
                zoomMode === 'manual' && Math.abs(manualZoom - 0.75) < 0.02
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              75%
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomMode('manual');
                setManualZoom(1);
              }}
              className={`px-2 py-1 text-[10px] font-bold rounded-md ${
                zoomMode === 'manual' && Math.abs(manualZoom - 1) < 0.02
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              100%
            </button>
            <button
              type="button"
              onClick={() => stepZoom(0.1)}
              className="px-2 py-1 text-[11px] font-bold text-gray-700 hover:bg-white rounded-md"
              title="Perbesar"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowMedia((m) => !m)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
              showMedia
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
            title="Matikan saat mengetik cepat agar render super ringan"
          >
            📷 {showMedia ? 'Foto & SKP: ON' : 'Foto & SKP: OFF'}
          </button>

          {isDesktop && shouldUseDocxEngine && (
            <button
              type="button"
              onClick={handleForceReloadTemplate}
              disabled={isRefreshingTemplate}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 disabled:opacity-50"
              title="Ambil versi Template .docx terbaru langsung dari Google Drive"
            >
              {isRefreshingTemplate ? '↻ Memuat...' : '↻ Sync .docx'}
            </button>
          )}

          {isDesktop && templateBuffer && (
            <button
              type="button"
              onClick={() => setPreferHtmlOnDesktop((v) => !v)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
              title="Ganti antara .docx asli dan HTML Paper Mirror"
            >
              {preferHtmlOnDesktop ? 'Mode: .docx' : 'Mode: HTML'}
            </button>
          )}

          {isDesktop && onHideDesktop && (
            <button
              type="button"
              onClick={onHideDesktop}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              ✕ Sembunyikan
            </button>
          )}
        </div>
      </div>

      {/* Notifikasi Fallback Ramah (tanpa menutupi konten) */}
      {fallbackReason && !preferHtmlOnDesktop && isDesktop && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[11px] text-amber-800 flex items-center justify-between gap-2 shrink-0">
          <span>
            ℹ️ {fallbackReason} Menampilkan <strong>HTML Paper Mirror</strong> agar Anda tetap bisa mengedit lancar.
          </span>
          <button
            type="button"
            onClick={handleForceReloadTemplate}
            disabled={isRefreshingTemplate}
            className="font-bold underline shrink-0 disabled:opacity-50"
          >
            {isRefreshingTemplate ? 'Memuat...' : 'Coba Muat Ulang'}
          </button>
        </div>
      )}

      {/* Kanvas Preview Kertas Folio */}
      <div
        ref={scrollViewportRef}
        data-allow-horizontal-scroll
        className="flex-1 overflow-auto p-4 relative"
        style={{ backgroundColor: '#CBD5E1' }}
      >
        <div
          className="mx-auto relative overflow-hidden"
          style={{
            width: `${Math.ceil(naturalSize.w * effectiveScale)}px`,
            height: `${Math.ceil(naturalSize.h * effectiveScale)}px`,
          }}
        >
          <div
            style={{
              width: `${naturalSize.w}px`,
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
            }}
          >
            {/* Wadah CSS docx-preview + wadah render .docx asli */}
            <div className={activeDocxMode ? 'block' : 'hidden'}>
              <div ref={docxStyleRef} />
              <div ref={docxBodyRef} />
            </div>

            {/* Wadah HTML Paper Mirror (Mobile default & Desktop fallback) */}
            {!activeDocxMode && (
              <div ref={mirrorWrapRef}>
                <HtmlPaperMirror
                  previewData={previewData}
                  showMedia={showMedia}
                  apiBase={apiBase}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Quick-Close Bar Mobile (Thumb-Friendly + Safe Area Bottom) */}
      {!isDesktop && onCloseMobile && (
        <div
          className="bg-white border-t border-gray-200 px-4 pt-2.5 shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
        >
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-xs font-extrabold transition-all"
          >
            ← Kembali ke Form Laporan
          </button>
        </div>
      )}
    </div>
  );
}
