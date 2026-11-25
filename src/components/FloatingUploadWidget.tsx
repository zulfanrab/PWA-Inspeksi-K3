import { useState } from 'react';
import type { UploadJob } from '../hooks/useUploadQueue';

interface FloatingUploadWidgetProps {
  jobs: UploadJob[];
  activeJob: UploadJob | null;
  isUploading: boolean;
  overallPercent: number;
  doneCount: number;
  errorCount: number;
  totalPhotos: number;
  loadedPhotos: number;
  isDesktop: boolean;
  darkMode: boolean;
  onOpenSyncHub: () => void;
  onCancelJob: (id: string) => void;
  onCancelAll: () => void;
  onRetryFailed: () => void;
  onDismiss: () => void;
}

export function FloatingUploadWidget({
  jobs,
  activeJob,
  isUploading,
  overallPercent,
  doneCount,
  errorCount,
  totalPhotos,
  loadedPhotos,
  isDesktop,
  darkMode,
  onOpenSyncHub,
  onCancelJob,
  onCancelAll,
  onRetryFailed,
  onDismiss,
}: FloatingUploadWidgetProps) {
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (jobs.length === 0) return null;

  const activeOrQueuedCount = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'uploading'
  ).length;
  const totalNonCancelled = jobs.filter((j) => j.status !== 'cancelled').length;
  const currentUnitNumber = Math.min(
    totalNonCancelled,
    doneCount + (activeJob ? 1 : 0)
  );

  const surfaceBg = darkMode
    ? 'rgba(15, 23, 42, 0.94)'
    : 'rgba(255, 255, 255, 0.96)';
  const borderCol = darkMode ? '#334155' : '#CBD5E1';
  const textPrimary = darkMode ? '#F8FAFC' : '#0F172A';
  const textSecondary = darkMode ? '#94A3B8' : '#64748B';

  const statusColor =
    !isUploading && errorCount > 0
      ? '#EF4444'
      : !isUploading && doneCount > 0
      ? '#10B981'
      : '#10B981';

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: isDesktop ? 24 : 'calc(92px + env(safe-area-inset-bottom, 0px))',
    right: isDesktop ? 24 : 12,
    zIndex: 60,
    pointerEvents: 'none',
    maxWidth: isDesktop ? 360 : 'calc(100vw - 24px)',
  };

  // ── MODE MINI: Chip bulat/kapsul kecil yang selalu menampilkan % tanpa ganggu layar ──
  if (minimized) {
    const radius = 11;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (overallPercent / 100) * circumference;

    return (
      <div style={containerStyle}>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          title="Ketuk untuk memperbesar status upload"
          aria-label={`Status upload ${overallPercent}%`}
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px 7px 9px',
            borderRadius: 999,
            background: surfaceBg,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${borderCol}`,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
            color: textPrimary,
            cursor: 'pointer',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke={darkMode ? '#334155' : '#E2E8F0'}
              strokeWidth="3"
            />
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke={statusColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 14 14)"
              style={{ transition: 'stroke-dashoffset 0.2s ease' }}
            />
            <text
              x="14"
              y="17"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              fill={statusColor}
            >
              {isUploading ? '↑' : errorCount > 0 ? '!' : '✓'}
            </text>
          </svg>

          <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: textPrimary }}>
              {isUploading
                ? `${overallPercent}%`
                : errorCount > 0
                ? `${errorCount} Gagal`
                : 'Selesai'}
            </div>
            <div style={{ fontSize: 10, color: textSecondary, fontWeight: 600 }}>
              {isUploading
                ? `${loadedPhotos}/${totalPhotos} foto`
                : `${doneCount}/${totalNonCancelled} unit`}
            </div>
          </div>
        </button>
      </div>
    );
  }

  // ── MODE COMPACT / EXPANDED ──
  return (
    <div style={containerStyle}>
      <div
        style={{
          pointerEvents: 'auto',
          width: isDesktop ? 350 : 'min(340px, calc(100vw - 24px))',
          background: surfaceBg,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${borderCol}`,
          boxShadow:
            '0 12px 30px -6px rgba(0, 0, 0, 0.28), 0 6px 12px -4px rgba(0, 0, 0, 0.14)',
          borderRadius: 16,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            title={expanded ? 'Tutup rincian antrean' : 'Lihat rincian antrean'}
          >
            {isUploading ? (
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(16, 185, 129, 0.25)',
                  borderTopColor: '#10B981',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }}
              />
            ) : (
              <span style={{ fontSize: 13, flexShrink: 0 }}>
                {errorCount > 0 ? '⚠️' : '✅'}
              </span>
            )}

            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: textPrimary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {isUploading
                ? totalNonCancelled > 1
                  ? `Mengunggah (${currentUnitNumber}/${totalNonCancelled} unit)`
                  : 'Mengunggah ke Drive'
                : errorCount > 0
                ? `${errorCount} unit gagal diunggah`
                : `${doneCount} unit selesai diunggah`}
            </span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 8,
                background:
                  !isUploading && errorCount > 0
                    ? 'rgba(239, 68, 68, 0.14)'
                    : 'rgba(16, 185, 129, 0.15)',
                color: statusColor,
              }}
            >
              {overallPercent}%
            </span>

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Ciutkan detail' : 'Lihat detail'}
              title={expanded ? 'Tutup detail' : 'Lihat antrean'}
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                border: 'none',
                background: darkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                color: textSecondary,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {expanded ? '▾' : '▴'}
            </button>

            <button
              type="button"
              onClick={() => setMinimized(true)}
              aria-label="Perkecil widget upload"
              title="Perkecil ke sudut layar"
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                border: 'none',
                background: darkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                color: textSecondary,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              −
            </button>

            {!isUploading && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Tutup status upload"
                title="Tutup"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  border: 'none',
                  background: darkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                  color: textSecondary,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Subtitle unit aktif */}
        {activeJob && (
          <div
            style={{
              fontSize: 11,
              color: textSecondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontWeight: 600, color: textPrimary }}>
              {activeJob.clientName || 'Unit K3'}
            </span>
            <span>• {activeJob.unitName}</span>
            {activeJob.total > 0 && (
              <span>
                ({activeJob.loaded}/{activeJob.total} foto)
              </span>
            )}
          </div>
        )}

        {/* Progress bar utama */}
        <div
          style={{
            height: 5,
            width: '100%',
            background: darkMode ? '#334155' : '#E2E8F0',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(4, overallPercent)}%`,
              background:
                !isUploading && errorCount > 0
                  ? '#EF4444'
                  : 'linear-gradient(90deg, #10B981, #3B82F6)',
              borderRadius: 3,
              transition: 'width 0.2s ease',
            }}
          />
        </div>

        {/* Detail Drawer saat Expanded */}
        {expanded && (
          <div
            style={{
              marginTop: 4,
              paddingTop: 8,
              borderTop: `1px solid ${borderCol}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{
                maxHeight: 190,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                paddingRight: 2,
              }}
            >
              {jobs.map((job) => (
                <div
                  key={job.id}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 10,
                    background: darkMode
                      ? 'rgba(30, 41, 59, 0.75)'
                      : '#F8FAFC',
                    border: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: textPrimary,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {job.unitName} • {job.clientName}
                      </div>
                      <div style={{ fontSize: 10, color: textSecondary }}>
                        {job.status === 'uploading'
                          ? `Mengunggah ${job.loaded}/${job.total} foto (${job.percentage}%)`
                          : job.status === 'queued'
                          ? `Menunggu antrean (${job.total} foto)`
                          : job.status === 'done'
                          ? `Selesai (${job.total} foto)`
                          : job.errorMessage || 'Dibatalkan'}
                      </div>
                    </div>

                    {(job.status === 'uploading' || job.status === 'queued') && (
                      <button
                        type="button"
                        onClick={() => onCancelJob(job.id)}
                        title="Batalkan item ini"
                        style={{
                          border: 'none',
                          background: 'rgba(239, 68, 68, 0.12)',
                          color: '#EF4444',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '3px 7px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        Batal
                      </button>
                    )}

                    {job.status === 'done' && (
                      <span style={{ fontSize: 11, color: '#10B981', fontWeight: 700 }}>
                        ✓
                      </span>
                    )}
                  </div>

                  {job.status === 'uploading' && (
                    <div
                      style={{
                        height: 3,
                        width: '100%',
                        background: darkMode ? '#334155' : '#E2E8F0',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(4, job.percentage)}%`,
                          background: '#10B981',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer Aksi */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                paddingTop: 2,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  onOpenSyncHub();
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#3B82F6',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '3px 2px',
                }}
              >
                Buka Sync Hub ›
              </button>

              <div style={{ display: 'flex', gap: 6 }}>
                {errorCount > 0 && (
                  <button
                    type="button"
                    onClick={onRetryFailed}
                    style={{
                      border: 'none',
                      background: '#10B981',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '4px 9px',
                      borderRadius: 7,
                      cursor: 'pointer',
                    }}
                  >
                    Coba Lagi
                  </button>
                )}

                {activeOrQueuedCount > 1 && (
                  <button
                    type="button"
                    onClick={onCancelAll}
                    style={{
                      border: 'none',
                      background: 'rgba(239, 68, 68, 0.14)',
                      color: '#EF4444',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '4px 9px',
                      borderRadius: 7,
                      cursor: 'pointer',
                    }}
                  >
                    Batal Semua
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
