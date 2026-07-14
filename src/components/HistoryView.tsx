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
// LIGHTBOX VIEWER — Modern floating toolbar + thumbnail strip
// ==========================================

function LightboxViewer({
  photo,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  unitName,
  allPhotos,
  getSrc,
  onGoTo,
}: {
  photo: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  unitName?: string;
  allPhotos?: any[];
  getSrc?: (photo: any) => string | null;
  onGoTo?: (idx: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const lastOffset = useRef({ x: 0, y: 0 });
  const lastDist = useRef<number | null>(null);
  const lastScale = useRef(1);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  const resetView = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const goToPrev = () => { resetView(); onPrev(); };
  const goToNext = () => { resetView(); onNext(); };
  const handleGoTo = (idx: number) => { resetView(); onGoTo?.(idx); };

  // Scroll thumbnail ke posisi aktif
  useState(() => {
    setTimeout(() => {
      const strip = thumbStripRef.current;
      if (!strip) return;
      const active = strip.querySelector('[data-active="true"]') as HTMLElement;
      if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, 100);
  });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.5, Math.min(5, prev + (e.deltaY > 0 ? -0.15 : 0.15))));
  };

  const handleDoubleClick = () => { zoom === 1 ? setZoom(2.5) : resetView(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && index > 0) goToPrev();
    if (e.key === 'ArrowRight' && index < total - 1) goToNext();
    if (e.key === 'Escape') onClose();
  };

  // ─── Touch events ───
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
      setZoom(Math.max(0.5, Math.min(5, lastScale.current * (dist / lastDist.current))));
    } else if (e.touches.length === 1 && dragStart.current && zoom > 1) {
      setOffset({
        x: lastOffset.current.x + (e.touches[0].clientX - dragStart.current.x),
        y: lastOffset.current.y + (e.touches[0].clientY - dragStart.current.y),
      });
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
    if (e.touches.length === 0) dragStart.current = null;
  };

  // ─── Mouse events ───
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastOffset.current = offset;
    setDragging(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    if (zoom > 1) {
      setOffset({
        x: lastOffset.current.x + (e.clientX - dragStart.current.x),
        y: lastOffset.current.y + (e.clientY - dragStart.current.y),
      });
    }
  };

  const onMouseUpOrLeave = (e: React.MouseEvent) => {
    if (!dragging) return;
    setDragging(false);
    if (zoom <= 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      if (Math.abs(dx) > 50) {
        if (dx < 0 && index < total - 1) goToNext();
        if (dx > 0 && index > 0) goToPrev();
      }
    }
    dragStart.current = null;
  };

  // ─── Share & Download ───
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
        await navigator.share({ files: [file], title: 'Aksara Inspect Photo', text: `Dokumentasi: ${unitName || 'Unit'}` });
      } else {
        handleDownload();
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center outline-none"
      style={{ background: 'rgba(0,0,0,0.96)' }}
      onClick={onClose}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Close button - top right */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full flex items-center justify-center transition-all"
        style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      {/* Counter - top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full text-white text-xs font-bold"
        style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        {index + 1} / {total}
      </div>

      {/* Photo area */}
      <div
        className="flex-1 flex items-center justify-center w-full relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUpOrLeave} onMouseLeave={onMouseUpOrLeave}
        style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <img
          src={photo}
          alt={`Foto ${index + 1}`}
          className="pointer-events-none select-none"
          style={{
            transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            transition: dragging ? 'none' : 'transform 0.2s ease-out',
            maxWidth: '92vw', maxHeight: '72vh', objectFit: 'contain',
            borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}
          draggable={false}
          onDoubleClick={handleDoubleClick}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        {/* Nav arrows - clickable */}
        {index > 0 && (
          <button onClick={(e) => { e.stopPropagation(); goToPrev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        {index < total - 1 && (
          <button onClick={(e) => { e.stopPropagation(); goToNext(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}

        {/* Zoom hint */}
        {zoom > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] text-gray-400 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
            {Math.round(zoom * 100)}% · Double-tap reset
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {allPhotos && getSrc && allPhotos.length > 1 && (
        <div ref={thumbStripRef} className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          style={{ scrollbarWidth: 'none', background: 'rgba(0,0,0,0.6)' }}>
          {allPhotos.map((p: any, i: number) => {
            const src = getSrc(p);
            if (!src) return null;
            return (
              <img key={i} src={src} data-active={i === index ? 'true' : 'false'}
                onClick={() => handleGoTo(i)}
                className="flex-shrink-0 rounded cursor-pointer transition-all"
                style={{
                  width: 48, height: 48, objectFit: 'cover',
                  border: i === index ? '2px solid #10B981' : '2px solid transparent',
                  opacity: i === index ? 1 : 0.5,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Floating toolbar - bottom */}
      <div className="flex items-center gap-2 px-4 py-3 mb-4 mx-3 rounded-2xl flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(30,30,30,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>

        <button onClick={() => setZoom((p) => Math.max(0.5, p - 0.2))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/10 transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <span className="text-white text-[11px] font-bold min-w-[38px] text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((p) => Math.min(5, p + 0.2))}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/10 transition-all">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>
        </button>

        <div className="w-px h-5 bg-white/10 mx-1"></div>

        <button onClick={handleShare}
          className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-white text-[11px] font-bold hover:bg-white/10 transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share
        </button>
        <button onClick={handleDownload}
          className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/15 transition-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
      </div>
    </div>
  );
}

// ==========================================
// PHOTO GALLERY MODAL — Modern + Drag + ZIP
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
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

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

  // ─── Drag-to-export handler ───
  const handleDragStart = (e: React.DragEvent, src: string, idx: number) => {
    const filename = `${unitName.replace(/\s+/g, '_')}_foto_${String(idx + 1).padStart(2, '0')}.jpg`;

    // Set download URL for drag-to-desktop/Word
    e.dataTransfer.setData('DownloadURL', `image/jpeg:${filename}:${src}`);
    e.dataTransfer.setData('text/uri-list', src);
    e.dataTransfer.setData('text/plain', src);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ─── ZIP download ───
  const downloadAsZip = async (indices: number[]) => {
    if (indices.length === 0) return;
    setZipping(true);
    setZipProgress(0);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const src = getSrc(photos[idx]);
        if (!src) continue;

        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const filename = `${unitName.replace(/\s+/g, '_')}_foto_${String(idx + 1).padStart(2, '0')}.${ext}`;
          zip.file(filename, blob);
        } catch {
          // Skip foto yang gagal di-fetch
        }

        setZipProgress(Math.round(((i + 1) / indices.length) * 100));
      }

      const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const timestamp = new Date().toISOString().slice(0, 10);
      const zipFilename = `${unitName.replace(/\s+/g, '_')}_photos_${timestamp}.zip`;

      // Trigger download
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFilename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP creation failed:', err);
      alert('Gagal membuat file ZIP. Silakan coba lagi.');
    } finally {
      setZipping(false);
      setZipProgress(0);
    }
  };

  const downloadSelected = () => downloadAsZip(Array.from(selected));
  const downloadAll = () => downloadAsZip(photos.map((_, i) => i));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(8px)', paddingTop: 'env(safe-area-inset-top)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: 'rgba(20,20,30,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-bold">{unitName}</p>
            <p className="text-gray-500 text-[10px] font-medium">{photos.length} foto dokumentasi</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-400"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                {selected.size} dipilih
              </span>
              <button onClick={downloadSelected} disabled={zipping}
                className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-white text-[11px] font-bold transition-all disabled:opacity-50"
                style={{ background: 'rgba(16,185,129,0.8)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                ZIP
              </button>
              <button onClick={clearSelect}
                className="h-8 px-3 rounded-lg text-gray-400 text-[11px] font-bold hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                Batal
              </button>
            </>
          ) : (
            <>
              <button onClick={selectAll}
                className="h-8 px-3 rounded-lg text-gray-400 text-[11px] font-bold hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                Pilih
              </button>
              <button onClick={downloadAll} disabled={zipping}
                className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold transition-all hover:text-emerald-300 disabled:opacity-50"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Semua .zip
              </button>
            </>
          )}
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ZIP progress bar */}
      {zipping && (
        <div className="px-4 py-2 flex-shrink-0" style={{ background: 'rgba(16,185,129,0.08)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-emerald-400 text-[11px] font-bold">📦 Mengemas ZIP...</span>
            <span className="text-emerald-300 text-[11px] font-black">{zipProgress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${zipProgress}%`, background: '#10B981' }} />
          </div>
        </div>
      )}

      {/* ─── Photo Grid ─── */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {photos.map((photo, idx) => {
            const src = getSrc(photo);
            if (!src) return null;
            const isSelected = selected.has(idx);
            return (
              <div
                key={idx}
                className="relative rounded-xl overflow-hidden cursor-pointer group"
                style={{
                  aspectRatio: '1',
                  border: isSelected ? '2px solid #10B981' : '2px solid rgba(255,255,255,0.06)',
                  transition: 'all 0.2s ease',
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, src, idx)}
              >
                <img
                  src={src}
                  alt={`Foto ${idx + 1}`}
                  className="w-full h-full object-cover transition-all duration-200"
                  style={{ transform: 'scale(1)', transition: 'transform 0.25s ease' }}
                  onMouseEnter={(e) => { (e.target as HTMLImageElement).style.transform = 'scale(1.08)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
                  onClick={() => setLightbox(idx)}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />

                {/* Hover overlay gradient */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)' }} />

                {/* Checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(idx); }}
                  className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                  style={{
                    background: isSelected ? '#10B981' : 'rgba(0,0,0,0.45)',
                    border: '2px solid rgba(255,255,255,0.7)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>

                {/* Drag hint - desktop only */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                  <div className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                    📎 Drag
                  </div>
                </div>

                {/* Number badge */}
                <span className="absolute bottom-2 left-2 text-[9px] text-white font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>

                {/* Download single on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const a = document.createElement('a');
                    a.href = src; a.download = `${unitName}_foto_${String(idx + 1).padStart(2, '0')}.jpg`;
                    a.click();
                  }}
                  className="absolute bottom-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                  style={{ background: 'rgba(16,185,129,0.8)', backdropFilter: 'blur(4px)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Lightbox overlay ─── */}
      {lightbox !== null && (
        <LightboxViewer
          photo={getSrc(photos[lightbox]) || ''}
          index={lightbox}
          total={photos.length}
          unitName={unitName}
          allPhotos={photos}
          getSrc={getSrc}
          onGoTo={(idx) => setLightbox(idx)}
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