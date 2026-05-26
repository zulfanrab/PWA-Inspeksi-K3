// src/components/ClientPicker.tsx
// NEW: Komponen picker klien → unit untuk ahli K3 di lapangan
// Max 3 tap sebelum form terbuka (pilih klien → pilih unit → form)

import { useState, useEffect, useCallback, useRef } from 'react';
import { ClientRepository, UnitRepository, type ClientTemplate, type UnitTemplate } from '../db/db';

// ==========================================
// TYPES
// ==========================================

export interface PickedUnit {
  client: ClientTemplate;
  unit: UnitTemplate;
}

interface ClientPickerProps {
  onPick: (picked: PickedUnit) => void;         // dipanggil saat unit dipilih → langsung ke form
  onManual: (objectType: string) => void;        // ahli pilih manual tanpa template
  onCancel: () => void;
}

type PickerStep = 'client' | 'unit';

// ==========================================
// OBJECT TYPES (untuk tombol inspeksi manual)
// ==========================================

const OBJECT_TYPES = [
  { key: 'Angkur',             label: 'Angkur',             desc: 'Safety Anchor',                icon: '⚓' },
  { key: 'PAA',                label: 'PAA',                desc: 'Pesawat Angkat & Angkut',      icon: '🏗️' },
  { key: 'PUBT',               label: 'PUBT',               desc: 'Pesawat Uap & Bejana Tekan',   icon: '🔥' },
  { key: 'PTP',                label: 'PTP',                desc: 'Pesawat Tenaga & Produksi',    icon: '⚙️' },
  { key: 'Listrik',            label: 'Listrik',            desc: 'Instalasi Listrik',            icon: '⚡' },
  { key: 'Penyalur Petir',     label: 'Penyalur Petir',     desc: 'Instalasi Penyalur Petir',     icon: '🌩️' },
  { key: 'Lift',               label: 'Lift / Eskalator',   desc: 'Elevator & Eskalator',         icon: '🛗' },
  { key: 'Proteksi Kebakaran', label: 'Proteksi Kebakaran', desc: 'Instalasi Proteksi Kebakaran', icon: '🧯' },
];

