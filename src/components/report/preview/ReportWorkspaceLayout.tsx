// src/components/report/preview/ReportWorkspaceLayout.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useResponsive } from '../../../hooks/useResponsive';
import { registerBackInterceptor } from '../../../utils/navigationGuard';
import type { ReportPreviewData } from '../../../utils/reportTemplatePayload';
import { LiveDocumentPreview } from './LiveDocumentPreview';

interface ReportWorkspaceLayoutProps {
  previewData: ReportPreviewData;
  stickyHeader: React.ReactNode;
  bottomNav: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Adaptive Split-Screen Workspace (Desktop >= 1024px) &
 * Floating "Intip Halaman" Modal (Mobile/Tablet < 1024px).
 */
export function ReportWorkspaceLayout({
  previewData,
  stickyHeader,
  bottomNav,
  children,
}: ReportWorkspaceLayoutProps) {
  const { isDesktop } = useResponsive();
  const [showDesktopPreview, setShowDesktopPreview] = useState(true);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [splitRatio, setSplitRatio] = useState<number>(44);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const handleStartDragSplit = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);

    const onMove = (ev: PointerEvent) => {
      const el = workspaceRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.max(28, Math.min(68, Math.round(pct * 10) / 10)));
    };

    const onUp = () => {
      setIsDraggingSplit(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Pastikan tombol Back perangkat di Mobile menutup modal preview terlebih dahulu, bukan keluar wizard
  useEffect(() => {
    if (!showMobileModal) return;
    const unregister = registerBackInterceptor(() => {
      setShowMobileModal(false);
      return true;
    });
    return unregister;
  }, [showMobileModal]);

  if (isDesktop) {
    return (
      <div
        ref={workspaceRef}
        className={`flex bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-sm ${
          showDesktopPreview ? 'h-[calc(100vh-100px)] min-h-[580px]' : 'min-h-[600px]'
        } ${isDraggingSplit ? 'select-none' : ''}`}
      >
        {/* KIRI: Form Input Wizard (bisa digeser lebarnya lewat garis tengah) */}
        <div
          style={showDesktopPreview ? { width: `${splitRatio}%` } : undefined}
          className={`flex flex-col min-w-0 bg-gray-50 ${
            showDesktopPreview ? 'h-full shrink-0' : 'w-full'
          }`}
        >
          <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">{stickyHeader}</div>
            {!showDesktopPreview && (
              <button
                type="button"
                onClick={() => setShowDesktopPreview(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shrink-0"
              >
                👁️ Tampilkan Live Preview
              </button>
            )}
          </div>

          <div
            className={`flex-1 ${
              showDesktopPreview ? 'overflow-y-auto p-4' : 'p-4 max-w-3xl mx-auto w-full'
            }`}
          >
            <div className="space-y-4">{children}</div>
          </div>

          <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-3">
            <div className={showDesktopPreview ? '' : 'max-w-3xl mx-auto'}>{bottomNav}</div>
          </div>
        </div>

        {/* PEMISAH TENGAH BISA DIGESER (DRAG TO RESIZE) */}
        {showDesktopPreview && (
          <div
            onPointerDown={handleStartDragSplit}
            onDoubleClick={() => setSplitRatio(44)}
            title="Geser kiri/kanan untuk mengatur lebar Form & Preview (klik 2x untuk reset)"
            className={`w-2 cursor-col-resize shrink-0 flex items-center justify-center transition-colors border-l border-r border-gray-200 ${
              isDraggingSplit ? 'bg-emerald-500' : 'bg-gray-100 hover:bg-emerald-100'
            }`}
          >
            <span className={`text-[10px] font-bold leading-none ${isDraggingSplit ? 'text-white' : 'text-gray-400'}`}>
              ⋮
            </span>
          </div>
        )}

        {/* KANAN: Real .docx Live Document Preview */}
        {showDesktopPreview && (
          <div className="flex-1 h-full flex flex-col min-w-0">
            <LiveDocumentPreview
              previewData={previewData}
              mode="desktop"
              onHideDesktop={() => setShowDesktopPreview(false)}
            />
          </div>
        )}
      </div>
    );
  }

  // MOBILE / TABLET LAYOUT (< 1024px)
  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto">{stickyHeader}</div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">{children}</div>

      {/* Tombol Mengambang Thumb-Friendly "Intip Halaman" */}
      <button
        type="button"
        onClick={() => setShowMobileModal(true)}
        className="fixed bottom-[72px] right-4 z-30 px-4 py-2.5 rounded-full bg-slate-900 text-white text-xs font-extrabold shadow-lg border border-slate-700 hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-1.5"
      >
        <span>👁️</span>
        <span>Intip Halaman</span>
      </button>

      {/* Bottom Sticky Bar Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto">{bottomNav}</div>
      </div>

      {/* Modal Fullscreen Preview Mobile */}
      {showMobileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col bg-slate-200 overflow-hidden">
            <LiveDocumentPreview
              previewData={previewData}
              mode="mobile-modal"
              onCloseMobile={() => setShowMobileModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
