// src/components/FormView.tsx
import { Document3DLoading } from './Document3DLoading';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { InspectionPhoto } from '../db/db';
import type { SifatPemeriksaan } from '../types';

const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

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
    <div className="space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-center gap-4 pb-2">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 shadow-inner border border-emerald-100/50">
          <span className="text-3xl filter drop-shadow-sm">{objMeta?.icon || '📦'}</span>
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">
            {isEdit ? 'Edit' : 'Inspeksi'} <span className="text-emerald-700">{objMeta?.label || activeObject}</span>
          </h2>
          <p className="text-sm text-gray-500 font-medium mt-0.5">{objMeta?.desc}</p>
        </div>
      </div>

      {/* Nama Klien */}
      <div className="relative">
        <label className="block text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-2">
          Nama Perusahaan Klien <span className="text-red-500 animate-pulse">*</span>
        </label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => onClientNameChange(e.target.value)}
          onFocus={onClientNameFocus}
          placeholder="Ketik nama klien..."
          className="w-full bg-white border border-emerald-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 rounded-2xl px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all duration-300 shadow-sm"
        />
        {showClientDropdown && clientSuggestions.length > 0 && (
          <div className="absolute z-20 top-full mt-2 left-0 right-0 bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-xl overflow-hidden py-1">
            {clientSuggestions
              .filter((s) => s.toLowerCase().includes(clientName.toLowerCase()))
              .slice(0, 5)
              .map((s) => (
                <button
                  key={s}
                  onMouseDown={() => onClientSuggestionSelect(s)}
                  className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors font-medium active:bg-emerald-100"
                >
                  {s}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Tanggal & Sifat Pemeriksaan — sebelum data teknis */}
      <div className="space-y-5 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <SectionDivider label="Penjadwalan Inspeksi" />
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-2">
            Tanggal Inspeksi <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="date"
            value={formData.tanggal_inspeksi || todayISO()}
            onChange={(e) => onFieldChange('tanggal_inspeksi', e.target.value)}
            className="w-full bg-white border border-emerald-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 rounded-2xl px-4 py-3.5 text-sm text-gray-900 outline-none transition-all duration-300 shadow-sm"
          />
          <p className="text-[10px] text-gray-400 mt-1.5">Ubah ke tanggal asli untuk data arsip/backlog tahun lalu.</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-2">
            Sifat Pemeriksaan <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(['Baru', 'Berkala'] as SifatPemeriksaan[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onFieldChange('sifat_pemeriksaan', opt)}
                className={`py-3 rounded-2xl border text-sm font-bold transition-all active:scale-[0.98] ${
                  (formData.sifat_pemeriksaan || 'Baru') === opt
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-200'
                }`}
              >
                {opt === 'Baru' ? '🆕 Baru' : '🔄 Berkala'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Common Fields */}
      <div className="space-y-5 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
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
          className="w-full py-3 mt-2 border-2 border-dashed border-emerald-100 rounded-2xl text-emerald-600 text-xs font-bold hover:bg-emerald-50 hover:border-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {showOptional ? (
            <><span className="text-emerald-500">▲</span> Sembunyikan detail opsional</>
          ) : (
            <><span className="text-emerald-500">▼</span> Tambah detail opsional (merek, lokasi, dll)</>
          )}
        </button>
        
        {showOptional && (
          <div className="space-y-5 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            {optionalFields.map((field) => (
              <FormField
                key={field.name}
                field={field}
                value={formData[field.name] || ''}
                onChange={(v) => onFieldChange(field.name, v)}
              />
            ))}
            {specificFields.length > 0 && (
              <div className="pt-2 space-y-5 border-t border-gray-50">
                <SectionDivider label={`Data Teknis — ${objMeta?.label || activeObject}`} />
                {specificFields.map((field) => (
                  <FormField
                    key={field.name}
                    field={field}
                    value={formData[field.name] || ''}
                    onChange={(v) => onFieldChange(field.name, v)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Foto Dokumentasi */}
      <div className="space-y-4 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <SectionDivider label={`Foto Dokumentasi (${totalPhotos})`} />

        {existingPhotos.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Foto Tersimpan <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-1">{existingPhotos.length}</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              {existingPhotos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden border border-gray-200 group shadow-sm hover:shadow-md transition-all">
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
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <button
                    onClick={() => onRemoveExistingPhoto(photo.id)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 shadow-lg active:scale-90"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {newPhotos.length > 0 && (
          <div className="pt-2">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3">
              Foto Baru <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-1">{newPhotos.length}</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              {newPhotos.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-emerald-400 group shadow-sm hover:shadow-md transition-all">
                  <img src={src} alt={`foto baru ${idx + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <button
                    onClick={() => onRemoveNewPhoto(idx)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 shadow-lg active:scale-90"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={onCameraClick}
            className="py-3.5 border-2 border-dashed border-emerald-300 rounded-2xl text-emerald-700 text-sm font-bold bg-emerald-50/50 hover:bg-emerald-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="text-lg">📷</span> Kamera
          </button>
          <button
            onClick={onGalleryClick}
            className="py-3.5 border-2 border-dashed border-emerald-300 rounded-2xl text-emerald-700 text-sm font-bold bg-emerald-50/50 hover:bg-emerald-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="text-lg">🖼️</span> Galeri
          </button>
        </div>
      </div>

      {/* Progress Bar 3D */}
      {uploadingId === editingId && uploadProgress && (
        <div className="mt-4 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Document3DLoading />
          
          <div className="mt-5 space-y-2.5">
            <div className="flex justify-between text-xs font-bold text-blue-800">
              <span>Munggah Foto ({uploadProgress.loaded} / {uploadProgress.total})</span>
              <span className="bg-blue-200/50 px-2 py-0.5 rounded-full">{Math.round(uploadProgress.percentage)}%</span>
            </div>
            <div className="w-full bg-blue-200/50 rounded-full h-2.5 overflow-hidden backdrop-blur-sm">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 relative overflow-hidden"
                style={{ width: `${uploadProgress.percentage}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl pt-4 pb-6 px-4 border-t border-gray-200/80 flex gap-3 z-50 shadow-[0_-4px_20px_-5px_rgb(0,0,0,0.05)]">
        <button
          onClick={onCancel}
          className="flex-[1] py-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all active:scale-[0.98] shadow-sm"
        >
          Batal
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex-[2] py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-gray-300 disabled:to-gray-300 disabled:text-gray-500 text-white text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <><Spinner /> Menyimpan...</>
          ) : isEdit ? (
            <><span>✏️</span> Perbarui Data ({totalPhotos})</>
          ) : (
            <><span>✅</span> Simpan Draft Offline ({totalPhotos})</>
          )}
        </button>
      </div>
      
      {/* Spacer to prevent bottom content from being hidden by the fixed bottom bar */}
      <div className="h-16"></div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1 pb-2">
      <div className="w-1.5 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-800">{label}</p>
      <div className="flex-1 h-px bg-gradient-to-r from-emerald-100 to-transparent" />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-white/80" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function FormField({ field, value, onChange, accent = false }: { field: FieldDef, value: string, onChange: (val: string) => void, accent?: boolean }) {
  const baseInput = `
    w-full border rounded-2xl px-4 py-3.5 text-sm text-gray-900
    placeholder-gray-400 outline-none transition-all duration-300 shadow-sm
    ${accent
      ? 'bg-emerald-50/30 border-emerald-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20'
      : 'bg-gray-50/50 border-gray-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:bg-white'
    }
  `;

  return (
    <div>
      <label className={`block text-[11px] font-bold uppercase tracking-widest mb-2 ${accent ? 'text-emerald-700' : 'text-gray-500'}`}>
        {field.label}
        {field.required && <span className="text-red-500 ml-1.5">*</span>}
        {field.unit && <span className="ml-1.5 normal-case font-medium opacity-60">({field.unit})</span>}
      </label>
      {field.type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput + ' cursor-pointer appearance-none'}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2310B981' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: 'right 1rem center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '1.2em 1.2em',
            paddingRight: '3rem',
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
