// src/components/SyncHub.tsx

interface SyncProps {
  queue: any[];
  onSync: (id: string) => void;
}

export default function SyncHub({ queue, onSync }: SyncProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#1F2937] to-[#111827] rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-black">Sync Hub</h2>
        <p className="text-sm text-gray-400">Data inspeksi yang menunggu upload.</p>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-10 text-gray-400 font-bold">Semua data sudah sinkron! 🎉</div>
      ) : (
        <div className="space-y-4">
          {queue.map(item => (
            <div key={item.id} className="bg-white p-5 rounded-2xl border border-gray-200 flex justify-between items-center shadow-sm">
              <div>
                {/* BUG FIXED: Ganti jadi namaUnit */}
                <h4 className="font-extrabold text-[#1F2937]">{item.objectType} - {item.unitData?.namaUnit || 'Unit'}</h4>
                <p className="text-xs font-bold text-[#10B981]">{item.clientName}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{item.photoCount} Foto Siap Upload</p>
              </div>
              <button 
                onClick={() => onSync(item.id)}
                className="bg-[#10B981] text-white px-5 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-[#0EA5E9] transition-colors"
              >
                Sync Data
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}