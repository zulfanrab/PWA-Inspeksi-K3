// src/components/ClientPicker.tsx
// REVISI QUICK PHOTO / PICKER UNIT:
// 1. Pilihan 1 (Tab "Unit Baru / Siap Foto"): Langsung menampilkan unit yang baru diinput di Admin Panel / masih kosongan fotonya.
// 2. Pilihan 2 (Tab "Per Perusahaan"): Menampilkan daftar perusahaan yang diurutkan dari yang terbaru diinput Admin.
// 3. Status "Belum Ada Foto / Kosongan" vs "Sudah Difoto" terlihat jelas untuk memudahkan inspeksi lapangan.
// 4. Support Dark Mode & Responsif.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ClientRepository,
  UnitRepository,
  SessionRepository,
  db,
  type ClientTemplate,
  type UnitTemplate,
  type UnitWithMeta,
  type InspectionSession,
} from '../db/db';
import { pullTemplatesFromDrive } from '../services/syncService';
import { CustomCamera } from './CustomCamera';

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
  currentUserEmail?: string;
  onDraftCreated?: () => void;
}

type PickerTab = 'recentUnits' | 'byClient';
type UnitFilterMode = 'all' | 'pendingPhotos';

// ==========================================
// OBJECT TYPES (untuk tombol inspeksi manual & icon)
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

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return 'Baru saja';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return new Date(timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export function ClientPicker({ onPick, onManual, onCancel, currentUserEmail, onDraftCreated }: ClientPickerProps) {
  // Mode Tab: 'recentUnits' (Unit Baru) | 'byClient' (Per Perusahaan)
  const [activeTab, setActiveTab] = useState<PickerTab>(() => {
    return (localStorage.getItem('aksara_quick_picker_tab') as PickerTab) || 'recentUnits';
  });

  // Save preference
  useEffect(() => {
    localStorage.setItem('aksara_quick_picker_tab', activeTab);
  }, [activeTab]);

  const [showManual, setShowManual] = useState(false);

  // Quick Camera & Feedback States
  const [quickCameraUnit, setQuickCameraUnit] = useState<PickedUnit | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Data State
  const [recentUnits, setRecentUnits] = useState<UnitWithMeta[]>([]);
  const [clients, setClients] = useState<ClientTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [unitFilter, setUnitFilter] = useState<UnitFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected client for drilling down in 'byClient' tab
  const [selectedClient, setSelectedClient] = useState<ClientTemplate | null>(null);
  const [clientUnits, setClientUnits] = useState<UnitTemplate[]>([]);
  const [clientUnitsLoading, setClientUnitsLoading] = useState(false);
  const [clientUnitSearch, setClientUnitSearch] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---- Load Data Awal ----
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Tampilkan data lokal dulu agar instan dibuka
      const [unitsData, clientsData] = await Promise.all([
        UnitRepository.getAllRecentWithMeta(),
        ClientRepository.getAll('recent'),
      ]);
      setRecentUnits(unitsData);
      setClients(clientsData);
      setLoading(false);

      // 2. Jika online, auto-pull Drive Mirroring agar data yang dihapus device lain langsung lenyap
      if (navigator.onLine) {
        const syncResult = await pullTemplatesFromDrive().catch(() => null);
        if (syncResult && (syncResult.purgedClients > 0 || syncResult.purgedUnits > 0 || syncResult.pulledClients > 0)) {
          const [updatedUnits, updatedClients] = await Promise.all([
            UnitRepository.getAllRecentWithMeta(),
            ClientRepository.getAll('recent'),
          ]);
          setRecentUnits(updatedUnits);
          setClients(updatedClients);
        }
      }
    } catch (err) {
      console.error('[ClientPicker] Error loading data:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // ---- Load All Units for Selected Client (Dimuat sekali saat klien dipilih) ----
  useEffect(() => {
    if (!selectedClient) {
      setClientUnits([]);
      return;
    }
    let isCancelled = false;
    setClientUnitsLoading(true);
    UnitRepository.getByClient(selectedClient.id)
      .then((units) => {
        if (!isCancelled) {
          setClientUnits(units);
          setClientUnitsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[ClientPicker] Error load client units:', err);
        if (!isCancelled) setClientUnitsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [selectedClient]);

  // Filter unit milik klien secara in-memory (bebas jitter/spinner saat mengetik)
  const filteredClientUnits = useMemo(() => {
    const q = clientUnitSearch.toLowerCase().trim();
    if (!q) return clientUnits;
    return clientUnits.filter(
      (u) =>
        u.label.toLowerCase().includes(q) ||
        u.objectType.toLowerCase().includes(q) ||
        (u.unitData?.nomorSeri || '').toLowerCase().includes(q) ||
        (u.unitData?.lokasiUnit || '').toLowerCase().includes(q)
    );
  }, [clientUnits, clientUnitSearch]);

  // Statistik per Klien
  const clientStatsMap = useMemo(() => {
    const map = new Map<string, { total: number; pendingPhotos: number }>();
    for (const u of recentUnits) {
      const prev = map.get(u.clientId) || { total: 0, pendingPhotos: 0 };
      map.set(u.clientId, {
        total: prev.total + 1,
        pendingPhotos: prev.pendingPhotos + (u.hasPhotos ? 0 : 1),
      });
    }
    return map;
  }, [recentUnits]);

  // Filtered Recent Units
  const filteredUnits = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return recentUnits.filter((u) => {
      // Filter status foto
      if (unitFilter === 'pendingPhotos' && u.hasPhotos) {
        return false;
      }
      // Search
      if (!q) return true;
      const matchLabel = u.label.toLowerCase().includes(q);
      const matchClient = u.clientName.toLowerCase().includes(q);
      const matchType = u.objectType.toLowerCase().includes(q);
      const matchSn = (u.unitData?.nomorSeri || '').toLowerCase().includes(q);
      const matchLokasi = (u.unitData?.lokasiUnit || '').toLowerCase().includes(q);
      const matchModel = (u.unitData?.merekModel || '').toLowerCase().includes(q);
      return matchLabel || matchClient || matchType || matchSn || matchLokasi || matchModel;
    });
  }, [recentUnits, unitFilter, searchQuery]);

  // Filtered Clients (Diurutkan terbaru diinput Admin)
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.address && c.address.toLowerCase().includes(q))
      );
    });
  }, [clients, searchQuery]);

  // Hitung berapa unit yang masih kosongan fotonya secara global
  const totalPendingUnits = useMemo(() => {
    return recentUnits.filter((u) => !u.hasPhotos).length;
  }, [recentUnits]);

  // ---- Handlers ----
  const handleSelectRecentUnit = (u: UnitWithMeta) => {
    if (u.client) {
      onPick({ client: u.client, unit: u });
    } else {
      ClientRepository.getById(u.clientId).then((foundClient) => {
        if (foundClient) {
          onPick({ client: foundClient, unit: u });
        } else {
          onPick({
            client: {
              id: u.clientId,
              name: u.clientName,
              createdBy: 'system',
              createdAt: Date.now(),
            },
            unit: u,
          });
        }
      });
    }
  };

  const handleQuickCameraRecent = async (u: UnitWithMeta) => {
    if (u.client) {
      setQuickCameraUnit({ client: u.client, unit: u });
    } else {
      const foundClient = await ClientRepository.getById(u.clientId);
      if (foundClient) {
        setQuickCameraUnit({ client: foundClient, unit: u });
      } else {
        setQuickCameraUnit({
          client: {
            id: u.clientId,
            name: u.clientName,
            createdBy: 'system',
            createdAt: Date.now(),
          },
          unit: u,
        });
      }
    }
  };

  const handleSelectClient = (c: ClientTemplate) => {
    setSelectedClient(c);
    setClientUnitSearch('');
  };

  const handleBackFromClient = () => {
    setSelectedClient(null);
    setClientUnitSearch('');
    setQuickCameraUnit(null);
  };

  const handleSelectDrilledUnit = (u: UnitTemplate) => {
    if (!selectedClient) return;
    onPick({ client: selectedClient, unit: u });
  };

  const handleQuickCameraDrilled = (u: UnitTemplate) => {
    if (!selectedClient) return;
    setQuickCameraUnit({ client: selectedClient, unit: u });
  };

  // Simpan foto langsung ke draft (Auto-Drafting)
  const handleSaveQuickPhotos = async (target: PickedUnit, capturedPhotos: string[]) => {
    if (capturedPhotos.length === 0) return;
    try {
      // 1. Cek apakah draft untuk unit ini sudah ada
      const allDrafts = await db.inspection_sessions
        .where('status')
        .equals('draft')
        .toArray();

      const existingDraft = allDrafts.find((s) => s.templateUnitId === target.unit.id);

      if (existingDraft) {
        // Tambahkan foto ke draft yang sudah ada
        await SessionRepository.update(existingDraft.id, { updatedAt: Date.now() }, capturedPhotos, []);
        setToastMessage(`✓ ${capturedPhotos.length} foto baru ditambahkan ke draft ${target.unit.label}`);
      } else {
        // Buat draft baru otomatis dengan data dari template Admin Panel
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
        const sessionData: Omit<InspectionSession, 'id' | 'createdAt'> = {
          clientName: target.client.name,
          objectType: target.unit.objectType,
          unitData: {
            tanggal_inspeksi: today,
            sifat_pemeriksaan: target.unit.unitData?.sifat_pemeriksaan || 'Baru',
            ...target.unit.unitData,
          },
          status: 'draft',
          templateClientId: target.client.id,
          templateUnitId: target.unit.id,
          inspectorEmail: currentUserEmail || '',
          uploadStatus: 'pending_upload',
          photosUploaded: 0,
        };
        await SessionRepository.create(sessionData, capturedPhotos);
        setToastMessage(`✓ Draft tersimpan: ${target.unit.label} (${capturedPhotos.length} foto)`);
      }

      // Refresh data agar badge unit langsung berubah menjadi "📷 X Foto"
      await loadInitialData();
      if (selectedClient) {
        const units = await UnitRepository.getByClient(selectedClient.id);
        setClientUnits(units);
      }
      onDraftCreated?.();
    } catch (err) {
      console.error('Failed to quick save photos:', err);
      alert('Gagal menyimpan foto ke draft');
    }
  };

  // ==========================================
  // VIEW: MANUAL INSPECTION (TANPA TEMPLATE)
  // ==========================================
  if (showManual) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowManual(false)}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 flex items-center justify-center transition-all text-gray-600 dark:text-gray-200"
          >
            ←
          </button>
          <div>
            <h2 className="text-base font-black text-gray-900 dark:text-white">Inspeksi Manual</h2>
            <p className="text-xs text-gray-400">Pilih jenis objek K3 tanpa template</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {OBJECT_TYPES.map((obj) => (
            <button
              key={obj.key}
              onClick={() => onManual(obj.key)}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-md rounded-xl p-4 text-left transition-all group active:scale-95"
            >
              <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{obj.icon}</div>
              <p className="text-sm font-black text-gray-900 dark:text-white">{obj.label}</p>
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">{obj.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: DRILL-DOWN UNITS MILIK KLIEN TERTENTU
  // ==========================================
  if (selectedClient) {
    return (
      <div className="space-y-4">
        {/* Header + Back */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackFromClient}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 flex items-center justify-center transition-all text-gray-600 dark:text-gray-200"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-gray-900 dark:text-white truncate">Pilih Unit Klien</h2>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold truncate flex items-center gap-1">
              <span>🏢</span> {selectedClient.name}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 flex items-center justify-center transition-all text-gray-500 dark:text-gray-400"
          >
            ✕
          </button>
        </div>

        {/* Search in client units */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            value={clientUnitSearch}
            onChange={(e) => setClientUnitSearch(e.target.value)}
            placeholder="Cari nama unit, nomor seri di klien ini..."
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-sm outline-none transition-all text-gray-900 dark:text-white"
          />
          {clientUnitSearch && (
            <button
              onClick={() => setClientUnitSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          )}
        </div>

        {/* List Units */}
        {clientUnitsLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <Spinner /> <span className="text-sm">Memuat unit klien...</span>
          </div>
        ) : filteredClientUnits.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
            <div className="text-4xl mb-2 opacity-50">📦</div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              {clientUnitSearch ? 'Unit tidak ditemukan' : 'Belum ada unit untuk klien ini'}
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              {clientUnitSearch
                ? 'Coba gunakan kata kunci pencarian yang lain'
                : `Admin belum menambahkan unit template pada perusahaan ${selectedClient.name}.`}
            </p>
            {!clientUnitSearch && (
              <button
                onClick={() => setShowManual(true)}
                className="mt-4 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold rounded-xl transition-all"
              >
                Inspeksi Manual (Ketik Sendiri) →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredClientUnits.map((u) => {
              const meta = OBJECT_TYPE_MAP[u.objectType];
              const fullMeta = recentUnits.find((ru) => ru.id === u.id);
              const hasPhotos = fullMeta?.hasPhotos ?? false;

              return (
                <button
                  key={u.id}
                  onClick={() => handleSelectDrilledUnit(u)}
                  className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md rounded-2xl p-4 text-left transition-all active:scale-[0.99] group relative"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-700/60 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 flex items-center justify-center text-xl flex-shrink-0 transition-colors">
                      {meta?.icon || '📦'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                          {u.objectType}
                        </span>
                        {!hasPhotos ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Belum Ada Foto
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                            ✓ Ada Foto
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-black text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                        {u.label}
                      </h4>

                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                        {u.unitData?.nomorSeri && (
                          <span>S/N: <strong className="text-gray-600 dark:text-gray-300">{u.unitData.nomorSeri}</strong></span>
                        )}
                        {u.unitData?.lokasiUnit && (
                          <span className="truncate max-w-[140px]">📍 {u.unitData.lokasiUnit}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0 self-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickCameraDrilled(u);
                        }}
                        className="w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-90 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all hover:scale-105"
                        title="Jepret Foto Langsung"
                        aria-label="Ambil foto unit ini"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Toast Notification ── */}
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-gray-900/90 dark:bg-emerald-950/95 text-white text-xs font-bold rounded-2xl shadow-2xl border border-emerald-500/30 backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <span className="text-emerald-400 text-sm">✅</span>
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-gray-400 hover:text-white text-xs"
              aria-label="Tutup notifikasi"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Direct Quick Camera Overlay ── */}
        {quickCameraUnit && (
          <CustomCamera
            unitLabel={quickCameraUnit.unit.label}
            clientName={quickCameraUnit.client.name}
            onCapture={async (photos) => {
              await handleSaveQuickPhotos(quickCameraUnit, photos);
              setQuickCameraUnit(null);
            }}
            onClose={() => setQuickCameraUnit(null)}
          />
        )}
      </div>
    );
  }

  // ==========================================
  // MAIN VIEW: TABS (UNIT BARU vs PER PERUSAHAAN)
  // ==========================================
  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span>⚡</span> Quick Photo & Inspeksi
          </h2>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Pilih unit baru atau perusahaan yang baru diinput Admin
          </p>
        </div>
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 flex items-center justify-center transition-all text-gray-500 dark:text-gray-400"
          title="Tutup"
        >
          ✕
        </button>
      </div>

      {/* Two Tabs Switcher (Persis seperti di Riwayat) */}
      <div className="flex gap-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-2xl">
        <button
          onClick={() => {
            setActiveTab('recentUnits');
            setSearchQuery('');
          }}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'recentUnits'
              ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <span>⚡ Unit Baru / Siap Foto</span>
          {totalPendingUnits > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
              {totalPendingUnits}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('byClient');
            setSearchQuery('');
          }}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'byClient'
              ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <span>🏢 Per Perusahaan</span>
          <span className="text-[10px] text-gray-400 font-bold">
            ({clients.length})
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === 'recentUnits'
              ? 'Cari nama unit, nomor seri, jenis objek, atau klien...'
              : 'Cari nama perusahaan klien baru...'
          }
          className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-sm outline-none transition-all placeholder:text-gray-400 text-gray-900 dark:text-white"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* ============================================================== */}
      {/* TAB 1: UNIT BARU / SIAP FOTO (DIRECT UNIT LIST)                */}
      {/* ============================================================== */}
      {activeTab === 'recentUnits' && (
        <div className="space-y-3">
          {/* Filter Sub-Chips: Semua vs Belum Difoto */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setUnitFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                unitFilter === 'all'
                  ? 'bg-gray-900 dark:bg-emerald-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              Semua Unit ({recentUnits.length})
            </button>
            <button
              onClick={() => setUnitFilter('pendingPhotos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                unitFilter === 'pendingPhotos'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200 dark:border-amber-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Belum Ada Foto ({totalPendingUnits})
            </button>
          </div>

          {/* List Units */}
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Spinner /> <span className="text-sm">Memuat unit terbaru...</span>
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
              <div className="text-4xl mb-2 opacity-50">✨</div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                {unitFilter === 'pendingPhotos'
                  ? 'Semua unit sudah memiliki foto / data!'
                  : searchQuery
                  ? 'Tidak ada unit yang cocok'
                  : 'Belum ada unit yang diinput'}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                {searchQuery
                  ? 'Coba gunakan kata kunci pencarian yang lain'
                  : 'Admin dapat menambahkan klien & unit baru di Admin Panel.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredUnits.map((u) => {
                const meta = OBJECT_TYPE_MAP[u.objectType];
                const relativeTime = formatRelativeTime(u.updatedAt || u.createdAt);

                return (
                  <button
                    key={u.id}
                    onClick={() => handleSelectRecentUnit(u)}
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md rounded-2xl p-4 text-left transition-all active:scale-[0.99] group relative"
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon Objek K3 */}
                      <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-700/60 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 flex items-center justify-center text-xl flex-shrink-0 transition-colors border border-gray-100 dark:border-slate-700 group-hover:border-emerald-200">
                        {meta?.icon || '📦'}
                      </div>

                      {/* Info Unit */}
                      <div className="flex-1 min-w-0">
                        {/* Header Badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 truncate max-w-[150px]">
                            🏢 {u.clientName}
                          </span>
                          {!u.hasPhotos ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1 shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Belum Ada Foto
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                              📷 {u.photoCount} Foto
                            </span>
                          )}
                          {relativeTime && (
                            <span className="text-[10px] text-gray-400 ml-auto">
                              {relativeTime}
                            </span>
                          )}
                        </div>

                        {/* Nama Unit */}
                        <h4 className="text-sm font-black text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                          {u.label}
                        </h4>

                        {/* Detail Spesifik */}
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">
                            Jenis: <strong className="text-gray-700 dark:text-gray-300">{u.objectType}</strong>
                          </span>
                          {u.unitData?.nomorSeri && (
                            <span>
                              S/N: <strong className="text-gray-700 dark:text-gray-300">{u.unitData.nomorSeri}</strong>
                            </span>
                          )}
                          {u.unitData?.lokasiUnit && (
                            <span className="text-emerald-600 dark:text-emerald-400 truncate max-w-[130px]">
                              📍 {u.unitData.lokasiUnit}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Tombol Kamera Cepat */}
                      <div className="flex-shrink-0 self-center pl-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickCameraRecent(u);
                          }}
                          className="w-11 h-11 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-90 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all hover:scale-105"
                          title="Jepret Foto Langsung"
                          aria-label="Ambil foto unit ini"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: PER PERUSAHAAN (KLIEN BARU ADMIN FIRST)                */}
      {/* ============================================================== */}
      {activeTab === 'byClient' && (
        <div className="space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Spinner /> <span className="text-sm">Memuat daftar perusahaan...</span>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-6">
              <div className="text-4xl mb-2 opacity-50">🏢</div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                {searchQuery ? 'Perusahaan tidak ditemukan' : 'Belum ada perusahaan'}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Tambahkan perusahaan dan unit baru melalui Admin Panel.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredClients.map((c) => {
                const stats = clientStatsMap.get(c.id) || { total: 0, pendingPhotos: 0 };
                const relativeTime = formatRelativeTime(c.updatedAt || c.createdAt);
                const isNew = Date.now() - (c.createdAt || 0) < 3 * 86400 * 1000; // diinput 3 hari terakhir

                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md rounded-2xl p-4 text-left transition-all active:scale-[0.99] group"
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Icon Perusahaan */}
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50 flex items-center justify-center text-xl flex-shrink-0 transition-colors">
                        🏢
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-sm font-black text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                            {c.name}
                          </h4>
                          {isNew && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-white leading-none">
                              Baru
                            </span>
                          )}
                        </div>

                        {c.address && (
                          <p className="text-[11px] text-gray-400 truncate mb-1">
                            📍 {c.address}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                            {stats.total} Unit Terdaftar
                          </span>
                          {stats.pendingPhotos > 0 && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              {stats.pendingPhotos} Belum Difoto
                            </span>
                          )}
                          {relativeTime && (
                            <span className="text-[10px] text-gray-400 ml-auto">
                              {relativeTime}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-gray-300 group-hover:text-emerald-500 transition-all text-xl flex-shrink-0">
                        ›
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Manual Inspection Option Footer */}
      <div className="pt-3 border-t border-gray-100 dark:border-slate-800 text-center">
        <button
          onClick={() => setShowManual(true)}
          className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1 inline-flex items-center gap-1"
        >
          <span>Inspeksi tanpa template (isi manual)</span>
          <span>→</span>
        </button>
      </div>

      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-gray-900/90 dark:bg-emerald-950/95 text-white text-xs font-bold rounded-2xl shadow-2xl border border-emerald-500/30 backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span className="text-emerald-400 text-sm">✅</span>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-gray-400 hover:text-white text-xs"
            aria-label="Tutup notifikasi"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Direct Quick Camera Overlay ── */}
      {quickCameraUnit && (
        <CustomCamera
          unitLabel={quickCameraUnit.unit.label}
          clientName={quickCameraUnit.client.name}
          onCapture={async (photos) => {
            await handleSaveQuickPhotos(quickCameraUnit, photos);
            setQuickCameraUnit(null);
          }}
          onClose={() => setQuickCameraUnit(null)}
        />
      )}
    </div>
  );
}
