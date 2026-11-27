// src/components/report/preview/ReportWorkspaceLayout.tsx
import React, { useState, useEffect } from 'react';
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
        className={`flex bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-sm ${
          showDesktopPreview ? 'h-[calc(100vh-124px)] min-h-[600px]' : 'min-h-[600px]'
        }`}
      >
        {/* KIRI: Form Input Wizard (~45% saat split-screen, penuh saat preview disembunyikan) */}
        <div
          className={`flex flex-col min-w-0 bg-gray-50 ${
            showDesktopPreview ? 'w-[46%] xl:w-[45%] h-full' : 'w-full'
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

        {/* KANAN: Real .docx Live Document Preview (~54%) */}
        {showDesktopPreview && (
          <div className="w-[54%] xl:w-[55%] h-full border-l border-gray-200 flex flex-col min-w-0">
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
