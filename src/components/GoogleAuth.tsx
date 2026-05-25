// src/components/GoogleAuth.tsx
import { GOOGLE_CONFIG } from '../config';

export default function GoogleAuth() {
  
  const handleLogin = () => {
    // Simulasi alur OAuth 2.0
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CONFIG.clientId}&redirect_uri=${window.location.origin}&response_type=token&scope=${GOOGLE_CONFIG.scope}`;
    window.location.href = authUrl;
  };

  return (
    <div className="bg-white border-2 border-[#10B981]/20 p-6 rounded-2xl shadow-sm text-center">
      <h3 className="font-black text-[#064E3B] text-lg mb-2">Cloud Drive Perusahaan</h3>
      <p className="text-xs font-semibold text-gray-500 mb-6">Hubungkan akun Google perusahaan untuk sinkronisasi laporan otomatis.</p>
      <button 
        onClick={handleLogin}
        className="w-full flex items-center justify-center gap-3 bg-[#1F2937] hover:bg-black text-white py-3 rounded-xl font-bold text-sm transition-all"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1H12v2.8h5.36c-.47 2.45-2.67 4.1-5.36 4.1-3.32 0-6.03-2.71-6.03-6.03s2.71-6.03 6.03-6.03c1.47 0 2.81.53 3.86 1.41l2.1-2.1c-1.63-1.46-3.8-2.31-5.96-2.31-4.97 0-9.03 4.06-9.03 9.03s4.06 9.03 9.03 9.03c4.78 0 8.76-3.4 9.4-8.03z"/></svg>
        Hubungkan ke Google Drive
      </button>
    </div>
  );
}