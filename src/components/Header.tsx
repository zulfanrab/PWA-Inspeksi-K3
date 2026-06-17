// src/components/Header.tsx
interface HeaderProps {
  currentView: string;
  setCurrentView: (view: any) => void;
  syncCount: number;
}

export default function Header({ currentView, setCurrentView, syncCount }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200/80 sticky top-0 z-50 shadow-sm px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('HOME')}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#10B981] to-[#064E3B] flex items-center justify-center">
          <span className="text-white font-bold text-xs">K3</span>
        </div>
        <h1 className="text-lg font-black tracking-tight text-[#064E3B] leading-none">
          AKSARA<span className="text-[#10B981]">INSPECT</span>
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {currentView === 'HOME' && (
          <button onClick={() => setCurrentView('SYNC_HUB')} className="relative bg-gray-100 p-2 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            {syncCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">{syncCount}</span>}
          </button>
        )}
        {currentView !== 'HOME' && (
          <button onClick={() => setCurrentView('HOME')} className="text-xs font-bold text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg">Kembali</button>
        )}
      </div>
    </header>
  );
}