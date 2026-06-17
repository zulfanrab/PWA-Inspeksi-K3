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
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapturePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const compressedBase64 = await compressImage(file);
      setPhotos(prev => [...prev, compressedBase64]);
    } catch (error) {
      console.error("Gagal kompres foto:", error);
      alert("Gagal memproses foto, silakan coba lagi.");
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    // UPGRADE UI: Memberikan bayangan yang lebih lembut (shadow-xl)
    <form onSubmit={(e) => { e.preventDefault(); onSave(formData, photos); }} className="p-6 space-y-8 bg-white rounded-3xl border border-gray-100 shadow-xl max-w-xl mx-auto my-4">
      
      {/* Header Kartu Form */}
      <div className="bg-gradient-to-r from-[#064E3B] to-[#0A7A5C] p-6 text-white rounded-t-3xl -mx-6 -mt-6 shadow-inner">
        <span className="text-[10px] font-bold uppercase bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full tracking-wider">
          {activeObject}
        </span>
        <h2 className="text-2xl font-black mt-3 tracking-tight">Form Data Unit</h2>
        <p className="text-sm text-white/80 mt-1 font-medium">{activeClient?.name}</p>
      </div>

      {/* Input Umum */}
      <div className="space-y-5">
        {['Nama Unit', 'Nomor Seri', 'Lokasi Site'].map(field => (
          <div key={field}>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-2 tracking-wide">{field}</label>
            {/* UPGRADE UI: Menambahkan efek outline hijau (focus:ring) saat input diklik */}
            <input 
              required 
              type="text" 
              placeholder={`Masukkan ${field.toLowerCase()}...`}
              onChange={e => setFormData({...formData, [field]: e.target.value})} 
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm transition-all focus:bg-white focus:ring-2 focus:ring-[#10B981]/40 focus:border-[#10B981] outline-none" 
            />
          </div>
        ))}
      </div>

      {/* Input Khusus */}
      {templateFields.length > 0 && (
        <div className="space-y-5 pt-6 border-t border-gray-100">
          <h3 className="text-xs font-bold text-[#10B981] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
            Spesifikasi {activeObject}
          </h3>
          {templateFields.map(field => (
            <div key={field.name}>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-2 tracking-wide">{field.label}</label>
              <input 
                required 
                type={field.type} 
                placeholder={`Isi data ${field.label.toLowerCase()}...`}
                onChange={e => setFormData({...formData, [field.name]: e.target.value})} 
                className="w-full px-4 py-3 bg-[#ECFDF5]/30 border border-[#10B981]/30 rounded-xl text-sm transition-all focus:bg-white focus:ring-2 focus:ring-[#10B981]/50 focus:border-[#10B981] outline-none" 
              />
            </div>
          ))}
        </div>
      )}

      {/* Kamera Area */}
      <div className="pt-2">
        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleCapturePhoto} className="hidden" />
        
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()} 
          disabled={isCompressing}
          // UPGRADE UI: Transisi warna dan efek ditekan (active:scale) pada tombol kamera
          className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#10B981]/50 bg-[#ECFDF5]/20 py-6 rounded-2xl font-bold text-sm text-[#064E3B] hover:bg-[#10B981]/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-wait"
        >
          {isCompressing ? (
            <span className="animate-pulse">Memproses Foto (Mohon Tunggu)...</span>
          ) : (
            <>
              {/* Ikon Kamera */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#10B981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
              <span>Tap Untuk Buka Kamera <span className="bg-[#10B981] text-white px-2 py-0.5 rounded-full ml-1 text-xs">{photos.length}</span></span>
            </>
          )}
        </button>

        {/* UPGRADE UX (FITUR BARU): Menampilkan Thumbnail Hasil Foto */}
        {photos.length > 0 && (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {photos.map((src, index) => (
              <div key={index} className="relative flex-shrink-0">
                <img src={src} alt={`Preview ${index + 1}`} className="h-16 w-16 object-cover rounded-xl border border-gray-200 shadow-sm" />
                <span className="absolute -top-2 -right-2 bg-gray-800 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                  {index + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tombol Submit */}
      {/* UPGRADE UI: Mengubah warna tombol jadi gradien dan ada efek naik/zoom saat di-hover */}
      <button 
        type="submit" 
        className="w-full bg-gradient-to-r from-[#1F2937] to-[#111827] text-white py-4 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-[0.98]"
      >
        Simpan Draft Offline
      </button>
    </form>
  );
}