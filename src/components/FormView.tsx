// src/components/FormView.tsx
import { Document3DLoading } from './Document3DLoading';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { InspectionPhoto } from '../db/db';

export type FieldType = 'text' | 'number' | 'select' | 'textarea';
export type FormMode = 'create' | 'edit';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

interface ObjectMeta {
  key: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

// 1. Ganti interface FormViewProps
interface FormViewProps {
  editingId: string | null;
  uploadingId: string | null;
  uploadProgress: { percentage: number; loaded: number; total: number } | null;
  formMode: FormMode;
  activeObject: string;
  objMeta: ObjectMeta | undefined;
  clientName: string;
  showClientDropdown: boolean;
  clientSuggestions: string[];
  formData: Record<string, string>;
  commonFields: FieldDef[];
  specificFields: FieldDef[];
  existingPhotos: InspectionPhoto[];
  newPhotos: string[];
  totalPhotos: number;
  isSaving: boolean;
  onClientNameChange: (val: string) => void;
  onClientNameFocus: () => void;
  onClientSuggestionSelect: (name: string) => void;
  onFieldChange: (name: string, value: string) => void;
  onCameraClick: () => void;
  onGalleryClick: () => void;
  onRemoveExistingPhoto: (id: string) => void;
  onRemoveNewPhoto: (idx: number) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function FormView({
  editingId,
  uploadingId,
  uploadProgress,
  formMode,
  activeObject,
  objMeta,
  clientName,
  showClientDropdown,
  clientSuggestions,
  formData,
  commonFields,
  specificFields,
  existingPhotos,
  newPhotos,
  totalPhotos,
  isSaving,
  onClientNameChange,
  onClientNameFocus,
  onClientSuggestionSelect,
  onFieldChange,
  onCameraClick,
  onGalleryClick,
  onRemoveExistingPhoto,
  onRemoveNewPhoto,
  onSave,
  onCancel,
}: FormViewProps) {
  const isEdit = formMode === 'edit';
  const [showOptional, setShowOptional] = useState(false);

  const REQUIRED_COMMON = ['namaUnit', 'nomorSeri'];
  const requiredFields = commonFields.filter(f => REQUIRED_COMMON.includes(f.name));
  const optionalFields = commonFields.filter(f => !REQUIRED_COMMON.includes(f.name));

  return (
    <div className="space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 pb-1">
        <span className="text-3xl">{objMeta?.icon || '📦'}</span>
        <div>
          <h2 className="text-base font-black text-gray-900">
            {isEdit ? 'Edit' : 'Inspeksi'} {objMeta?.label || activeObject}
          </h2>
          <p className="text-xs text-gray-400 font-medium">{objMeta?.desc}</p>
        </div>
      </div>

      {/* Nama Klien */}
      <div className="relative">
        <label className="block text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1.5">
          Nama Perusahaan Klien <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => onClientNameChange(e.target.value)}
          onFocus={onClientNameFocus}
          placeholder="Ketik nama klien..."
          className="w-full bg-white border border-emerald-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all"
        />
        {showClientDropdown && clientSuggestions.length > 0 && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {clientSuggestions
              .filter((s) => s.toLowerCase().includes(clientName.toLowerCase()))
              .slice(0, 5)
              .map((s) => (
                <button
                  key={s}
                  onMouseDown={() => onClientSuggestionSelect(s)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors font-medium"
                >
                  {s}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Common Fields */}
      <div className="space-y-4">
        <SectionDivider label="Identitas Unit" />
        {requiredFields.map((field) => (
          <FormField
            key={field.name}
            field={field}
            value={formData[field.name] || ''}
            onChange={(v) => onFieldChange(field.name, v)}
            accent={true}
          />
        ))}
        <button
          type="button"
          onClick={() => setShowOptional(v => !v)}
          className="w-full py-2.5 border border-dashed border-emerald-200 rounded-xl text-emerald-600 text-xs font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
        >
          {showOptional ? '▲ Sembunyikan detail opsional' : '▼ Tambah detail opsional (merek, lokasi, catatan...)'}
        </button>
        {showOptional && (
          <>
            {optionalFields.map((field) => (
              <FormField
                key={field.name}
                field={field}
                value={formData[field.name] || ''}
                onChange={(v) => onFieldChange(field.name, v)}
              />
            ))}
            {specificFields.length > 0 && (
              <>
                <SectionDivider label={`Data Teknis — ${objMeta?.label || activeObject}`} />
                {specificFields.map((field) => (
                  <FormField
                    key={field.name}
                    field={field}
                    value={formData[field.name] || ''}
                    onChange={(v) => onFieldChange(field.name, v)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Foto Dokumentasi */}
      <div className="space-y-3">
        <SectionDivider label={`Foto Dokumentasi (${totalPhotos})`} />

        {existingPhotos.length > 0 && (
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Foto Tersimpan ({existingPhotos.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {existingPhotos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group">
                  <img
                    src={
                      photo.dataUrl && photo.dataUrl.startsWith('data:image')
                        ? photo.dataUrl
                        : photo.driveFileId
                          ? `/api/photo-proxy?fileId=${photo.driveFileId}`
                          : ''
                    }
                    alt="foto"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <button
                    onClick={() => onRemoveExistingPhoto(photo.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {newPhotos.length > 0 && (
          <div>
            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-2">
              Foto Baru ({newPhotos.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {newPhotos.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border-2 border-emerald-300 group">
                  <img src={src} alt={`foto baru ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => onRemoveNewPhoto(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onCameraClick}
            className="py-3 border-2 border-dashed border-emerald-300 rounded-xl text-emerald-600 text-sm font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
          >
            📷 Kamera
          </button>
          <button
            onClick={onGalleryClick}
            className="py-3 border-2 border-dashed border-emerald-300 rounded-xl text-emerald-600 text-sm font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
          >
            🖼️ Galeri
          </button>
        </div>
      </div>

{/* Progress Bar 3D */}
{uploadingId === editingId && uploadProgress && (
  <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200 animate-in fade-in slide-in-from-bottom-2">
    <Document3DLoading />
    
    <div className="mt-4 space-y-2">
      <div className="flex justify-between text-xs font-bold text-gray-600">
        {/* PENTING: pake .loaded, jangan .current */}
        <span>Foto {uploadProgress.loaded} dari {uploadProgress.total}</span>
        <span>{Math.round(uploadProgress.percentage)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${uploadProgress.percentage}%` }}
        />
      </div>
    </div>
  </div>
)}

      {/* Action Buttons */}
      <div className="sticky bottom-0 bg-slate-50/95 backdrop-blur pt-3 pb-2 -mx-4 px-4 border-t border-gray-200 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-all"
        >
          Batal
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex-[2] py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:text-gray-500 text-white text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <><Spinner />Menyimpan...</>
          ) : isEdit ? (
            <>✏️ Perbarui Data ({totalPhotos} foto)</>
          ) : (
            <>✅ Simpan Draft Offline ({totalPhotos} foto)</>
          )}
        </button>
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="w-1 h-4 rounded-full bg-emerald-500" />
      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{label}</p>
      <div className="flex-1 h-px bg-emerald-100" />
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

export function FormField({ field, value, onChange, accent = false }: { field: FieldDef, value: string, onChange: (val: string) => void, accent?: boolean }) {
  const baseInput = `
    w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-900
    placeholder-gray-400 outline-none transition-all
    ${accent
      ? 'border-emerald-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 bg-white'
      : 'border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
    }
  `;

  return (
    <div>
      <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${accent ? 'text-emerald-700' : 'text-gray-500'}`}>
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
        {field.unit && <span className="ml-1 normal-case font-medium opacity-60">({field.unit})</span>}
      </label>

      {field.type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput + ' cursor-pointer appearance-none'}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: 'right 0.5rem center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '1.5em 1.5em',
            paddingRight: '2.5rem',
          }}
        >
          <option value="">— Pilih —</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={baseInput + ' resize-none'}
        />
      ) : (
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseInput}
        />
      )}
    </div>
  );
}