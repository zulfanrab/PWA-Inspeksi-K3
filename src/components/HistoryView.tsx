// src/components/HistoryView.tsx
import { useState, useRef, useMemo } from 'react';
import type { InspectionSession, InspectionPhoto } from '../db/db';
import { getInspectionYear, getSifatPemeriksaan, getTanggalInspeksi } from '../types';
import { exportToPDF } from '../utils/pdfExport';
import { exportToWord } from '../utils/wordExport';
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
  uploadingId,
  uploadProgress,
  currentUserEmail,
}: HistoryViewProps) {
  const [activeTab, setActiveTab] = useState<'recent' | 'byClient'>('recent');
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState<string>('Semua');
  const [filterSifat, setFilterSifat] = useState<'Semua' | 'Baru' | 'Berkala'>('Semua');

  const availableYears = useMemo(() => {
    const years = new Set(history.map((item) => getInspectionYear(item)));
    return ['Semua', ...Array.from(years).sort((a, b) => b.localeCompare(a))];
  }, [history]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return history.filter((item) => {
      const matchesSearch =
        item.clientName.toLowerCase().includes(q) ||
        item.unitData?.namaUnit?.toLowerCase().includes(q) ||
        item.objectType.toLowerCase().includes(q);

      const matchesYear =
        filterYear === 'Semua' || getInspectionYear(item) === filterYear;

      const sifat = getSifatPemeriksaan(item);
      const matchesSifat =
        filterSifat === 'Semua' || sifat === filterSifat;

      return matchesSearch && matchesYear && matchesSifat;
    });
  }, [history, searchQuery, filterYear, filterSifat]);

  const recent = useMemo(
    () => [...filtered].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).slice(0, 5),
    [filtered]
  );

  const byClient = useMemo(() => {
    const map = new Map<string, SessionWithPhotos[]>();
    for (const item of filtered) {
      const list = map.get(item.clientName) ?? [];
      list.push(item);
      map.set(item.clientName, list);
    }
    for (const [key, list] of map) {
      map.set(key, list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)));
    }
    return map;
  }, [filtered]);

  const toggleClient = (name: string) => {
    setOpenClients((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const cardProps = (item: SessionWithPhotos) => ({
    item, onEdit, onDelete,
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

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          placeholder="🔍 Cari klien, unit, atau jenis inspeksi..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter Tahun & Sifat */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Filter Tahun
          </label>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>{year === 'Semua' ? 'Semua Tahun' : year}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Filter Sifat
          </label>
          <select
            value={filterSifat}
            onChange={(e) => setFilterSifat(e.target.value as 'Semua' | 'Baru' | 'Berkala')}
            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="Semua">Semua Sifat</option>
            <option value="Baru">Baru</option>
            <option value="Berkala">Berkala</option>
          </select>
        </div>
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
          {recent.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">Tidak ada hasil untuk "{searchQuery}"</p>
          ) : (
            recent.map((item) => (
              <HistoryCard key={item.id} {...cardProps(item)} />
            ))
          )}
        </div>
      )}

      {activeTab === 'byClient' && (
        <div className="space-y-2">
          {byClient.size === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">Tidak ada hasil untuk "{searchQuery}"</p>
          ) : (
            [...byClient.entries()].map(([clientName, items]) => {
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
            })
          )}
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
  isUploading: boolean;
  progress: UploadProgress | null;
  currentUserEmail: string;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  const tanggalInspeksi = getTanggalInspeksi(item);
  const sifatPemeriksaan = getSifatPemeriksaan(item);
  const dateStr = formatDate(item.updatedAt || item.createdAt);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleDownloadPDF = async () => {
    const pdfWindow = window.open('', '_blank');
    if (pdfWindow) {
      pdfWindow.document.write('Memproses PDF Laporan Inspeksi... Mohon tunggu.');
    }

    setPdfLoading(true);
    try {
      const unitName = item.unitData?.namaUnit || 'Unit';
      const clientSlug = item.clientName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
      const dateSlug = tanggalInspeksi;
      const fileName = `Laporan_${item.objectType}_${unitName}_${clientSlug}_${dateSlug}`.replace(/\s+/g, '_');
      const pdfUrl = await exportToPDF(item, fileName);
      if (pdfWindow) {
        pdfWindow.location.href = pdfUrl;
      }
    } catch (err: any) {
      if (pdfWindow) pdfWindow.close();
      alert('Gagal export PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadWord = async () => {
    setPdfLoading(true);
    try {
      const unitName = item.unitData?.namaUnit || 'Unit';
      const clientSlug = item.clientName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
      const dateSlug = tanggalInspeksi;
      const fileName = `Laporan_${item.objectType}_${unitName}_${clientSlug}_${dateSlug}`.replace(/\s+/g, '_');
      await exportToWord(item, fileName);
    } catch (err: any) {
      alert('Gagal export Word: ' + err.message);
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
            >
              🗑️
            </button>
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
        {sifatPemeriksaan && (
          <span className={`px-2 py-0.5 border rounded-full text-[10px] font-bold ${
            sifatPemeriksaan === 'Baru'
              ? 'bg-violet-50 text-violet-600 border-violet-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          }`}>
            {sifatPemeriksaan === 'Baru' ? '🆕 Baru' : '🔄 Berkala'}
          </span>
        )}
        <span className="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-100 rounded-full text-[10px] font-bold">
          📅 {tanggalInspeksi}
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
              📷 Foto {progress.loaded} dari {progress.total}
            </p>
            <p className="text-xs font-black text-emerald-600">
              {progress.percentage}%
            </p>
          </div>
          <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
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
          {isUploading ? (
            <>
              <Spinner />
              Uploading...
            </>
          ) : (
            <>✏️ Edit</>
          )}
        </button>

        <button
          onClick={() => setShowGallery(true)}
          disabled={isUploading || item.photos.length === 0}
          className="py-2.5 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all"
        >
          📸 Galeri
        </button>

        <div className="relative">
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={pdfLoading || isUploading}
            className="w-full py-2.5 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all"
          >
            {pdfLoading ? (
              <>
                <Spinner />
                Export...
              </>
            ) : (
              <>📤 Export ▾</>
            )}
          </button>
          {showExportMenu && (
            <div className="absolute bottom-full mb-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10 min-w-[120px]">
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  handleDownloadPDF();
                }}
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                📄 PDF
              </button>
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  handleDownloadWord();
                }}
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                📝 Word
              </button>
            </div>
          )}
        </div>
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
// LIGHTBOX VIEWER — smooth zoom + mobile swipe/pinch + share + download
// ==========================================

function LightboxViewer({
  photo,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  unitName,
}: {
  photo: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  unitName?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const lastOffset = useRef({ x: 0, y: 0 });

  // Pinch zoom refs
  const lastDist = useRef<number | null>(null);
  const lastScale = useRef(1);

  const resetView = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  const goToPrev = () => { resetView(); onPrev(); };
  const goToNext = () => { resetView(); onNext(); };

  // ─── DESKTOP EVENTS ───
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.5, Math.min(3, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
  };

  const handleDoubleClick = () => {
    zoom === 1 ? setZoom(2.5) : resetView();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && index > 0) goToPrev();
    if (e.key === 'ArrowRight' && index < total - 1) goToNext();
    if (e.key === 'Escape') onClose();
  };

  // ─── MOBILE TOUCH EVENTS (Swipe & Pinch) ───
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastOffset.current = offset;
      setDragging(true);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
      lastScale.current = zoom;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(0.5, Math.min(4, lastScale.current * (dist / lastDist.current)));
      setZoom(newScale);
    } else if (e.touches.length === 1 && dragStart.current) {
      if (zoom > 1) {
        setOffset({
          x: lastOffset.current.x + (e.touches[0].clientX - dragStart.current.x),
          y: lastOffset.current.y + (e.touches[0].clientY - dragStart.current.y),
        });
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    setDragging(false);
    lastDist.current = null;

    if (zoom <= 1 && dragStart.current && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - dragStart.current.x;
      if (Math.abs(dx) > 50) {
        if (dx < 0 && index < total - 1) goToNext();
        if (dx > 0 && index > 0) goToPrev();
      }
    }

    if (e.touches.length === 0) {
      dragStart.current = null;
    }
  };

  // ─── SHARE & DOWNLOAD LOGIC ───
  const handleDownload = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const a = document.createElement('a');
    a.href = photo;
    a.download = `${unitName?.replace(/\s+/g, '_') || 'Foto'}_${String(index + 1).padStart(2, '0')}.jpg`;
    a.click();
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const blob = await (await fetch(photo)).blob();
      const filename = `${unitName?.replace(/\s+/g, '_') || 'Foto'}_${String(index + 1).padStart(2, '0')}.jpg`;
      const file = new File([blob], filename, { type: 'image/jpeg' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ 
          files: [file], 
          title: 'Aksara Inspect Photo',
          text: `Dokumentasi: ${unitName || 'Unit'}`
        });
      } else {
        // Fallback kalau browser gak support share API
        handleDownload();
      }
    } catch (err) { 
      // user cancelled atau error
    }
  };

  return (
    <div
      className="absolute inset-0 z-10 bg-black/95 flex flex-col items-center justify-center outline-none"
      onClick={onClose}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Area Foto dengan touchAction: 'none' */}
      <div 
        className="flex-1 flex items-center justify-center w-full relative overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <img
          src={photo}
          alt={`Foto ${index + 1}`}
          className="rounded shadow-2xl"
          style={{
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: dragging ? 'none' : 'transform 0.2s ease-out',
            maxWidth: '90vw',
            maxHeight: '70vh',
            objectFit: 'contain',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          draggable={false}
          onDoubleClick={handleDoubleClick}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        
        {/* Panah Hint */}
        {index > 0 && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center pointer-events-none opacity-40">
            ‹
          </div>
        )}
        {index < total - 1 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center pointer-events-none opacity-40">
            ›
          </div>
        )}
      </div>

      {/* Controls bottom */}
      <div className="flex items-center justify-center gap-2 mt-3 pb-6 flex-wrap px-2" onClick={(e) => e.stopPropagation()}>
        {/* Zoom controls */}
        <button
          onClick={() => setZoom((prev) => Math.max(0.5, prev - 0.2))}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded-lg transition-all"
        >
          🔍−
        </button>

        <span className="text-white text-xs font-bold min-w-[45px] text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={() => setZoom((prev) => Math.min(4, prev + 0.2))}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded-lg transition-all"
        >
          🔍+
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1"></div>

        {/* Navigation */}
        <button
          onClick={goToPrev}
          disabled={index === 0}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white text-xs font-bold rounded-lg transition-all"
        >
          ← Prev
        </button>

        <span className="text-white text-xs font-bold min-w-[50px] text-center bg-gray-800 py-2 rounded-lg">
          {index + 1} / {total}
        </span>

        <button
          onClick={goToNext}
          disabled={index === total - 1}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white text-xs font-bold rounded-lg transition-all"
        >
          Next →
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1"></div>

        {/* Share & Download & Close */}
        <button
          onClick={handleShare}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all"
          title="Bagikan foto ini"
        >
          ⬆️ Share
        </button>

        <button
          onClick={handleDownload}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all"
          title="Download foto ini"
        >
          ⬇️
        </button>

        <button
          onClick={onClose}
          className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-all"
        >
          ✕
        </button>
      </div>
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
    setSelected((prev) => {
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
      await new Promise((r) => setTimeout(r, 300));
      downloadPhoto(src, idx);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-900 flex-shrink-0"
        style={{ minHeight: 56 }}
      >
        <div>
          <p className="text-white text-sm font-bold">📸 {unitName}</p>
          <p className="text-gray-400 text-[10px]">{photos.length} foto</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <button
                onClick={downloadSelected}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all"
              >
                ⬇️ Download {selected.size}
              </button>
              <button
                onClick={clearSelect}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold rounded-lg transition-all"
              >
                Batal
              </button>
            </>
          ) : (
            <button
              onClick={selectAll}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold rounded-lg transition-all"
            >
              Pilih semua
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-all"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Grid foto */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {photos.map((photo, idx) => {
            const src = getSrc(photo);
            if (!src) return null;
            const isSelected = selected.has(idx);
            return (
              <div
                key={idx}
                className="relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer group"
                style={{
                  aspectRatio: '1',
                  borderColor: isSelected ? '#10B981' : 'transparent',
                }}
              >
                <img
                  src={src}
                  alt={`Foto ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:brightness-75 transition-all"
                  onClick={() => setLightbox(idx)}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />

                {/* Checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(idx);
                  }}
                  className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold transition-all"
                  style={{
                    background: isSelected ? '#10B981' : 'rgba(0,0,0,0.4)',
                  }}
                >
                  {isSelected ? '✓' : ''}
                </button>

                {/* Download single */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadPhoto(src, idx);
                  }}
                  className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/50 hover:bg-emerald-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-all"
                >
                  ⬇️
                </button>

                {/* Nomor foto */}
                <span className="absolute bottom-1.5 left-1.5 text-[9px] text-white font-bold bg-black/40 px-1 rounded">
                  {String(idx + 1).padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightbox overlay */}
      {lightbox !== null && (
        <LightboxViewer
          photo={getSrc(photos[lightbox]) || ''}
          index={lightbox}
          total={photos.length}
          unitName={unitName}
          onPrev={() => setLightbox((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => setLightbox((i) => (i !== null && i < photos.length - 1 ? i + 1 : i))}
          onClose={() => setLightbox(null)}
        />
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
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}