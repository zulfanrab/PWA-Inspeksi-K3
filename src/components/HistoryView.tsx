// src/components/HistoryView.tsx
// FIXED: Ganti tombol Upload Ulang → Edit & Update (langsung ke form edit)
// FIXED: Tombol Download PDF tetap ada

import { useState } from 'react';
import type { InspectionSession, InspectionPhoto } from '../db/db';
import { exportToPDF } from '../utils/pdfExport';
import type { UploadProgress } from '../services/driveService';

type SessionWithPhotos = InspectionSession & { photos: InspectionPhoto[] };

const OBJECT_TYPES = [
  { key: 'Angkur',             label: 'Angkur',             icon: '⚓' },
  { key: 'PAA',                label: 'PAA',                icon: '🏗️' },
  { key: 'PUBT',               label: 'PUBT',               icon: '🔥' },
  { key: 'PTP',                label: 'PTP',                icon: '⚙️' },
  { key: 'Listrik',            label: 'Listrik',            icon: '⚡' },
  { key: 'Penyalur Petir',     label: 'Penyalur Petir',     icon: '🌩️' },
  { key: 'Lift',               label: 'Lift / Eskalator',   icon: '🛗' },
  { key: 'Proteksi Kebakaran', label: 'Proteksi Kebakaran', icon: '🧯' },
];

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface HistoryViewProps {
  history: SessionWithPhotos[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onReSync: (id: string) => void;        // tetap ada agar App.tsx tidak error
  isAuthenticated: boolean;
  isOnline: boolean;
  uploadingId: string | null;
  uploadProgress: UploadProgress | null;
  currentUserEmail: string;
}

export function HistoryView({
  history,
  onEdit,
  onDelete,
  uploadingId,
  uploadProgress,
  currentUserEmail,
}: HistoryViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-black text-gray-900">📋 Riwayat Inspeksi</h2>
        <p className="text-xs text-gray-400 font-medium mt-0.5">
          Data yang sudah tersinkronisasi ke Google Drive
        </p>
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-3 opacity-60">📋</div>
          <p className="text-sm font-bold text-gray-500">Belum ada riwayat</p>
          <p className="text-xs text-gray-400 mt-1">Data yang sudah di-sync ke Drive akan muncul di sini</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
              isUploading={uploadingId === item.id}
              progress={uploadingId === item.id ? uploadProgress : null}
              currentUserEmail={currentUserEmail} // TAMBAHKAN INI
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({
  item,
  onEdit,
  onDelete,
  isUploading,
  progress,
  currentUserEmail,
}: {
  item: SessionWithPhotos;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isUploading: boolean;
  progress: UploadProgress | null;
  currentUserEmail: string;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  const dateStr = formatDate(item.updatedAt || item.createdAt);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const unitName = item.unitData?.namaUnit || 'Unit';
      const clientSlug = item.clientName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
      const dateSlug = new Date(item.createdAt).toISOString().slice(0, 10);
      const fileName = `Laporan_${item.objectType}_${unitName}_${clientSlug}_${dateSlug}`.replace(/\s+/g, '_');
      await exportToPDF(item, fileName);
    } catch (err: any) {
      alert('Gagal export PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 space-y-3">
      {/* Header card */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">{meta?.icon || '📦'}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {item.unitData?.namaUnit || 'Unit Tanpa Nama'}
            </p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{item.clientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {currentUserEmail === 'zulfanrafly03@gmail.com' && (
            <button
              onClick={() => onDelete(item.id)}
              disabled={isUploading}
              className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm disabled:opacity-40"
              title="Hapus"
            >🗑️</button>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-bold">
          {meta?.label}
        </span>
        <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-100 rounded-full text-[10px] font-bold">
          ✅ Synced
        </span>
        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
          📷 {item.photos.length} foto
        </span>
        {item.inspectorEmail && (
          <span className="px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-100 rounded-full text-[10px] font-bold truncate max-w-[140px]">
            👷 {item.inspectorEmail}
          </span>
        )}
        <span className="text-[10px] font-medium text-gray-400">{dateStr}</span>
      </div>

      {/* Preview data unit */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 space-y-1">
        {item.unitData?.nomorSeri && (
          <p className="text-[10px] text-gray-500">
            <span className="font-bold">S/N:</span> {item.unitData.nomorSeri}
          </p>
        )}
        {item.unitData?.lokasiUnit && (
          <p className="text-[10px] text-gray-500">
            <span className="font-bold">Lokasi:</span> {item.unitData.lokasiUnit}
          </p>
        )}
        {item.unitData?.catatan && (
          <p className="text-[10px] text-gray-500 truncate">
            <span className="font-bold">Catatan:</span> {item.unitData.catatan}
          </p>
        )}
      </div>

      {/* Progress bar kalau sedang upload */}
      {isUploading && progress && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-emerald-700">
              {progress.phase === 'folder' && '📁 Menyiapkan...'}
              {progress.phase === 'data' && '📄 Upload data...'}
              {progress.phase === 'photo' && `📷 ${progress.fileName}`}
            </p>
            <p className="text-xs font-black text-emerald-600">
              {Math.round((progress.current / progress.total) * 100)}%
            </p>
          </div>
          <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Tombol bawah: Edit & Update + Download PDF */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onEdit(item.id)}
          disabled={isUploading}
          className="py-2.5 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all"
          title="Edit data & foto — otomatis terupload setelah simpan"
        >
          {isUploading ? <><Spinner />Uploading...</> : <>✏️ Edit & Update</>}
        </button>

        <button
          onClick={handleDownloadPDF}
          disabled={pdfLoading}
          className="py-2.5 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all"
          title="Download laporan sebagai PDF"
        >
          {pdfLoading ? <><Spinner />PDF...</> : <>📄 Download PDF</>}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}