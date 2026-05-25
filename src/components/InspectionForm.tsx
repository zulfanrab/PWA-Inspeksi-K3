// src/components/InspectionForm.tsx
import { useState, useRef } from 'react';

interface FormProps {
  activeObject: string;
  activeClient: any;
  onSave: (formData: any, photos: string[]) => void;
  templateFields: any[];
}

export default function InspectionForm({ activeObject, activeClient, onSave, templateFields }: FormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPhotos(prev => [...prev, reader.result as string]);
    reader.readAsDataURL(file);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(formData, photos); }} className="p-6 space-y-8 bg-white rounded-2xl border border-gray-200">
      <div className="bg-[#064E3B] p-6 text-white rounded-t-2xl -mx-6 -mt-6">
        <span className="text-[10px] font-bold uppercase bg-white/20 px-2 py-1 rounded">{activeObject}</span>
        <h2 className="text-xl font-black mt-2">Form Data Unit</h2>
        <p className="text-xs text-white/70">{activeClient?.name}</p>
      </div>

      {/* Input Umum */}
      <div className="space-y-4">
        {['Nama Unit', 'Nomor Seri', 'Lokasi Site'].map(field => (
          <div key={field}>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">{field}</label>
            <input required type="text" onChange={e => setFormData({...formData, [field]: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>
        ))}
      </div>

      {/* Input Khusus */}
      {templateFields.length > 0 && (
        <div className="space-y-4 pt-2 border-t">
          <h3 className="text-[10px] font-bold text-[#10B981] uppercase tracking-widest">Spesifikasi {activeObject}</h3>
          {templateFields.map(field => (
            <div key={field.name}>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">{field.label}</label>
              <input required type={field.type} onChange={e => setFormData({...formData, [field.name]: e.target.value})} className="w-full px-4 py-2.5 bg-[#ECFDF5]/30 border border-[#10B981]/20 rounded-xl text-sm" />
            </div>
          ))}
        </div>
      )}

      {/* Kamera */}
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleCapturePhoto} className="hidden" />
      <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-[#10B981]/50 py-4 rounded-xl font-bold text-sm text-[#064E3B] hover:bg-[#10B981]/10">
        Tap Untuk Buka Kamera ({photos.length} Foto)
      </button>

      <button type="submit" className="w-full bg-[#1F2937] text-white py-4 rounded-xl font-bold text-sm shadow-lg">Simpan Draft Offline</button>
    </form>
  );
}