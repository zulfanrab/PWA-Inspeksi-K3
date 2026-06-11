// src/components/HistoryView.tsx
// FIXED: Ganti tombol Upload Ulang → Edit & Update (langsung ke form edit)
// FIXED: Tombol Download PDF tetap ada
// NEW: Tombol Sync diganti jadi Photo Gallery dengan select multi + download

import { useState, useMemo } from 'react';
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
  onReSync: (id: string) => void;
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
  onReSync,
  uploadingId,
  uploadProgress,
  currentUserEmail,
}: HistoryViewProps) {
  const [activeTab, setActiveTab] = useState<'recent' | 'byClient'>('recent');
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());

  const recent = useMemo(
    () => [...history].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).slice(0, 5),
    [history]
  );

  const byClient = useMemo(() => {
    const map = new Map<string, SessionWithPhotos[]>();
    for (const item of history) {
      const list = map.get(item.clientName) ?? [];
      list.push(item);
      map.set(item.clientName, list);
    }
    for (const [key, list] of map) {
      map.set(key, list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)));
    }
    return map;
  }, [history]);

  const toggleClient = (name: string) => {
    setOpenClients((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const cardProps = (item: SessionWithPhotos) => ({
    item, onEdit, onDelete, onReSync,
    isUploading: uploadingId === item.id,
    progress: uploadingId === item.id ? uploadProgress : null,
    currentUserEmail,
  });

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-3 opacity-60">📋</div>
        <p className="text-sm font-bold text-gray-500">Belum ada riwayat</p>
        <p className="text-xs text-gray-400 mt-1">Data yang sudah di-sync ke Drive akan muncul di sini</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-black text-gray-900">📋 Riwayat Inspeksi</h2>
        <p className="text-xs text-gray-400 font-medium mt-0.5">
          Data yang sudah tersinkronisasi ke Google Drive
        </p>
      </div>

      {/* Tab */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('recent')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'recent'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          🕐 Terbaru
        </button>
        <button
          onClick={() => setActiveTab('byClient')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'byClient'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          🏢 Per Perusahaan
        </button>
      </div>

      {activeTab === 'recent' && (
        <div className="space-y-3">
          {recent.map((item) => (
            <HistoryCard key={item.id} {...cardProps(item)} />
          ))}
        </div>
      )}

      {activeTab === 'byClient' && (
        <div className="space-y-2">
          {[...byClient.entries()].map(([clientName, items]) => {
            const isOpen = openClients.has(clientName);
            return (
              <div key={clientName} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleClient(clientName)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{clientName}</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">
                      {items.length} inspeksi
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="p-3 space-y-3 bg-white">
                    {items.map((item) => (
                      <HistoryCard key={item.id} {...cardProps(item)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// HISTORY CARD
// ==========================================

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
  onReSync: (id: string) => void;
  isUploading: boolean;
  progress: UploadProgress | null;
  currentUserEmail: string;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  const dateStr = formatDate(item.updatedAt || item.createdAt);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

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

        {/* Preview foto — maks 3 thumbnail */}
        {item.photos.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {item.photos.slice(0, 3).map((photo: any, idx: number) => {
              const src = photo.dataUrl && photo.dataUrl.startsWith('data:image')
                ? photo.dataUrl
                : photo.driveFileId
                  ? `/api/photo-proxy?fileId=${photo.driveFileId}`
                  : null;
              if (!src) return null;
              return (
                <img
                  key={idx}
                  src={src}
                  alt={`Foto ${idx + 1}`}
                  className="w-14 h-14 object-cover rounded border border-gray-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              );
            })}
            {item.photos.length > 3 && (
              <div className="w-14 h-14 flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-400 text-[10px] font-bold">
                +{item.photos.length - 3}
              </div>
            )}
          </div>
        )}

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

      {/* Progress bar */}
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

      {/* Tombol bawah */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onEdit(item.id)}
          disabled={isUploading}
          className="py-2.5 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all"
        >
          {isUploading ? <><Spinner />Uploading...</> : <>✏️ Edit</>}
        </button>

        <button
          onClick={() => setShowGallery(true)}
          disabled={isUploading || item.photos.length === 0}
          className="py-2.5 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all"
        >
          🖼️ Galeri
        </button>

        <button
          onClick={handleDownloadPDF}
          disabled={pdfLoading || isUploading}
          className="py-2.5 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all"
        >
          {pdfLoading ? <><Spinner />PDF...</> : <>📄 PDF</>}
        </button>
      </div>

      {showGallery && (
        <PhotoGalleryModal
          photos={item.photos}
          unitName={item.unitData?.namaUnit || 'Unit'}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
}

// ==========================================
// PHOTO GALLERY MODAL
// ==========================================

function PhotoGalleryModal({
  photos,
  unitName,
  onClose,
}: {
  photos: any[];
  unitName: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<number | null>(null);

  const getSrc = (photo: any): string | null => {
    if (photo.dataUrl?.startsWith('data:image')) return photo.dataUrl;
    if (photo.driveFileId) return `/api/photo-proxy?fileId=${photo.driveFileId}`;
    return null;
  };

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(photos.map((_, i) => i)));
  const clearSelect = () => setSelected(new Set());

  const downloadPhoto = (src: string, idx: number) => {
    const a = document.createElement('a');
    a.href = src;
    a.download = `${unitName}_foto_${String(idx + 1).padStart(2, '0')}.jpg`;
    a.click();
  };

  const downloadSelected = async () => {
    for (const idx of Array.from(selected)) {
      const src = getSrc(photos[idx]);
      if (!src) continue;
      await new Promise(r => setTimeout(r, 300));
      downloadPhoto(src, idx);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 flex-shrink-0">
        <div>
          <p className="text-white text-sm font-bold">🖼️ {unitName}</p>
          <p className="text-gray-400 text-[10px]">{photos.length} foto</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <button
                onClick={downloadSelected}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg"
              >
                ⬇️ Download {selected.size} foto
              </button>
              <button
                onClick={clearSelect}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold rounded-lg"
              >
                Batal
              </button>
            </>
          ) : (
            <button
              onClick={selectAll}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold rounded-lg"
            >
              Pilih semua
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-bold"
          >✕</button>
        </div>
      </div>

      {/* Grid foto */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, idx) => {
            const src = getSrc(photo);
            if (!src) return null;
            const isSelected = selected.has(idx);
            return (
              <div
                key={idx}
                className="relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer"
                style={{
                  aspectRatio: '1',
                  borderColor: isSelected ? '#10B981' : 'transparent',
                }}
              >
                <img
                  src={src}
                  alt={`Foto ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onClick={() => setLightbox(idx)}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                {/* Checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(idx); }}
                  className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold"
                  style={{ background: isSelected ? '#10B981' : 'rgba(0,0,0,0.4)' }}
                >
                  {isSelected ? '✓' : ''}
                </button>
                {/* Download single */}
                <button
                  onClick={(e) => { e.stopPropagation(); downloadPhoto(src, idx); }}
                  className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/50 hover:bg-black/80 text-white flex items-center justify-center text-[10px]"
                >⬇️</button>
                <span className="absolute bottom-1.5 left-1.5 text-[9px] text-white font-bold bg-black/40 px-1 rounded">
                  {String(idx + 1).padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="absolute inset-0 z-10 bg-black/95 flex flex-col items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <img
            src={getSrc(photos[lightbox]) || ''}
            alt={`Foto ${lightbox + 1}`}
            className="max-w-full max-h-[80vh] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(i => (i !== null && i > 0 ? i - 1 : i));
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-lg"
            >← Prev</button>
            <span className="text-white text-xs font-bold">{lightbox + 1} / {photos.length}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(i => (i !== null && i < photos.length - 1 ? i + 1 : i));
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-lg"
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// SPINNER
// ==========================================

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}