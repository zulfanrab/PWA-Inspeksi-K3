// src/components/report/DocumentationPhotoPicker.tsx
import React, { useMemo } from 'react';

export interface DocPhotoItemState {
  id: string;
  dataUrl: string;
  driveFileId?: string;
  fileName?: string;
  caption: string;
  /** null = belum dipilih; 1, 2, 3, ... = urutan foto pada lampiran Dokumentasi Pemeriksaan */
  selectionOrder: number | null;
  /** true = dipilih khusus sebagai Foto Bersama Pihak Perusahaan */
  isJointPhoto: boolean;
}

export interface AiPhotoSuggestionItem {
  id: string;
  caption: string;
  isJointPhoto?: boolean;
}

/**
 * Inisialisasi state foto laporan dari foto inspeksi lapangan.
 * Default untuk laporan baru: SEMUA foto belum dipilih (selectionOrder: null, isJointPhoto: false),
 * sehingga pengguna bebas memilih dari nol secara beruntun (ke-1, ke-2, ke-3, dst.).
 * Jika mengedit laporan tersimpan yang memiliki metadata urutan, pilihan & caption dipulihkan.
 */
export function initDocPhotos(sourcePhotos: any[] = [], initialReportData?: any): DocPhotoItemState[] {
  const docMeta = initialReportData?.photoDocumentation;
  const savedOrderIds: string[] = Array.isArray(docMeta?.selectedOrderIds)
    ? docMeta.selectedOrderIds.map((v: any) => String(v))
    : [];
  const savedJointId = docMeta?.jointPhotoId ? String(docMeta.jointPhotoId) : '';
  const savedCaptions: Record<string, string> =
    docMeta?.captionsById && typeof docMeta.captionsById === 'object' ? docMeta.captionsById : {};
  const savedPhotosArr: any[] = Array.isArray(docMeta?.photos) ? docMeta.photos : [];
  const savedJointDataUrl = typeof docMeta?.jointPhoto === 'string' ? docMeta.jointPhoto : '';

  // Jika dibuka di device lain yang belum menyimpan sesi foto lapangan lokal, pulihkan dari photoDocumentation tersimpan
  if ((!sourcePhotos || sourcePhotos.length === 0) && (savedPhotosArr.length > 0 || savedJointDataUrl)) {
    const hydrated: DocPhotoItemState[] = savedPhotosArr.map((p: any, idx: number) => ({
      id: savedOrderIds[idx] || String(p?.sourceId || p?.id || `saved_${idx}`),
      dataUrl: p?.dataUrl || '',
      driveFileId: p?.driveFileId,
      fileName: p?.fileName,
      caption: p?.caption || `Dokumentasi Pemeriksaan ${idx + 1}`,
      selectionOrder: idx + 1,
      isJointPhoto: false,
    }));
    if (savedJointDataUrl) {
      hydrated.push({
        id: savedJointId || 'saved_joint_photo',
        dataUrl: savedJointDataUrl,
        caption: 'Foto Bersama Pihak Perusahaan',
        selectionOrder: null,
        isJointPhoto: true,
      });
    }
    return normalizeSequentialOrders(hydrated);
  }

  const items: DocPhotoItemState[] = (sourcePhotos || []).map((p: any, idx: number) => {
    const id = p?.id !== undefined && p?.id !== null && String(p.id) !== '' ? String(p.id) : String(idx);
    const driveId = p?.driveFileId ? String(p.driveFileId) : '';
    const isJoint = Boolean(savedJointId && (savedJointId === id || (driveId && savedJointId === driveId)));
    let orderIdx = savedOrderIds.indexOf(id);
    if (orderIdx < 0 && driveId) {
      orderIdx = savedOrderIds.indexOf(driveId);
    }
    const selectionOrder = !isJoint && orderIdx >= 0 ? orderIdx + 1 : null;

    return {
      id,
      dataUrl: p?.dataUrl || '',
      driveFileId: p?.driveFileId,
      fileName: p?.fileName,
      caption:
        savedCaptions[id] ||
        (driveId ? savedCaptions[driveId] : '') ||
        p?.caption ||
        p?.fileName ||
        `Dokumentasi Pemeriksaan ${idx + 1}`,
      selectionOrder,
      isJointPhoto: isJoint,
    };
  });

  return normalizeSequentialOrders(items);
}

