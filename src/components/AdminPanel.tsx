// src/components/AdminPanel.tsx
// NEW: Panel admin untuk kelola Klien & Unit Template

import { useState, useEffect, useCallback } from 'react';
import {
  ClientRepository,
  UnitRepository,
  RoleRepository,
  type ClientTemplate,
  type UnitTemplate,
  type UserRole,
} from '../db/db';

import { pushTemplatesToDrive } from '../services/syncService';

// ==========================================
// FIELD DEFINITIONS (copy dari App.tsx agar AdminPanel mandiri)
// ==========================================

export type FieldType = 'text' | 'number' | 'select' | 'textarea';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

const COMMON_FIELDS: FieldDef[] = [
  { name: 'namaUnit',       label: 'Nama Unit / Deskripsi',    type: 'text',     required: true,  placeholder: 'Contoh: Overhead Crane #1' },
  { name: 'nomorSeri',      label: 'Nomor Seri',               type: 'text',     required: true,  placeholder: 'Contoh: SN-2024-001' },
  { name: 'nomorUnit',      label: 'Nomor Unit / Kode Alat',   type: 'text',     placeholder: 'Contoh: KRN-01' },
  { name: 'merekModel',     label: 'Merek / Model',            type: 'text',     placeholder: 'Contoh: Kito ER2' },
  { name: 'pabrikPembuat',  label: 'Pabrik Pembuat',           type: 'text',     placeholder: 'Contoh: PT. Kito Indonesia' },
  { name: 'tahunPembuatan', label: 'Tahun Pembuatan',          type: 'number',   placeholder: '2020' },
  { name: 'lokasiUnit',     label: 'Lokasi / Penempatan Unit', type: 'text',     placeholder: 'Contoh: Gedung A, Lantai 3' },
  { name: 'catatan',        label: 'Catatan Tambahan',         type: 'textarea', placeholder: 'Kondisi umum, temuan awal, dll.' },
];

