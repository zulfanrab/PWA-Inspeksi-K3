// src/components/HistoryView.tsx
// Komponen untuk menampilkan riwayat inspeksi yang sudah di-sync

import type { InspectionSession, InspectionPhoto } from '../db/db';

type SessionWithPhotos = InspectionSession & { photos: InspectionPhoto[] };

const OBJECT_TYPES = [
  { key: 'Angkur',             label: 'Angkur',             desc: 'Safety Anchor',                icon: '⚓' },
  { key: 'PAA',                label: 'PAA',                desc: 'Pesawat Angkat & Angkut',      icon: '🏗️' },
  { key: 'PUBT',               label: 'PUBT',               desc: 'Pesawat Uap & Bejana Tekan',   icon: '🔥' },
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

interface HistoryViewProps {
  history: SessionWithPhotos[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function HistoryView({ history, onEdit, onDelete }: HistoryViewProps) {
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
}: {
  item: SessionWithPhotos;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  const dateStr = formatDate(item.updatedAt || item.createdAt);

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
          <button
            onClick={() => onEdit(item.id)}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center border border-blue-100 transition-all text-sm"
            title="Edit"
          >✏️</button>
          <button
            onClick={() => onDelete(item.id)}
            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm"
            title="Hapus"
          >🗑️</button>
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
    </div>
  );
}
