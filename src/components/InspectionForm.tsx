// src/components/InspectionForm.tsx
import { useState, useRef } from 'react';

// ==========================================
// MESIN KOMPRESOR FOTO (1080px, Kualitas 60%)
// Merubah foto 5MB jadi ~150KB dalam 0.5 detik
// ==========================================
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        const MAX_WIDTH = 1080;
        const MAX_HEIGHT = 1080;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) { 
          resolve(event.target?.result as string); // Fallback kalau gagal
          return; 
        }

        ctx.drawImage(img, 0, 0, width, height);
        // PRES JADI JPEG 60%
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => reject(new Error('Gagal memproses gambar'));
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
  });
};

// ==========================================
// KOMPONEN UTAMA
// ==========================================
interface FormProps {
  activeObject: string;
  activeClient: any;
  onSave: (formData: any, photos: string[]) => void;
  templateFields: any[];
}

export default function InspectionForm({ activeObject, activeClient, onSave, templateFields }: FormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false); // State biar tombol ganti tulisan pas loading
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapturePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true); // Tampilkan tulisan "Memproses..."
      
      // Masukin ke mesin kompresor dulu
      const compressedBase64 = await compressImage(file);
      
      // Simpan hasil kompresan yang udah kecil ke state
      setPhotos(prev => [...prev, compressedBase64]);
    } catch (error) {
      console.error("Gagal kompres foto:", error);
      alert("Gagal memproses foto, silakan coba lagi.");
    } finally {
      setIsCompressing(false); // Balikin tombol ke semula
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset memori input kamera
    }
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
      
      <button 
        type="button" 
        onClick={() => fileInputRef.current?.click()} 
        disabled={isCompressing}
        className="w-full border-2 border-dashed border-[#10B981]/50 py-4 rounded-xl font-bold text-sm text-[#064E3B] hover:bg-[#10B981]/10 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isCompressing ? 'Memproses Foto (Mohon Tunggu)...' : `Tap Untuk Buka Kamera (${photos.length} Foto)`}
      </button>

      <button type="submit" className="w-full bg-[#1F2937] text-white py-4 rounded-xl font-bold text-sm shadow-lg">Simpan Draft Offline</button>
    </form>
  );
}