import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CHANGELOG, LATEST_RELEASE, type UpdateTag } from '../config/changelog';

interface UpdateNotificationModalProps {
  isOpen: boolean;
  previousVersion: string | null;
  hasLiveUpdate: boolean;
  isUploading: boolean;
  isDesktop: boolean;
  darkMode: boolean;
  onDismissModal: () => void;
  onApplyLiveUpdate: () => void;
  onDismissLiveBanner: () => void;
}

const TAG_STYLES: Record<
  UpdateTag,
  { bgLight: string; textLight: string; bgDark: string; textDark: string }
> = {
  Baru: {
    bgLight: '#ECFDF5',
    textLight: '#047857',
    bgDark: 'rgba(16, 185, 129, 0.18)',
    textDark: '#34D399',
  },
  'Lebih Cepat': {
    bgLight: '#EFF6FF',
    textLight: '#1D4ED8',
    bgDark: 'rgba(59, 130, 246, 0.18)',
    textDark: '#60A5FA',
  },
  Perbaikan: {
    bgLight: '#FFFBEB',
    textLight: '#B45309',
    bgDark: 'rgba(245, 158, 11, 0.18)',
    textDark: '#FBBF24',
  },
};

export function UpdateNotificationModal({
  isOpen,
  previousVersion,
  hasLiveUpdate,
  isUploading,
  isDesktop,
  darkMode,
  onDismissModal,
  onApplyLiveUpdate,
  onDismissLiveBanner,
}: UpdateNotificationModalProps) {
  const [showOlder, setShowOlder] = useState(false);

  const surfaceBg = darkMode ? '#0F172A' : '#FFFFFF';
  const cardBg = darkMode ? '#1E293B' : '#F8FAFC';
  const borderCol = darkMode ? '#334155' : '#E2E8F0';
  const textPrimary = darkMode ? '#F8FAFC' : '#0F172A';
  const textSecondary = darkMode ? '#94A3B8' : '#475569';

  const olderReleases = CHANGELOG.slice(1);

  if (!hasLiveUpdate && !isOpen) return null;

  const content = (
    <>
      {/* ── Live Update Banner (jika update baru terdeteksi saat app sedang terbuka) ── */}
      {hasLiveUpdate && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: isDesktop ? 16 : 'calc(60px + env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10025,
            width: isDesktop ? 'auto' : 'calc(100vw - 24px)',
            maxWidth: 460,
            background: darkMode ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${darkMode ? '#10B981' : '#6EE7B7'}`,
            borderRadius: 14,
            padding: '10px 14px',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>✨</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: textPrimary }}>
              Pembaruan Aplikasi Tersedia
            </div>
            <div style={{ fontSize: 11, color: textSecondary, lineHeight: 1.35 }}>
              {isUploading
                ? 'Tunggu upload selesai lalu muat ulang untuk versi terbaru.'
                : 'Muat ulang sekarang untuk mendapatkan fitur & perbaikan terbaru.'}
            </div>
          </div>
          <button
            type="button"
            disabled={isUploading}
            onClick={onApplyLiveUpdate}
            style={{
              background: isUploading ? '#94A3B8' : '#10B981',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              padding: '6px 11px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: isUploading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isUploading ? 'Mengunggah...' : 'Perbarui'}
          </button>
          <button
            type="button"
            onClick={onDismissLiveBanner}
            aria-label="Tutup notifikasi pembaruan"
            style={{
              background: 'none',
              border: 'none',
              color: textSecondary,
              cursor: 'pointer',
              fontSize: 14,
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Initial Update Explanation Modal (saat user membuka aplikasi versi baru) ── */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-modal-title"
          onClick={onDismissModal}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10030,
            background: 'rgba(15, 23, 42, 0.58)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '86vh',
              background: surfaceBg,
              borderRadius: 20,
              border: `1px solid ${borderCol}`,
              boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 20px 14px',
                background: darkMode
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.16), rgba(59,130,246,0.12))'
                  : 'linear-gradient(135deg, #ECFDF5, #EFF6FF)',
                borderBottom: `1px solid ${borderCol}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: '#10B981',
                    color: '#FFFFFF',
                  }}
                >
                  ✨ Pembaruan v{LATEST_RELEASE.version}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: textSecondary }}>
                  {LATEST_RELEASE.date}
                </span>
              </div>

              <h2
                id="update-modal-title"
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 800,
                  color: textPrimary,
                  lineHeight: 1.3,
                }}
              >
                {LATEST_RELEASE.title}
              </h2>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 12.5,
                  color: textSecondary,
                  lineHeight: 1.45,
                }}
              >
                {previousVersion
                  ? `Aplikasi berhasil diperbarui dari v${previousVersion}. `
                  : ''}
                {LATEST_RELEASE.summary}
              </p>
            </div>

            {/* Body (Scrollable list of highlights) */}
            <div
              style={{
                padding: '14px 18px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {LATEST_RELEASE.highlights.map((item, idx) => {
                const tagStyle = TAG_STYLES[item.tag];
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: cardBg,
                      border: `1px solid ${borderCol}`,
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: darkMode ? '#0F172A' : '#FFFFFF',
                        border: `1px solid ${borderCol}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 17,
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginBottom: 3,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: textPrimary,
                          }}
                        >
                          {item.title}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background: darkMode ? tagStyle.bgDark : tagStyle.bgLight,
                            color: darkMode ? tagStyle.textDark : tagStyle.textLight,
                          }}
                        >
                          {item.tag}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: textSecondary,
                          lineHeight: 1.45,
                        }}
                      >
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}

              {olderReleases.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowOlder((v) => !v)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3B82F6',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '4px 0',
                    }}
                  >
                    {showOlder
                      ? 'Sembunyikan versi sebelumnya ▲'
                      : `Lihat riwayat versi sebelumnya (${olderReleases.length}) ▼`}
                  </button>

                  {showOlder && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                      {olderReleases.map((rel) => (
                        <div
                          key={rel.version}
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            border: `1px solid ${borderCol}`,
                            background: cardBg,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              color: textPrimary,
                            }}
                          >
                            <span>v{rel.version} — {rel.title}</span>
                            <span style={{ color: textSecondary, fontWeight: 500 }}>{rel.date}</span>
                          </div>
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: 18,
                              fontSize: 11.5,
                              color: textSecondary,
                              lineHeight: 1.5,
                            }}
                          >
                            {rel.highlights.map((h, i) => (
                              <li key={i}>
                                <strong style={{ color: textPrimary }}>{h.title}:</strong>{' '}
                                {h.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 18px 16px',
                borderTop: `1px solid ${borderCol}`,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={onDismissModal}
                style={{
                  width: '100%',
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.28)',
                }}
              >
                Mengerti & Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : content;
}
