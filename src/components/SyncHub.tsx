// src/components/SyncHub.tsx
// FIXED: Pecahan dari App.tsx + progress indicator per foto saat upload ke Drive

import type { InspectionSession, InspectionPhoto } from '../db/db';
import type { UploadProgress } from '../services/driveService';

type SessionWithPhotos = InspectionSession & { photos: InspectionPhoto[] };

interface SyncHubProps {
  drafts: SessionWithPhotos[];
  isAuthenticated: boolean;
  uploadingId: string | null;
  uploadProgress: UploadProgress | null;
  onLogin: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSync: (id: string) => void;
}

const OBJECT_TYPES = [
  { key: 'Angkur',             label: 'Angkur',             desc: 'Safety Anchor',                icon: '⚓' },
  { key: 'PAA',                label: 'PAA',                desc: 'Pesawat Angkat & Angkut',      icon: '🏗️' },
  { key: 'PUBT',               label: 'PUBT',               desc: 'Pesawat Uap & Bejana Tekan',   icon: '⚗️' },
  { key: 'PTP',                label: 'PTP',                desc: 'Pesawat Tenaga & Produksi',    icon: '⚙️' },
  { key: 'Listrik',            label: 'Listrik',            desc: 'Instalasi Listrik',            icon: '⚡' },
  { key: 'Penyalur Petir',     label: 'Penyalur Petir',     desc: 'Instalasi Penyalur Petir',     icon: '🌩️' },
  { key: 'Lift',               label: 'Lift / Eskalator',   desc: 'Elevator & Eskalator',         icon: '🛗' },
  { key: 'Proteksi Kebakaran', label: 'Proteksi Kebakaran', desc: 'Instalasi Proteksi Kebakaran', icon: '🧯' },
];

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ==========================================
// SYNC HUB VIEW
// ==========================================

export function SyncHub({
  drafts,
  isAuthenticated,
  uploadingId,
  uploadProgress,
  onLogin,
  onEdit,
  onDelete,
  onSync,
}: SyncHubProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-black text-gray-900">☁️ Sync Hub</h2>
        <p className="text-xs text-gray-400 font-medium mt-0.5">
          Upload draft ke Google Drive perusahaan
        </p>
      </div>

      {/* Banner login kalau belum auth */}
      {!isAuthenticated && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-bold text-amber-700">Perlu Login Google Drive</p>
            <button
              onClick={onLogin}
              className="text-xs text-amber-600 underline mt-0.5 font-medium hover:text-amber-800"
            >
              Login sekarang →
            </button>
          </div>
        </div>
      )}

      {/* FIXED: Progress bar upload aktif */}
      {uploadingId && uploadProgress && (
        <UploadProgressBar progress={uploadProgress} />
      )}

      {drafts.length === 0 ? (
        <EmptyState icon="✅" title="Semua data sudah tersinkronisasi" subtitle="Tidak ada draft yang tertunda" />
      ) : (
        <div className="space-y-3">
          {drafts.map((item) => (
            <SyncCard
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
              onSync={onSync}
              isUploading={uploadingId === item.id}
              isAuthenticated={isAuthenticated}
              progress={uploadingId === item.id ? uploadProgress : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// UPLOAD PROGRESS BAR
// ==========================================

// FIXED: Progress indicator per foto — tampil saat upload berlangsung
function UploadProgressBar({ progress }: { progress: UploadProgress }) {
  const pct = Math.round((progress.current / progress.total) * 100);
  const phaseLabel: Record<UploadProgress['phase'], string> = {
    folder: '📁 Menyiapkan folder...',
    data: '📄 Mengupload data inspeksi...',
    photo: `📷 Mengupload ${progress.fileName}`,
  };

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-emerald-700">{phaseLabel[progress.phase]}</p>
        <p className="text-xs font-black text-emerald-600">{pct}%</p>
      </div>
      <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-emerald-500 font-medium">
        {progress.current} / {progress.total} langkah
      </p>
    </div>
  );
}

// ==========================================
// SYNC CARD
// ==========================================

function SyncCard({
  item,
  onEdit,
  onDelete,
  onSync,
  isUploading,
  isAuthenticated,
  progress,
}: {
  item: SessionWithPhotos;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSync: (id: string) => void;
  isUploading: boolean;
  isAuthenticated: boolean;
  progress: UploadProgress | null;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  const dateStr = formatDate(item.updatedAt || item.createdAt);

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 space-y-3">
      {/* Header card */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">{meta?.icon || '📋'}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {item.unitData?.namaUnit || 'Unit Tanpa Nama'}
            </p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{item.clientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(item.id)}
            disabled={isUploading}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center border border-blue-100 transition-all text-sm disabled:opacity-40"
            title="Edit"
          >✏️</button>
          <button
            onClick={() => onDelete(item.id)}
            disabled={isUploading}
            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm disabled:opacity-40"
            title="Hapus"
          >🗑️</button>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-bold">
          {meta?.label}
        </span>
        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
          📷 {item.photos.length} foto
        </span>
        <span className="text-[10px] font-medium text-gray-400">{dateStr}</span>
      </div>

      {/* Drive path preview */}
      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        <p className="text-[9px] text-gray-400 font-mono leading-relaxed break-all">
          Drive/ {item.clientName} / {new Date(item.createdAt).toISOString().slice(0, 10)} / {item.objectType} / {item.unitData?.namaUnit || 'Unit'} - {item.unitData?.nomorSeri || 'NoSeri'}
        </p>
      </div>

      {/* FIXED: Progress inline per card kalau sedang upload card ini */}
      {isUploading && progress && (
        <UploadProgressBar progress={progress} />
      )}

      {/* Upload button */}
      <button
        onClick={() => onSync(item.id)}
        disabled={isUploading || !isAuthenticated}
        className="w-full py-2.5 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
      >
        {isUploading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sedang Upload ke Drive...
          </>
        ) : (
          <>☁️ Upload ke Google Drive</>
        )}
      </button>
    </div>
  );
}

// ==========================================
// EMPTY STATE (shared)
// ==========================================

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-3 opacity-60">{icon}</div>
      <p className="text-sm font-bold text-gray-500">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}