// ==========================================
// HELPERS
// ==========================================

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export function ClientPicker({ onPick, onManual, onCancel }: ClientPickerProps) {
  const [step, setStep] = useState<PickerStep>('client');
  const [showManual, setShowManual] = useState(false);

  // Client step state
  const [clients, setClients] = useState<ClientTemplate[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientLoading, setClientLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<ClientTemplate | null>(null);

  // Unit step state
  const [units, setUnits] = useState<UnitTemplate[]>([]);
  const [unitSearch, setUnitSearch] = useState('');
  const [unitLoading, setUnitLoading] = useState(false);

  const clientSearchRef = useRef<HTMLInputElement>(null);
  const unitSearchRef = useRef<HTMLInputElement>(null);

  // ---- Load clients ----
  const loadClients = useCallback(async () => {
    setClientLoading(true);
    try {
      const data = await ClientRepository.search(clientSearch);
      setClients(data);
    } finally {
      setClientLoading(false);
    }
  }, [clientSearch]);

  // ---- Load units ----
  const loadUnits = useCallback(async () => {
    if (!selectedClient) return;
    setUnitLoading(true);
    try {
      const data = await UnitRepository.searchByClient(selectedClient.id, unitSearch);
      setUnits(data);
    } finally {
      setUnitLoading(false);
    }
  }, [selectedClient, unitSearch]);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => {
    if (step === 'client') {
      setTimeout(() => clientSearchRef.current?.focus(), 100);
    }
  }, [step]);
  useEffect(() => {
    if (step === 'unit') {
      loadUnits();
      setTimeout(() => unitSearchRef.current?.focus(), 100);
    }
  }, [step, loadUnits]);

  // ---- Handlers ----

  const handleSelectClient = (c: ClientTemplate) => {
    setSelectedClient(c);
    setUnitSearch('');
    setStep('unit');
  };

  const handleSelectUnit = (u: UnitTemplate) => {
    if (!selectedClient) return;
    onPick({ client: selectedClient, unit: u });
  };

  const handleBackToClient = () => {
    setSelectedClient(null);
    setStep('client');
    setUnitSearch('');
  };

  // ==========================================
  // RENDER - CLIENT STEP
  // ==========================================

  if (showManual) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowManual(false)}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all text-gray-600"
          >
            ←
          </button>
          <div>
            <h2 className="text-base font-black text-gray-900">Inspeksi Manual</h2>
            <p className="text-xs text-gray-400">Pilih jenis objek K3 tanpa template</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OBJECT_TYPES.map(obj => (
            <button
              key={obj.key}
              onClick={() => onManual(obj.key)}
              className="bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-md rounded-xl p-4 text-left transition-all group active:scale-95"
            >
              <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{obj.icon}</div>
              <p className="text-sm font-black text-gray-900">{obj.label}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">{obj.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'client') {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-gray-900">Pilih Klien</h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Tap 1 dari 2 — lalu pilih unit
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all text-gray-500"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            ref={clientSearchRef}
            type="text"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            placeholder="Cari nama perusahaan klien..."
            className="w-full pl-9 pr-4 py-3 bg-white border border-emerald-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-sm outline-none transition-all"
          />
          {clientSearch && (
            <button
              onClick={() => setClientSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Client List */}
        {clientLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <Spinner /> <span className="text-sm">Memuat klien...</span>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            {clientSearch ? (
              <>
                <div className="text-4xl mb-3 opacity-40">🔍</div>
                <p className="text-sm font-bold text-gray-500">Tidak ditemukan</p>
                <p className="text-xs text-gray-400 mt-1">Coba kata kunci lain</p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3 opacity-40">🏢</div>
                <p className="text-sm font-bold text-gray-500">Belum ada klien</p>
                <p className="text-xs text-gray-400 mt-1">Admin perlu menambahkan klien terlebih dahulu</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map(c => (
              <button
                key={c.id}
                onClick={() => handleSelectClient(c)}
                className="w-full bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-sm rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.98] group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center text-lg transition-all flex-shrink-0">
                    🏢
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900 truncate">{c.name}</p>
                    {c.address && <p className="text-[10px] text-gray-400 truncate mt-0.5">{c.address}</p>}
                  </div>
                  <span className="text-gray-300 group-hover:text-emerald-400 transition-all flex-shrink-0">›</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Manual entry option */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={() => setShowManual(true)}
            className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-emerald-600 transition-all flex items-center justify-center gap-1.5"
          >
            Inspeksi tanpa template (isi manual) →
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER - UNIT STEP
  // ==========================================

  return (
    <div className="space-y-4">
      {/* Header + Back */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBackToClient}
          className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all text-gray-600"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-black text-gray-900">Pilih Unit</h2>
          <p className="text-xs text-emerald-600 font-bold truncate">{selectedClient?.name}</p>
        </div>
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all text-gray-500"
        >
          ✕
        </button>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-emerald-500" />
        <div className="flex-1 h-1.5 rounded-full bg-emerald-200" />
        <p className="text-[10px] font-bold text-gray-400 ml-1">Tap 2 dari 2</p>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          ref={unitSearchRef}
          type="text"
          value={unitSearch}
          onChange={e => setUnitSearch(e.target.value)}
          placeholder="Cari nama unit, nomor seri..."
          className="w-full pl-9 pr-4 py-3 bg-white border border-emerald-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-sm outline-none transition-all"
        />
        {unitSearch && (
          <button
            onClick={() => setUnitSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Unit List */}
      {unitLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Spinner /> <span className="text-sm">Memuat unit...</span>
        </div>
      ) : units.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          {unitSearch ? (
            <>
              <div className="text-4xl mb-3 opacity-40">🔍</div>
              <p className="text-sm font-bold text-gray-500">Tidak ditemukan</p>
              <p className="text-xs text-gray-400 mt-1">Coba kata kunci lain</p>
            </>
          ) : (
            <>
              <div className="text-4xl mb-3 opacity-40">📦</div>
              <p className="text-sm font-bold text-gray-500">Belum ada unit template</p>
              <p className="text-xs text-gray-400 mt-1">Admin perlu menambahkan unit untuk klien ini</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Group by objectType */}
          <UnitListGrouped units={units} onSelect={handleSelectUnit} />
        </div>
      )}

      {/* Skip to manual */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={() => setShowManual(true)}
          className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-emerald-600 transition-all flex items-center justify-center gap-1.5"
        >
          Isi manual tanpa template →
        </button>
      </div>
    </div>
  );
}

// ==========================================
// UNIT LIST GROUPED BY OBJECT TYPE
// ==========================================

const OBJECT_TYPE_MAP: Record<string, { label: string; icon: string }> = {
  'Angkur':             { label: 'Angkur',             icon: '⚓' },
  'PAA':                { label: 'PAA',                icon: '🏗️' },
  'PUBT':               { label: 'PUBT',               icon: '🔥' },
  'PTP':                { label: 'PTP',                icon: '⚙️' },
  'Listrik':            { label: 'Listrik',            icon: '⚡' },
  'Penyalur Petir':     { label: 'Penyalur Petir',     icon: '🌩️' },
  'Lift':               { label: 'Lift / Eskalator',   icon: '🛗' },
  'Proteksi Kebakaran': { label: 'Proteksi Kebakaran', icon: '🧯' },
};

function UnitListGrouped({
  units,
  onSelect,
}: {
  units: UnitTemplate[];
  onSelect: (u: UnitTemplate) => void;
}) {
  // Group by objectType
  const grouped: Record<string, UnitTemplate[]> = {};
  for (const u of units) {
    if (!grouped[u.objectType]) grouped[u.objectType] = [];
    grouped[u.objectType].push(u);
  }

  // If all same type, show flat
  const keys = Object.keys(grouped);
  if (keys.length === 1) {
    return (
      <>
        {grouped[keys[0]].map(u => (
          <UnitPickerCard key={u.id} unit={u} onSelect={() => onSelect(u)} />
        ))}
      </>
    );
  }

  // Multiple types: show grouped
  return (
    <>
      {keys.map(type => (
        <div key={type}>
          <div className="flex items-center gap-1.5 mb-1.5 px-1">
            <span className="text-sm">{OBJECT_TYPE_MAP[type]?.icon || '📦'}</span>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {OBJECT_TYPE_MAP[type]?.label || type}
            </p>
          </div>
          <div className="space-y-2 mb-3">
            {grouped[type].map(u => (
              <UnitPickerCard key={u.id} unit={u} onSelect={() => onSelect(u)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function UnitPickerCard({
  unit,
  onSelect,
}: {
  unit: UnitTemplate;
  onSelect: () => void;
}) {
  const meta = OBJECT_TYPE_MAP[unit.objectType];

  return (
    <button
      onClick={onSelect}
      className="w-full bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-sm rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.98] group"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-50 group-hover:bg-emerald-50 flex items-center justify-center text-lg transition-all flex-shrink-0">
          {meta?.icon || '📦'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 truncate">{unit.label}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {unit.unitData?.nomorSeri && (
              <span className="text-[10px] text-gray-400">S/N: {unit.unitData.nomorSeri}</span>
            )}
            {unit.unitData?.lokasiUnit && (
              <span className="text-[10px] text-emerald-500 font-medium truncate max-w-[120px]">
                📍 {unit.unitData.lokasiUnit}
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="w-8 h-8 rounded-full bg-emerald-500 group-hover:bg-emerald-600 text-white text-sm flex items-center justify-center transition-all shadow-sm">
            ›
          </span>
        </div>
      </div>

      {/* Preview fields */}
      {(unit.unitData?.merekModel || unit.unitData?.nomorUnit) && (
        <div className="mt-2 ml-12 flex items-center gap-3">
          {unit.unitData?.merekModel && (
            <span className="text-[10px] text-gray-400">
              <span className="font-bold">Merek:</span> {unit.unitData.merekModel}
            </span>
          )}
          {unit.unitData?.nomorUnit && (
            <span className="text-[10px] text-gray-400">
              <span className="font-bold">Kode:</span> {unit.unitData.nomorUnit}
            </span>
          )}
        </div>
      )}
    </button>
  );
}