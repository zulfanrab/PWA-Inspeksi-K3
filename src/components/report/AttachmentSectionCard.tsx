// src/components/report/AttachmentSectionCard.tsx
import { useState } from 'react';
import { processPdfOrImagePages } from '../../utils/skpImageHelper';

export interface AttachmentPageItem {
  id: string;
  sourceFileName: string;
  pageNumber: number;
  dataUrl: string;
}

export function mapInitialAttachments(rawList: any, prefix = 'att'): AttachmentPageItem[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((att: any, idx: number) => ({
      id: `${prefix}-${idx}-${Date.now()}`,
      sourceFileName: att?.sourceFileName || `Lampiran ${idx + 1}`,
      pageNumber: att?.pageNumber || idx + 1,
      dataUrl: att?.image || att?.dataUrl || '',
    }))
    .filter((att) => Boolean(att.dataUrl));
}

interface AttachmentSectionCardProps {
  title: string;
  badgeText?: string;
  subtitle: string;
  emptyText: string;
  buttonLabel: string;
  accent?: 'emerald' | 'indigo' | 'amber';
  items: AttachmentPageItem[];
  onChange: (next: AttachmentPageItem[]) => void;
}

export function AttachmentSectionCard({
  title,
  badgeText,
  subtitle,
  emptyText,
  buttonLabel,
  accent = 'emerald',
  items,
  onChange,
}: AttachmentSectionCardProps) {
  const [processing, setProcessing] = useState(false);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setProcessing(true);
    try {
      const added: AttachmentPageItem[] = [];
      for (const file of files) {
        const pages = await processPdfOrImagePages(file);
        pages.forEach((pg) => {
          added.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sourceFileName: file.name,
            pageNumber: pg.pageNumber,
            dataUrl: pg.dataUrl,
          });
        });
      }
      onChange([...items, ...added]);
    } catch (err: any) {
      alert(`Gagal memproses lampiran: ${err.message}`);
    } finally {
      setProcessing(false);
      e.target.value = '';
    }
  };

  const handleMove = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const temp = next[idx];
    next[idx] = next[target];
    next[target] = temp;
    onChange(next);
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const badgeCls =
    accent === 'indigo'
      ? 'bg-indigo-100 text-indigo-800'
      : accent === 'amber'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800';

  const buttonCls =
    accent === 'indigo'
      ? 'bg-indigo-600 hover:bg-indigo-700'
      : accent === 'amber'
      ? 'bg-amber-600 hover:bg-amber-700'
      : 'bg-emerald-600 hover:bg-emerald-700';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
              {title} ({items.length} hal.)
            </h3>
            {badgeText && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}`}>
                {badgeText}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
        </div>

        <label className={`px-3 py-2 rounded-xl text-white text-[11px] font-bold cursor-pointer shrink-0 ${buttonCls}`}>
          {processing ? 'Memproses Halaman...' : buttonLabel}
          <input
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={handleFilesSelected}
            disabled={processing}
            className="hidden"
          />
        </label>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((att, idx) => (
            <div
              key={att.id}
              className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={att.dataUrl}
                  alt={`${att.sourceFileName} Hal ${att.pageNumber}`}
                  className="w-12 h-16 object-cover rounded-lg border border-gray-300 bg-white shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {idx + 1}. {att.sourceFileName}
                  </p>
                  <p className="text-[11px] text-gray-500">Halaman {att.pageNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMove(idx, -1)}
                  title="Geser ke atas"
                  className="px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-bold disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={idx === items.length - 1}
                  onClick={() => handleMove(idx, 1)}
                  title="Geser ke bawah"
                  className="px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-bold disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(att.id)}
                  title="Hapus halaman"
                  className="px-2 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