/** Mengambil data URL base64 foto dari state lokal atau proxy Drive dengan pengecekan error HTTP. */
export async function resolveDocPhotoDataUrl(
  photo: Pick<DocPhotoItemState, 'dataUrl' | 'driveFileId'>,
  apiBase: string
): Promise<string> {
  if (photo.dataUrl && photo.dataUrl.includes('base64,')) return photo.dataUrl;
  if (!photo.driveFileId) return '';
  const res = await fetch(`${apiBase}/api/photo-proxy?fileId=${encodeURIComponent(photo.driveFileId)}`);
  if (!res.ok) {
    throw new Error(`Gagal memuat foto Drive (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca data foto.'));
    reader.readAsDataURL(blob);
  });
}

/** Rapikan ulang nomor urutan agar selalu beruntun 1, 2, 3, ... tanpa celah angka. */
export function normalizeSequentialOrders(items: DocPhotoItemState[]): DocPhotoItemState[] {
  const ordered = items
    .filter((p) => p.selectionOrder !== null && !p.isJointPhoto)
    .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0));

  const rankMap = new Map<string, number>();
  ordered.forEach((p, idx) => rankMap.set(p.id, idx + 1));

  return items.map((item) => {
    if (item.isJointPhoto) {
      return { ...item, selectionOrder: null };
    }
    const rank = rankMap.get(item.id) ?? null;
    return item.selectionOrder === rank ? item : { ...item, selectionOrder: rank };
  });
}

/** Mengambil daftar foto dokumentasi terurut sesuai klik pengguna (#1, #2, #3, ...). */
export function getOrderedDocPhotos(photos: DocPhotoItemState[]): DocPhotoItemState[] {
  return photos
    .filter((p) => p.selectionOrder !== null && !p.isJointPhoto)
    .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0));
}

/** Mengambil foto yang dipilih sebagai Foto Bersama Pihak Perusahaan. */
export function getJointDocPhoto(photos: DocPhotoItemState[]): DocPhotoItemState | undefined {
  return photos.find((p) => p.isJointPhoto);
}

/** Toggle pilihan foto ke dalam urutan dokumentasi (gaya pilih foto TikTok / Instagram). */
export function toggleDocPhotoOrder(prev: DocPhotoItemState[], photoId: string): DocPhotoItemState[] {
  const target = prev.find((p) => p.id === photoId);
  if (!target) return prev;

  if (target.selectionOrder !== null && !target.isJointPhoto) {
    const next = prev.map((item) =>
      item.id === photoId ? { ...item, selectionOrder: null } : item
    );
    return normalizeSequentialOrders(next);
  }

  const maxOrder = prev.reduce(
    (max, item) => (!item.isJointPhoto && item.selectionOrder !== null && item.selectionOrder > max ? item.selectionOrder : max),
    0
  );

  const next = prev.map((item) =>
    item.id === photoId
      ? { ...item, selectionOrder: maxOrder + 1, isJointPhoto: false }
      : item
  );
  return normalizeSequentialOrders(next);
}

/** Pilih atau lepas satu foto khusus sebagai Foto Bersama Pihak Perusahaan. */
export function toggleJointDocPhoto(prev: DocPhotoItemState[], photoId: string): DocPhotoItemState[] {
  const target = prev.find((p) => p.id === photoId);
  if (!target) return prev;

  const willSelect = !target.isJointPhoto;
  const next = prev.map((item) => {
    if (item.id === photoId) {
      return {
        ...item,
        isJointPhoto: willSelect,
        selectionOrder: willSelect ? null : item.selectionOrder,
      };
    }
    return willSelect ? { ...item, isJointPhoto: false } : item;
  });

  return normalizeSequentialOrders(next);
}

/** Kosongkan pilihan Foto Bersama tanpa mengubah urutan foto dokumentasi lainnya. */
export function clearJointDocPhoto(prev: DocPhotoItemState[]): DocPhotoItemState[] {
  return prev.map((item) => (item.isJointPhoto ? { ...item, isJointPhoto: false } : item));
}

/** Pangkas jumlah foto dokumentasi terpilih hingga maksimal `targetCount` (menjaga #1..#targetCount). */
export function trimDocPhotosToCount(prev: DocPhotoItemState[], targetCount: number): DocPhotoItemState[] {
  const next = prev.map((item) =>
    item.selectionOrder !== null && item.selectionOrder > targetCount
      ? { ...item, selectionOrder: null }
      : item
  );
  return normalizeSequentialOrders(next);
}

/** Reset semua pilihan foto dokumentasi & foto bersama kembali ke nol. */
export function resetDocPhotoSelection(prev: DocPhotoItemState[]): DocPhotoItemState[] {
  return prev.map((item) => ({ ...item, selectionOrder: null, isJointPhoto: false }));
}

/** Terapkan saran caption & pengelompokan dari AI secara berurutan. */
export function applyAiPhotoSuggestions(
  prev: DocPhotoItemState[],
  aiItems: AiPhotoSuggestionItem[]
): DocPhotoItemState[] {
  const jointCandidate = aiItems.find((it) => Boolean(it.isJointPhoto));
  const jointId = jointCandidate ? String(jointCandidate.id) : '';
  const orderedIds: string[] = aiItems
    .filter((it) => String(it.id) !== jointId)
    .map((it) => String(it.id));

  const next = prev.map((p) => {
    const match = aiItems.find((it) => String(it.id) === p.id);
    if (!match) return p;

    const isJoint = Boolean(jointId && p.id === jointId);
    const seqIdx = orderedIds.indexOf(p.id);
    return {
      ...p,
      caption: match.caption || p.caption,
      isJointPhoto: isJoint,
      selectionOrder: isJoint ? null : seqIdx >= 0 ? seqIdx + 1 : p.selectionOrder,
    };
  });

  return normalizeSequentialOrders(next);
}

/** Bangun metadata ringan agar saat Edit Laporan urutan & Foto Bersama tersimpan utuh. */
export function buildPhotoSelectionMeta(photos: DocPhotoItemState[]) {
  const ordered = getOrderedDocPhotos(photos);
  const joint = getJointDocPhoto(photos);
  const captionsById: Record<string, string> = {};
  photos.forEach((p) => {
    captionsById[p.id] = p.caption || '';
  });
  return {
    selectedOrderIds: ordered.map((p) => p.id),
    jointPhotoId: joint?.id || '',
    captionsById,
  };
}

interface DocumentationPhotoPickerProps {
  photos: DocPhotoItemState[];
  onChange: React.Dispatch<React.SetStateAction<DocPhotoItemState[]>>;
  apiBase: string;
  onAutoCategorize?: () => void;
  aiLoading?: boolean;
}

/**
 * Pemilih foto dokumentasi bergaya TikTok/Instagram:
 * - Awalnya kosong (belum ada foto terpilih)
 * - Ketuk foto satu per satu untuk menetapkan urutan Foto #1, #2, #3, dst.
 * - Pilih 1 foto khusus untuk bagian "Foto Bersama Pihak Perusahaan"
 */
export function DocumentationPhotoPicker({
  photos,
  onChange,
  apiBase,
  onAutoCategorize,
  aiLoading = false,
}: DocumentationPhotoPickerProps) {
  const orderedPhotos = useMemo(() => getOrderedDocPhotos(photos), [photos]);
  const jointPhoto = useMemo(() => getJointDocPhoto(photos), [photos]);
  const nextOrder = orderedPhotos.length + 1;
  const remainder = orderedPhotos.length % 3;
  const targetTrim = orderedPhotos.length - remainder;

  const resolveSrc = (p: DocPhotoItemState) =>
    p.dataUrl || (p.driveFileId ? `${apiBase}/api/photo-proxy?fileId=${p.driveFileId}` : '');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3.5">
      {/* Header Bagian Dokumentasi Foto */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
              Dokumentasi Foto Laporan
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {orderedPhotos.length} Foto Dokumentasi
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                jointPhoto
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}
            >
              {jointPhoto ? '1 Foto Bersama' : '0 Foto Bersama'}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Ketuk foto satu per satu dari awal untuk menentukan urutan tampil (<strong>Foto ke-1, ke-2, ke-3, dst.</strong> — otomatis disusun 3 foto per baris), lalu pilih 1 foto khusus untuk <strong>Foto Bersama Pihak Perusahaan</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {(orderedPhotos.length > 0 || jointPhoto) && (
            <button
              type="button"
              onClick={() => onChange((prev) => resetDocPhotoSelection(prev))}
              className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-red-50 border border-gray-200 hover:border-red-200 text-gray-700 hover:text-red-700 text-[11px] font-bold transition-colors"
            >
              ↺ Reset Pilihan
            </button>
          )}
          {onAutoCategorize && photos.length > 0 && (
            <button
              type="button"
              onClick={onAutoCategorize}
              disabled={aiLoading}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold hover:bg-indigo-100 disabled:opacity-50"
            >
              {aiLoading ? 'Menyusun...' : '✨ Susun & Caption AI'}
            </button>
          )}
        </div>
      </div>

      {/* Slot Khusus Foto Bersama Pihak Perusahaan */}
      {photos.length > 0 && (
        jointPhoto ? (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center gap-3">
            <img
              src={resolveSrc(jointPhoto)}
              alt={jointPhoto.caption}
              className="w-14 h-14 object-cover rounded-lg border border-amber-300 shrink-0 bg-amber-100"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-extrabold text-amber-900">
                ★ Terpilih sebagai Foto Bersama Pihak Perusahaan
              </p>
              <p className="text-[11px] text-amber-800 truncate">
                {jointPhoto.caption || 'Foto Bersama Pihak Perusahaan'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange((prev) => clearJointDocPhoto(prev))}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 text-[10px] font-bold hover:bg-amber-100 shrink-0"
            >
              Lepas
            </button>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium">
            👥 <strong>Foto Bersama Pihak Perusahaan belum dipilih.</strong> Klik tombol{' '}
            <span className="font-bold">👥 Jadikan Foto Bersama</span> pada salah satu foto di bawah yang ingin dimasukkan ke halaman Foto Bersama.
          </div>
        )
      )}

      {/* Strip Urutan Foto Dokumentasi Terpilih (#1 -> #2 -> #3 ...) */}
      {photos.length > 0 && (
        orderedPhotos.length > 0 ? (
          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-emerald-900">
                Urutan Foto Dokumentasi Terpilih ({orderedPhotos.length}):
              </span>
              <span className="text-[10px] text-emerald-700">
                Klik × untuk menghapus &amp; menggeser nomor otomatis
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {orderedPhotos.map((item) => (
                <div key={item.id} className="relative shrink-0 group">
                  <img
                    src={resolveSrc(item)}
                    alt={item.caption}
                    className="w-14 h-14 object-cover rounded-lg border-2 border-emerald-500 bg-gray-100"
                  />
                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shadow border border-white">
                    {item.selectionOrder}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange((prev) => toggleDocPhotoOrder(prev, item.id))}
                    title={`Hapus Foto #${item.selectionOrder}`}
                    aria-label={`Hapus Foto #${item.selectionOrder}`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white text-gray-700 hover:bg-red-600 hover:text-white border border-gray-300 text-[10px] font-black flex items-center justify-center shadow"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-[11px] text-slate-600 font-medium text-center">
            👆 <strong>Belum ada foto dokumentasi yang dipilih.</strong> Ketuk gambar di bawah secara berurutan untuk memilih <strong>Foto ke-1</strong>, lalu <strong>ke-2</strong>, <strong>ke-3</strong>, dan seterusnya.
          </div>
        )
      )}

      {/* Info Kerapian Baris (3 foto per baris di dokumen Word) */}
      {orderedPhotos.length > 0 && remainder !== 0 && (
        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex flex-wrap items-center justify-between gap-2">
          <span>
            ℹ️ Terpilih <strong>{orderedPhotos.length} foto dokumentasi</strong> (laporan menyusun{' '}
            <strong>3 foto per baris</strong>). Tambah <strong>{3 - remainder}</strong> foto lagi atau kurangi{' '}
            <strong>{remainder}</strong> foto terakhir agar baris terakhir terisi penuh tanpa kotak kosong.
          </span>
          {targetTrim >= 3 && (
            <button
              type="button"
              onClick={() => onChange((prev) => trimDocPhotosToCount(prev, targetTrim))}
              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[10px] hover:bg-blue-700 shrink-0"
            >
              Kurangi Jadi {targetTrim} Foto
            </button>
          )}
        </div>
      )}

      {/* Galeri Pilih Foto Gaya TikTok / Instagram */}
      {photos.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Tidak ada foto pada sesi inspeksi ini.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {photos.map((p) => {
            const isOrdered = p.selectionOrder !== null && !p.isJointPhoto;
            return (
              <div
                key={p.id}
                className={`p-2 rounded-xl border space-y-2 transition-all ${
                  p.isJointPhoto
                    ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-200'
                    : isOrdered
                    ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200'
                    : 'border-gray-200 bg-white hover:border-emerald-300'
                }`}
              >
                {/* Thumbnail Bisa Diketuk Langsung untuk Pilih/Batal Urutan */}
                <button
                  type="button"
                  onClick={() => onChange((prev) => toggleDocPhotoOrder(prev, p.id))}
                  title={
                    isOrdered
                      ? `Batal pilih Foto ke-${p.selectionOrder}`
                      : `Ketuk untuk menjadikan Foto ke-${nextOrder}`
                  }
                  className="relative w-full block rounded-lg overflow-hidden bg-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <img
                    src={resolveSrc(p)}
                    alt={p.caption}
                    className="w-full h-32 sm:h-36 object-cover"
                  />

                  {/* Lingkaran Nomor Gaya TikTok / Instagram di Pojok Kanan Atas */}
                  <span
                    className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 border-white shadow-md transition-transform ${
                      isOrdered
                        ? 'bg-emerald-600 text-white scale-105'
                        : p.isJointPhoto
                        ? 'bg-amber-500 text-white scale-105'
                        : 'bg-black/40 text-white/90 hover:bg-emerald-600/80'
                    }`}
                  >
                    {isOrdered ? p.selectionOrder : p.isJointPhoto ? '★' : ''}
                  </span>

                  {/* Label Status Jelas di Pojok Kiri Bawah Foto */}
                  {(isOrdered || p.isJointPhoto) && (
                    <span
                      className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white shadow ${
                        p.isJointPhoto ? 'bg-amber-600/95' : 'bg-emerald-600/95'
                      }`}
                    >
                      {p.isJointPhoto ? '★ Foto Bersama' : `Foto ke-${p.selectionOrder}`}
                    </span>
                  )}
                </button>

                {/* Tombol Aksi Eksplisit (Tanpa Istilah "Grid") */}
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange((prev) => toggleDocPhotoOrder(prev, p.id))}
                    className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors border ${
                      isOrdered
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {isOrdered ? `✓ Urutan Foto ke-${p.selectionOrder}` : `+ Pilih Urutan ke-${nextOrder}`}
                  </button>

                  <button
                    type="button"
                    onClick={() => onChange((prev) => toggleJointDocPhoto(prev, p.id))}
                    className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors border ${
                      p.isJointPhoto
                        ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                        : 'bg-amber-50/80 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {p.isJointPhoto ? '★ Terpilih: Foto Bersama' : '👥 Jadikan Foto Bersama'}
                  </button>
                </div>

                {/* Input Keterangan Foto */}
                <input
                  type="text"
                  value={p.caption}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange((prev) =>
                      prev.map((item) => (item.id === p.id ? { ...item, caption: v } : item))
                    );
                  }}
                  placeholder="Tulis keterangan foto..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
