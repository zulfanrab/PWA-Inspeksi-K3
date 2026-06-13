// Document3DLoading.tsx
export function Document3DLoading() {
  return (
    <div className="flex flex-col items-center gap-5">
      <style>{`
        @keyframes rotate-3d {
          0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          25% { transform: rotateX(20deg) rotateY(45deg) rotateZ(-15deg); }
          50% { transform: rotateX(0deg) rotateY(90deg) rotateZ(0deg); }
          75% { transform: rotateX(-20deg) rotateY(45deg) rotateZ(15deg); }
          100% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
        }

        @keyframes magnifier-orbit {
          0% { transform: translateX(-80px) translateY(-40px) scale(0.8); }
          25% { transform: translateX(60px) translateY(-50px) scale(1); }
          50% { transform: translateX(80px) translateY(60px) scale(0.9); }
          75% { transform: translateX(-60px) translateY(50px) scale(1); }
          100% { transform: translateX(-80px) translateY(-40px) scale(0.8); }
        }

        @keyframes magnifier-glow {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.4)); }
          50% { filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.8)); }
        }

        .container-3d { perspective: 1200px; }
        .docs-stack { animation: rotate-3d 5s ease-in-out infinite; transform-style: preserve-3d; }
        .magnifier { animation: magnifier-orbit 5s ease-in-out infinite, magnifier-glow 2s ease-in-out infinite; }
      `}</style>

      <div className="w-full h-48 flex items-center justify-center" style={{perspective: '1200px'}}>
        <svg width="280" height="200" viewBox="0 0 280 200" fill="none" style={{ filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.1))' }}>
          
          {/* 3D Rotating Documents */}
          <g className="docs-stack">
            {/* Back doc */}
            <g transform="translate(0, 0)">
              <rect x="80" y="60" width="60" height="80" fill="#F0F9FF" stroke="#0EA5E9" strokeWidth="2" rx="4" opacity="0.6" />
              <line x1="92" y1="75" x2="128" y2="75" stroke="#0EA5E9" strokeWidth="1" opacity="0.5" />
              <line x1="92" y1="90" x2="128" y2="90" stroke="#0EA5E9" strokeWidth="1" opacity="0.5" />
              <line x1="92" y1="105" x2="120" y2="105" stroke="#0EA5E9" strokeWidth="1" opacity="0.5" />
              <line x1="92" y1="120" x2="128" y2="120" stroke="#0EA5E9" strokeWidth="1" opacity="0.5" />
            </g>

            {/* Middle doc */}
            <g transform="translate(6, -6)">
              <rect x="80" y="60" width="60" height="80" fill="#FFFFFF" stroke="#0EA5E9" strokeWidth="2" rx="4" />
              <line x1="92" y1="75" x2="128" y2="75" stroke="#0EA5E9" strokeWidth="1.5" />
              <line x1="92" y1="90" x2="128" y2="90" stroke="#0EA5E9" strokeWidth="1.5" />
              <line x1="92" y1="105" x2="120" y2="105" stroke="#0EA5E9" strokeWidth="1.5" />
              <line x1="92" y1="120" x2="128" y2="120" stroke="#0EA5E9" strokeWidth="1.5" />
            </g>

            {/* Front doc (highlighted) */}
            <g transform="translate(12, -12)">
              <rect x="80" y="60" width="60" height="80" fill="#FFFFFF" stroke="#0EA5E9" strokeWidth="2.5" rx="4" style={{ filter: 'drop-shadow(0 4px 8px rgba(14, 165, 233, 0.2))' }} />
              <circle cx="88" cy="73" r="3" fill="#10B981" />
              <line x1="95" y1="73" x2="128" y2="73" stroke="#0EA5E9" strokeWidth="1.5" />
              <circle cx="88" cy="88" r="3" fill="#10B981" />
              <line x1="95" y1="88" x2="128" y2="88" stroke="#0EA5E9" strokeWidth="1.5" />
              <circle cx="88" cy="103" r="3" fill="#10B981" />
              <line x1="95" y1="103" x2="120" y2="103" stroke="#0EA5E9" strokeWidth="1.5" />
              <circle cx="88" cy="118" r="3" fill="#10B981" />
              <line x1="95" y1="118" x2="128" y2="118" stroke="#0EA5E9" strokeWidth="1.5" />
            </g>
          </g>

          {/* Magnifying glass orbiting */}
          <g className="magnifier">
            <circle cx="140" cy="80" r="22" fill="none" stroke="#3B82F6" strokeWidth="3" />
            <circle cx="140" cy="80" r="19" fill="none" stroke="#93C5FD" strokeWidth="1" opacity="0.6" />
            <circle cx="130" cy="68" r="6" fill="none" stroke="#60A5FA" strokeWidth="1.5" opacity="0.8" />
            <line x1="158" y1="98" x2="188" y2="128" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
            <circle cx="172" cy="112" r="1.5" fill="#3B82F6" />
          </g>

          {/* Checkmark */}
          <g opacity="0.7">
            <circle cx="200" cy="70" r="16" fill="none" stroke="#10B981" strokeWidth="2" />
            <path d="M 195 75 L 199 79 L 206 68" stroke="#10B981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>

        </svg>
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-gray-900">Memeriksa Dokumen</p>
        <p className="text-xs text-gray-500 mt-1">Validasi & proses file berlangsung</p>
      </div>
    </div>
  );
}