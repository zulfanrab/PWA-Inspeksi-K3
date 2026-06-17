interface HeaderProps {
  currentView: string;
  setCurrentView: (view: any) => void;
  syncCount: number;
}

export default function Header({ currentView, setCurrentView, syncCount }: HeaderProps) {
  return (
    // UPGRADE UI: Mengganti background solid jadi efek kaca (backdrop-blur) agar lebih kekinian
    <header className="bg-white/90 backdrop-blur-md border-b border-gray-200/80 sticky top-0 z-50 shadow-sm px-4 h-16 flex items-center justify-between transition-all">
      
      {/* Bagian Logo */}
      <div 
        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" 
        onClick={() => setCurrentView('HOME')}
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#10B981] to-[#064E3B] flex items-center justify-center shadow-md">
          <span className="text-white font-bold text-xs">K3</span>
        </div>
        <h1 className="text-lg font-black tracking-tight text-[#064E3B] leading-none">
          AKSARA<span className="text-[#10B981]">INSPECT</span>
        </h1>
      </div>

      {/* Bagian Tombol Kanan */}
      <div className="flex items-center gap-3">
        {currentView === 'HOME' && (
          // UPGRADE UI: Menambahkan hover effect agar tombol terasa hidup saat disentuh
          <button 
            onClick={() => setCurrentView('SYNC_HUB')} 
            className="relative bg-gray-100 hover:bg-gray-200 p-2.5 rounded-xl transition-all active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
            
            {/* UPGRADE UI: Mempercantik badge notifikasi angka sync */}
            {syncCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-pulse">
                {syncCount}
              </span>
            )}
          </button>
        )}
        
        {currentView !== 'HOME' && (
          // UPGRADE UI: Menambahkan ikon panah ke tombol Kembali dan memperhalus warnanya
          <button 
            onClick={() => setCurrentView('HOME')} 
            className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-2 rounded-xl transition-all active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Kembali
          </button>
        )}
      </div>
    </header>
  );
}