const SPECIFIC_FIELDS: Record<string, FieldDef[]> = {
  'Angkur': [
    { name: 'jenisAngkur',         label: 'Jenis Angkur',              type: 'select', required: true,
      options: ['Chemical Anchor', 'Mechanical Anchor', 'Wedge Anchor', 'Sleeve Anchor', 'Expansion Anchor', 'Lainnya'] },
    { name: 'kapasitasTarik',      label: 'Kapasitas Tarik (MBS)',      type: 'number', unit: 'kN',  required: true },
    { name: 'kapasitasGeser',      label: 'Kapasitas Geser',            type: 'number', unit: 'kN' },
    { name: 'diameterAngkur',      label: 'Diameter Angkur',            type: 'number', unit: 'mm',  required: true },
    { name: 'kedalamanPasang',     label: 'Kedalaman Pasang',           type: 'number', unit: 'mm',  required: true },
    { name: 'materialAngkur',      label: 'Material Angkur',            type: 'select',
      options: ['Stainless Steel 316', 'Stainless Steel 304', 'Galvanized Steel', 'Carbon Steel', 'Lainnya'] },
    { name: 'jumlahAngkur',        label: 'Jumlah Angkur Diperiksa',    type: 'number', unit: 'pcs', required: true },
    { name: 'lokasiKodeTitik',     label: 'Lokasi / Kode Titik',        type: 'text',   placeholder: 'Contoh: Grid-A1, Lantai 5' },
  ],
  'PAA': [
    { name: 'jenisPAA',            label: 'Jenis Pesawat Angkat',       type: 'select', required: true,
      options: ['Overhead Crane', 'Mobile Crane', 'Tower Crane', 'Crawler Crane', 'Forklift', 'Reach Stacker', 'Hoist (Electric)', 'Hoist (Manual)', 'Gondola', 'Pallet Truck', 'Lainnya'] },
    { name: 'kapasitasAngkat',     label: 'Kapasitas Angkat Maksimum',  type: 'number', unit: 'Ton',  required: true },
    { name: 'jangkauanBoom',       label: 'Jangkauan / Span Boom',      type: 'number', unit: 'm' },
    { name: 'tinggiAngkatMaks',    label: 'Tinggi Angkat Maksimum',     type: 'number', unit: 'm' },
    { name: 'jenisPenggerak',      label: 'Jenis Penggerak',            type: 'select',
      options: ['Electric', 'Diesel', 'Hydraulic', 'Manual', 'Pneumatic', 'Lainnya'] },
    { name: 'nomorPlatRegistrasi', label: 'Nomor Plat / Registrasi',    type: 'text',   placeholder: 'Contoh: B 1234 XYZ' },
    { name: 'nomorIzinOperasi',    label: 'Nomor Izin Operasi',         type: 'text',   placeholder: 'Nomor SK/Izin dari Disnaker' },
  ],
  'PUBT': [
    { name: 'jenisPUBT',           label: 'Jenis Pesawat Uap/Bejana',   type: 'select', required: true,
      options: ['Boiler Pipa Api', 'Boiler Pipa Air', 'Bejana Tekan', 'Tangki Refrigerasi', 'Autoclave', 'Heat Exchanger', 'Pressure Vessel', 'Air Receiver', 'Lainnya'] },
    { name: 'volume',              label: 'Volume',                      type: 'number', unit: 'Liter', required: true },
    { name: 'tekananKerjaMaks',    label: 'Tekanan Kerja Maksimum',      type: 'number', unit: 'Bar',   required: true },
    { name: 'temperaturKerja',     label: 'Temperatur Kerja',            type: 'number', unit: '°C' },
    { name: 'mediaIsi',            label: 'Media Isi',                   type: 'select',
      options: ['Steam / Uap Air', 'Air Bertekanan', 'Gas Nitrogen', 'Gas CO2', 'Freon/Refrigerant', 'Oli Hidraulik', 'BBM / Avtur', 'LPG / LNG', 'Lainnya'] },
    { name: 'kapasitasProduksi',   label: 'Kapasitas Produksi',          type: 'number', unit: 'kg/jam' },
    { name: 'nomorNDT',            label: 'Nomor NDT Terakhir',          type: 'text',   placeholder: 'Nomor sertifikat NDT' },
    { name: 'tanggalNDT',          label: 'Tanggal NDT Terakhir',        type: 'text',   placeholder: 'YYYY-MM-DD' },
  ],
  'PTP': [
    { name: 'jenisPTP',            label: 'Jenis Pesawat Tenaga',        type: 'select', required: true,
      options: ['Motor Listrik', 'Generator / Genset', 'Kompresor Udara', 'Kompresor Gas', 'Pompa Sentrifugal', 'Pompa Reciprocating', 'Mesin Produksi', 'Turbin', 'Lainnya'] },
    { name: 'daya',                label: 'Daya',                        type: 'number', unit: 'kW',     required: true },
    { name: 'dayaHP',              label: 'Daya (HP)',                   type: 'number', unit: 'HP' },
    { name: 'putaranRPM',          label: 'Putaran',                     type: 'number', unit: 'RPM' },
    { name: 'mediaKerja',          label: 'Media Kerja',                 type: 'select',
      options: ['Udara', 'Air', 'Oli', 'Gas', 'Steam', 'Bahan Kimia', 'Lainnya'] },
    { name: 'tekananKerjaPTP',     label: 'Tekanan Kerja',               type: 'number', unit: 'Bar' },
    { name: 'tegangan',            label: 'Tegangan Listrik',            type: 'number', unit: 'Volt' },
    { name: 'arusListrik',         label: 'Arus Listrik',                type: 'number', unit: 'Ampere' },
  ],
  'Listrik': [
    { name: 'jenisListrik',        label: 'Jenis Instalasi',             type: 'select', required: true,
      options: ['Instalasi Listrik Umum', 'Panel Distribusi (MDP)', 'Panel Distribusi (SDP)', 'Transformator', 'Genset / UPS', 'Instalasi Hazardous Area', 'Lainnya'] },
    { name: 'dayaTerpasang',       label: 'Daya Terpasang',              type: 'number', unit: 'kVA',   required: true },
    { name: 'teganganSistem',      label: 'Tegangan Sistem',             type: 'select',
      options: ['380 V (3 Phase)', '220 V (1 Phase)', '20 kV (Menengah)', '150 kV (Tinggi)', 'Lainnya'] },
    { name: 'luasArea',            label: 'Luas Area Instalasi',         type: 'number', unit: 'm²' },
    { name: 'jumlahPanel',         label: 'Jumlah Panel',                type: 'number', unit: 'unit' },
    { name: 'tahananIsolasi',      label: 'Tahanan Isolasi',             type: 'number', unit: 'MΩ' },
    { name: 'nilaiGrounding',      label: 'Nilai Grounding',             type: 'number', unit: 'Ω' },
    { name: 'nomorSertifikatSLO',  label: 'Nomor Sertifikat SLO',        type: 'text',   placeholder: 'Nomor SLO dari PLN/Disnaker' },
  ],
  'Penyalur Petir': [
    { name: 'jenisPenyalurPetir',  label: 'Jenis Sistem Penangkal',      type: 'select', required: true,
      options: ['Sistem Franklin (Konvensional)', 'Sistem Faraday (Sangkar)', 'Early Streamer Emission (ESE)', 'Sistem Kawat Catenary', 'Lainnya'] },
    { name: 'luasAreaPetir',       label: 'Luas Area yang Dilindungi',   type: 'number', unit: 'm²',   required: true },
    { name: 'tinggiTiangPenangkal',label: 'Tinggi Tiang Penangkal',      type: 'number', unit: 'm',    required: true },
    { name: 'tahananPembumian',    label: 'Nilai Tahanan Pembumian',     type: 'number', unit: 'Ω',    required: true },
    { name: 'jumlahTitikGrounding',label: 'Jumlah Titik Grounding',      type: 'number', unit: 'titik' },
    { name: 'jenisElektroda',      label: 'Jenis Elektroda Pembumian',   type: 'select',
      options: ['Copper Rod', 'Copper Plate', 'Copper Strip', 'Galvanized Rod', 'Lainnya'] },
    { name: 'kedalamanElektroda',  label: 'Kedalaman Elektroda',         type: 'number', unit: 'm' },
  ],
  'Lift': [
    { name: 'jenisLift',           label: 'Jenis Elevator/Eskalator',    type: 'select', required: true,
      options: ['Lift Penumpang', 'Lift Barang', 'Lift Barang + Penumpang', 'Lift Panoramik', 'Lift Rumah Sakit (Dumbwaiter)', 'Eskalator', 'Moving Walk / Travelator', 'Lainnya'] },
    { name: 'kapasitasKg',         label: 'Kapasitas',                   type: 'number', unit: 'kg',   required: true },
    { name: 'kapasitasOrang',      label: 'Kapasitas',                   type: 'number', unit: 'orang' },
    { name: 'kecepatanLift',       label: 'Kecepatan',                   type: 'number', unit: 'm/s',  required: true },
    { name: 'jumlahLantai',        label: 'Jumlah Lantai / Stop',        type: 'number', unit: 'lantai', required: true },
    { name: 'jenisPenggerakLift',  label: 'Jenis Penggerak',             type: 'select',
      options: ['Traction (MRL)', 'Traction (Machine Room)', 'Hydraulic', 'Rack & Pinion', 'Lainnya'] },
    { name: 'nomorIzinLift',       label: 'Nomor Izin Operasi',          type: 'text',   placeholder: 'Nomor SK dari Disnaker' },
    { name: 'tanggalIzinBerlaku',  label: 'Berlaku Hingga',              type: 'text',   placeholder: 'YYYY-MM-DD' },
  ],
  'Proteksi Kebakaran': [
    { name: 'jenisProteksi',       label: 'Jenis Sistem Proteksi',       type: 'select', required: true,
      options: ['APAR (Portable)', 'Hydrant Box + Pillar', 'Sprinkler Otomatis', 'Fire Alarm System', 'Clean Agent System (FM200, NOVEC)', 'Foam System', 'CO2 System', 'Lainnya'] },
    { name: 'jumlahUnitAPAR',      label: 'Jumlah Unit APAR',            type: 'number', unit: 'unit' },
    { name: 'kapasitasMedia',      label: 'Kapasitas Media Pemadam',     type: 'number', unit: 'kg',   required: true },
    { name: 'luasAreaProteksi',    label: 'Luas Area Proteksi',          type: 'number', unit: 'm²',   required: true },
    { name: 'jumlahHeadSprinkler', label: 'Jumlah Head Sprinkler',       type: 'number', unit: 'pcs' },
    { name: 'tekananSistem',       label: 'Tekanan Sistem',              type: 'number', unit: 'Bar',  required: true },
    { name: 'mediaPemadam',        label: 'Jenis Media Pemadam',         type: 'select',
      options: ['Dry Chemical Powder', 'CO2', 'AFFF Foam', 'FM200', 'NOVEC 1230', 'Halon', 'Air (Water Mist)', 'Lainnya'] },
    { name: 'jumlahHydrant',       label: 'Jumlah Hydrant',              type: 'number', unit: 'unit' },
  ],
};

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
// TYPES
// ==========================================

type AdminTab = 'clients' | 'roles';
type ClientSubView = 'list' | 'form' | 'units' | 'unit-form';

interface AdminPanelProps {
  currentUserEmail: string;
  onClose: () => void;
}

// ==========================================
// HELPERS
// ==========================================

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <svg className={`${cls} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="w-1 h-4 rounded-full bg-emerald-500" />
      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{label}</p>
      <div className="flex-1 h-px bg-emerald-100" />
    </div>
  );
}

// ==========================================
// MAIN ADMIN PANEL
// ==========================================

export function AdminPanel({ currentUserEmail, onClose }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('clients');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-gray-900">🛡️ Admin Panel</h2>
          <p className="text-xs text-gray-400 font-medium mt-0.5">Kelola klien, unit template & akses pengguna</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-all"
        >
          ✕
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('clients')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === 'clients' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏢 Klien & Unit
        </button>
        <button
          onClick={() => setTab('roles')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === 'roles' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          👥 Akses User
        </button>
      </div>

      {/* Content */}
      {tab === 'clients' && <ClientManager currentUserEmail={currentUserEmail} />}
      {tab === 'roles' && <RoleManager currentUserEmail={currentUserEmail} />}
    </div>
  );
}

// ==========================================
// CLIENT MANAGER
// ==========================================

function ClientManager({ currentUserEmail }: { currentUserEmail: string }) {
  const [subView, setSubView] = useState<ClientSubView>('list');
  const [clients, setClients] = useState<ClientTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state - client
  const [editingClient, setEditingClient] = useState<ClientTemplate | null>(null);
  const [clientForm, setClientForm] = useState({ name: '', address: '', contact: '', notes: '' });
  const [savingClient, setSavingClient] = useState(false);

  // Unit state
  const [activeClient, setActiveClient] = useState<ClientTemplate | null>(null);
  const [units, setUnits] = useState<UnitTemplate[]>([]);
  const [unitSearchQuery, setUnitSearchQuery] = useState('');

  // Unit form state
  const [editingUnit, setEditingUnit] = useState<UnitTemplate | null>(null);
  const [unitObjectType, setUnitObjectType] = useState('');
  const [unitData, setUnitData] = useState<Record<string, string>>({});
  const [savingUnit, setSavingUnit] = useState(false);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ClientRepository.search(searchQuery);
      setClients(data);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const loadUnits = useCallback(async () => {
    if (!activeClient) return;
    const data = await UnitRepository.searchByClient(activeClient.id, unitSearchQuery);
    setUnits(data);
  }, [activeClient, unitSearchQuery]);

  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { loadUnits(); }, [loadUnits]);

  // ---- Client CRUD ----

  const openAddClient = () => {
    setEditingClient(null);
    setClientForm({ name: '', address: '', contact: '', notes: '' });
    setSubView('form');
  };

  const openEditClient = (c: ClientTemplate) => {
    setEditingClient(c);
    setClientForm({ name: c.name, address: c.address || '', contact: c.contact || '', notes: c.notes || '' });
    setSubView('form');
  };

  const saveClient = async () => {
    if (!clientForm.name.trim()) {
      alert('Nama klien wajib diisi!');
      return;
    }
    setSavingClient(true);
    try {
      if (editingClient) {
        await ClientRepository.update(editingClient.id, {
          name: clientForm.name.trim(),
          address: clientForm.address,
          contact: clientForm.contact,
          notes: clientForm.notes,
        });
      } else {
        await ClientRepository.create({
          name: clientForm.name.trim(),
          address: clientForm.address,
          contact: clientForm.contact,
          notes: clientForm.notes,
          createdBy: currentUserEmail,
        });
      }
      await loadClients();
      setSubView('list');
      pushTemplatesToDrive().catch(console.warn);
    } catch (err: any) {
      alert('Gagal menyimpan: ' + err.message);
    } finally {
      setSavingClient(false);
    }
  };

  const deleteClient = async (c: ClientTemplate) => {
    const units = await UnitRepository.getByClient(c.id);
    const msg = units.length > 0
      ? `Hapus klien "${c.name}"? Ini juga akan menghapus ${units.length} unit template di dalamnya.`
      : `Hapus klien "${c.name}"?`;
    if (!confirm(msg)) return;
    await ClientRepository.delete(c.id);
    await loadClients();
      pushTemplatesToDrive().catch(console.warn);
  };

  // ---- Unit management ----

  const openUnits = (c: ClientTemplate) => {
    setActiveClient(c);
    setUnitSearchQuery('');
    setSubView('units');
  };

  const openAddUnit = () => {
    setEditingUnit(null);
    setUnitObjectType('');
    setUnitData({});
    setSubView('unit-form');
  };

  const openEditUnit = (u: UnitTemplate) => {
    setEditingUnit(u);
    setUnitObjectType(u.objectType);
    setUnitData({ ...u.unitData });
    setSubView('unit-form');
  };

  const saveUnit = async () => {
    if (!unitObjectType) { alert('Pilih jenis objek K3!'); return; }
    if (!unitData.namaUnit?.trim()) { alert('Nama Unit wajib diisi!'); return; }
    if (!unitData.nomorSeri?.trim()) { alert('Nomor Seri wajib diisi!'); return; }
    if (!activeClient) return;

    setSavingUnit(true);
    try {
      const label = unitData.namaUnit.trim();
      if (editingUnit) {
        await UnitRepository.update(editingUnit.id, {
          objectType: unitObjectType,
          unitData,
          label,
        });
      } else {
        await UnitRepository.create({
          clientId: activeClient.id,
          objectType: unitObjectType,
          unitData,
          label,
          createdBy: currentUserEmail,
        });
      }
      await loadUnits();
      setSubView('units');
      pushTemplatesToDrive().catch(console.warn);
    } catch (err: any) {
      alert('Gagal menyimpan unit: ' + err.message);
    } finally {
      setSavingUnit(false);
    }
  };

  const deleteUnit = async (u: UnitTemplate) => {
    if (!confirm(`Hapus unit "${u.label}"?`)) return;
    await UnitRepository.delete(u.id);
    await loadUnits();
    pushTemplatesToDrive().catch(console.warn);
  };

  const specificFields = SPECIFIC_FIELDS[unitObjectType] || [];
  const objMeta = OBJECT_TYPES.find(o => o.key === unitObjectType);

  // ==========================================
  // RENDER - LIST CLIENTS
  // ==========================================

  if (subView === 'list') {
    return (
      <div className="space-y-4">
        {/* Search + Add */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari klien..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 rounded-xl text-sm outline-none transition-all"
            />
          </div>
          <button
            onClick={openAddClient}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm whitespace-nowrap"
          >
            + Klien Baru
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <Spinner size="md" /> <span className="text-sm">Memuat...</span>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="text-5xl mb-3 opacity-40">🏢</div>
            <p className="text-sm font-bold text-gray-500">Belum ada klien</p>
            <p className="text-xs text-gray-400 mt-1">Tambah klien pertama untuk mulai membuat template unit</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map(c => (
              <ClientCard
                key={c.id}
                client={c}
                onEdit={() => openEditClient(c)}
                onDelete={() => deleteClient(c)}
                onManageUnits={() => openUnits(c)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // RENDER - CLIENT FORM
  // ==========================================

  if (subView === 'form') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSubView('list')} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all">←</button>
          <h3 className="text-sm font-black text-gray-900">{editingClient ? 'Edit Klien' : 'Tambah Klien Baru'}</h3>
        </div>

        <div className="space-y-3">
          <AdminField label="Nama Perusahaan" required>
            <input
              type="text"
              value={clientForm.name}
              onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))}
              placeholder="PT. Contoh Industri"
              className="admin-input"
            />
          </AdminField>
          <AdminField label="Alamat">
            <input
              type="text"
              value={clientForm.address}
              onChange={e => setClientForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Jl. Industri No. 1, Bekasi"
              className="admin-input"
            />
          </AdminField>
          <AdminField label="Kontak PIC">
            <input
              type="text"
              value={clientForm.contact}
              onChange={e => setClientForm(f => ({ ...f, contact: e.target.value }))}
              placeholder="Nama - 08xxxxxxxx"
              className="admin-input"
            />
          </AdminField>
          <AdminField label="Catatan">
            <textarea
              value={clientForm.notes}
              onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Catatan tambahan..."
              rows={2}
              className="admin-input resize-none"
            />
          </AdminField>
        </div>

        <div className="sticky bottom-0 bg-slate-50/95 backdrop-blur pt-3 pb-2 -mx-4 px-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={() => setSubView('list')}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-all"
          >
            Batal
          </button>
          <button
            onClick={saveClient}
            disabled={savingClient}
            className="flex-[2] py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
          >
            {savingClient ? <><Spinner /> Menyimpan...</> : '✅ Simpan Klien'}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER - UNIT LIST
  // ==========================================

  if (subView === 'units' && activeClient) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSubView('list')} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all">←</button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-gray-900 truncate">Unit: {activeClient.name}</h3>
            <p className="text-[10px] text-gray-400">{units.length} unit template</p>
          </div>
          <button
            onClick={openAddUnit}
            className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all"
          >
            + Unit
          </button>
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={unitSearchQuery}
            onChange={e => setUnitSearchQuery(e.target.value)}
            placeholder="Cari unit..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 rounded-xl text-sm outline-none transition-all"
          />
        </div>

        {units.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="text-4xl mb-3 opacity-40">📦</div>
            <p className="text-sm font-bold text-gray-500">Belum ada unit template</p>
            <p className="text-xs text-gray-400 mt-1">Tambah unit agar ahli bisa memilih saat inspeksi</p>
          </div>
        ) : (
          <div className="space-y-2">
            {units.map(u => (
              <UnitCard
                key={u.id}
                unit={u}
                onEdit={() => openEditUnit(u)}
                onDelete={() => deleteUnit(u)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // RENDER - UNIT FORM
  // ==========================================

  if (subView === 'unit-form') {
    return (
      <div className="space-y-4 pb-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setSubView('units')} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all">←</button>
          <h3 className="text-sm font-black text-gray-900">{editingUnit ? 'Edit Unit Template' : 'Tambah Unit Template'}</h3>
        </div>

        {/* Pilih jenis objek K3 */}
        {!unitObjectType ? (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pilih Jenis Objek K3</p>
            <div className="grid grid-cols-2 gap-2">
              {OBJECT_TYPES.map(obj => (
                <button
                  key={obj.key}
                  onClick={() => setUnitObjectType(obj.key)}
                  className="bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-sm rounded-xl p-3 text-left transition-all active:scale-95"
                >
                  <div className="text-xl mb-1">{obj.icon}</div>
                  <p className="text-xs font-black text-gray-900">{obj.label}</p>
                  <p className="text-[10px] text-gray-400">{obj.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header jenis */}
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              <span className="text-xl">{objMeta?.icon}</span>
              <div className="flex-1">
                <p className="text-xs font-black text-emerald-800">{objMeta?.label}</p>
                <p className="text-[10px] text-emerald-600">{objMeta?.desc}</p>
              </div>
              {!editingUnit && (
                <button
                  onClick={() => { setUnitObjectType(''); setUnitData({}); }}
                  className="text-xs text-emerald-500 underline"
                >
                  Ganti
                </button>
              )}
            </div>

            {/* Common Fields */}
            <SectionDivider label="Identitas Unit" />
            {COMMON_FIELDS.map(field => (
              <AdminFormField
                key={field.name}
                field={field}
                value={unitData[field.name] || ''}
                onChange={v => setUnitData(d => ({ ...d, [field.name]: v }))}
              />
            ))}

            {/* Specific Fields */}
            {specificFields.length > 0 && (
              <>
                <SectionDivider label={`Data Teknis — ${objMeta?.label}`} />
                {specificFields.map(field => (
                  <AdminFormField
                    key={field.name}
                    field={field}
                    value={unitData[field.name] || ''}
                    onChange={v => setUnitData(d => ({ ...d, [field.name]: v }))}
                  />
                ))}
              </>
            )}

            {/* Action Buttons */}
            <div className="sticky bottom-0 bg-slate-50/95 backdrop-blur pt-3 pb-2 -mx-4 px-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setSubView('units')}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={saveUnit}
                disabled={savingUnit}
                className="flex-[2] py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                {savingUnit ? <><Spinner /> Menyimpan...</> : '✅ Simpan Template Unit'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ==========================================
// ROLE MANAGER
// ==========================================

function RoleManager({ currentUserEmail }: { currentUserEmail: string }) {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'ahli'>('ahli');
  const [saving, setSaving] = useState(false);

  const KNOWN_AHLI = [
    { email: 'angga@aksara.co.id', name: 'Angga' },
    { email: 'imam@aksara.co.id',  name: 'Imam' },
    { email: 'fauzan@aksara.co.id',name: 'Fauzan' },
    { email: 'ziar@aksara.co.id',  name: 'Ziar' },
  ];

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await RoleRepository.getAll();
      setRoles(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const saveRole = async () => {
    if (!newEmail.trim() || !newName.trim()) {
      alert('Email dan nama wajib diisi!');
      return;
    }
    setSaving(true);
    try {
      await RoleRepository.upsert(newEmail.trim().toLowerCase(), newRole, newName.trim(), currentUserEmail);
      setShowAddForm(false);
      setNewEmail('');
      setNewName('');
      setNewRole('ahli');
      await loadRoles();
    } catch (err: any) {
      alert('Gagal: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (email: string) => {
    if (email === currentUserEmail) {
      alert('Tidak bisa menghapus akun sendiri!');
      return;
    }
    if (!confirm(`Hapus akses untuk ${email}?`)) return;
    await RoleRepository.delete(email);
    await loadRoles();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500">{roles.length} pengguna terdaftar</p>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all"
        >
          {showAddForm ? 'Batal' : '+ Tambah User'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-black text-emerald-800 uppercase tracking-widest">Tambah / Update User</p>

          {/* Quick fill dari daftar ahli */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1.5">Pilih cepat:</p>
            <div className="flex flex-wrap gap-1.5">
              {KNOWN_AHLI.map(a => (
                <button
                  key={a.email}
                  onClick={() => { setNewEmail(a.email); setNewName(a.name); setNewRole('ahli'); }}
                  className="px-2 py-1 bg-white border border-emerald-200 rounded-lg text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 transition-all"
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <AdminField label="Email Google" required>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="user@gmail.com"
              className="admin-input"
            />
          </AdminField>
          <AdminField label="Nama" required>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nama Lengkap"
              className="admin-input"
            />
          </AdminField>
          <AdminField label="Role">
            <div className="flex gap-2">
              {(['ahli', 'admin'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setNewRole(r)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                    newRole === r
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {r === 'admin' ? '🛡️ Admin' : '👷 Ahli K3'}
                </button>
              ))}
            </div>
          </AdminField>
          <button
            onClick={saveRole}
            disabled={saving}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {saving ? <><Spinner /> Menyimpan...</> : '✅ Simpan'}
          </button>
        </div>
      )}

      {/* Roles list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
          <Spinner size="md" /> <span className="text-sm">Memuat...</span>
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="text-4xl mb-3 opacity-40">👥</div>
          <p className="text-sm font-bold text-gray-500">Belum ada user terdaftar</p>
          <p className="text-xs text-gray-400 mt-1">Tambah user untuk mengatur hak akses</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-black text-emerald-700 flex-shrink-0">
                {r.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{r.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{r.id}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                r.role === 'admin'
                  ? 'bg-purple-50 text-purple-700 border-purple-100'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-100'
              }`}>
                {r.role === 'admin' ? '🛡️ Admin' : '👷 Ahli'}
              </span>
              {r.id !== currentUserEmail && (
                <button
                  onClick={() => deleteRole(r.id)}
                  className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm flex-shrink-0"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// SUB COMPONENTS
// ==========================================

function ClientCard({
  client, onEdit, onDelete, onManageUnits
}: {
  client: ClientTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onManageUnits: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-lg flex-shrink-0">🏢</div>
          <div className="min-w-0">
            <p className="text-sm font-black text-gray-900 truncate">{client.name}</p>
            {client.address && <p className="text-[10px] text-gray-400 truncate">{client.address}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center border border-blue-100 transition-all text-sm"
          >✏️</button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm"
          >🗑️</button>
        </div>
      </div>
      <button
        onClick={onManageUnits}
        className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
      >
        📦 Kelola Unit Template →
      </button>
    </div>
  );
}

function UnitCard({
  unit, onEdit, onDelete
}: {
  unit: UnitTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = OBJECT_TYPES.find(o => o.key === unit.objectType);
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xl flex-shrink-0">{meta?.icon || '📦'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{unit.label}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-emerald-600 font-bold">{meta?.label}</span>
            {unit.unitData?.nomorSeri && (
              <span className="text-[10px] text-gray-400">S/N: {unit.unitData.nomorSeri}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center border border-blue-100 transition-all text-sm"
          >✏️</button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm"
          >🗑️</button>
        </div>
      </div>
    </div>
  );
}

function AdminField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function AdminFormField({
  field, value, onChange
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputCls = 'w-full bg-gray-50 border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all';

  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
        {field.unit && <span className="ml-1 normal-case font-medium opacity-60">({field.unit})</span>}
      </label>
      {field.type === 'select' ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={inputCls + ' cursor-pointer'}
        >
          <option value="">— Pilih —</option>
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={inputCls + ' resize-none'}
        />
      ) : (
        <input
          type={field.type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputCls}
        />
      )}
    </div>
  );
}