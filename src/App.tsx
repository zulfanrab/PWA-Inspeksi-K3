// src/App.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionRepository, type InspectionSession, type InspectionPhoto } from './db/db';
import { uploadToDrive } from './services/driveService'; 
import { exportToPDF } from './utils/pdfExport';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type View = 'HOME' | 'FORM' | 'SYNC_HUB' | 'HISTORY';
type FormMode = 'create' | 'edit';
type FieldType = 'text' | 'number' | 'select' | 'textarea';

interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

type SessionWithPhotos = InspectionSession & { photos: InspectionPhoto[] };

// ─────────────────────────────────────────────
// FIELD DEFINITIONS
// ─────────────────────────────────────────────
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
    { name: 'jenisAngkur',         label: 'Jenis Angkur',              type: 'select',  required: true,
      options: ['Chemical Anchor', 'Mechanical Anchor', 'Wedge Anchor', 'Sleeve Anchor', 'Expansion Anchor', 'Lainnya'] },
    { name: 'kapasitasTarik',      label: 'Kapasitas Tarik (MBS)',      type: 'number',  unit: 'kN',  required: true },
    { name: 'kapasitasGeser',      label: 'Kapasitas Geser',            type: 'number',  unit: 'kN' },
    { name: 'diameterAngkur',      label: 'Diameter Angkur',            type: 'number',  unit: 'mm',  required: true },
    { name: 'kedalamanPasang',     label: 'Kedalaman Pasang',           type: 'number',  unit: 'mm',  required: true },
    { name: 'materialAngkur',      label: 'Material Angkur',            type: 'select',
      options: ['Stainless Steel 316', 'Stainless Steel 304', 'Galvanized Steel', 'Carbon Steel', 'Lainnya'] },
    { name: 'jumlahAngkur',        label: 'Jumlah Angkur Diperiksa',    type: 'number',  unit: 'pcs', required: true },
    { name: 'lokasiKodeTitik',     label: 'Lokasi / Kode Titik',        type: 'text',    placeholder: 'Contoh: Grid-A1, Lantai 5' },
  ],
  'PAA': [
    { name: 'jenisPAA',            label: 'Jenis Pesawat Angkat',       type: 'select',  required: true,
      options: ['Overhead Crane', 'Mobile Crane', 'Tower Crane', 'Crawler Crane', 'Forklift', 'Reach Stacker', 'Hoist (Electric)', 'Hoist (Manual)', 'Gondola', 'Pallet Truck', 'Lainnya'] },
    { name: 'kapasitasAngkat',     label: 'Kapasitas Angkat Maksimum',  type: 'number',  unit: 'Ton',  required: true },
    { name: 'jangkauanBoom',       label: 'Jangkauan / Span Boom',      type: 'number',  unit: 'm' },
    { name: 'tinggiAngkatMaks',    label: 'Tinggi Angkat Maksimum',     type: 'number',  unit: 'm' },
    { name: 'jenisPenggerak',      label: 'Jenis Penggerak',            type: 'select',
      options: ['Electric', 'Diesel', 'Hydraulic', 'Manual', 'Pneumatic', 'Lainnya'] },
    { name: 'nomorPlatRegistrasi', label: 'Nomor Plat / Registrasi',    type: 'text',    placeholder: 'Contoh: B 1234 XYZ' },
    { name: 'nomorIzinOperasi',    label: 'Nomor Izin Operasi',         type: 'text',    placeholder: 'Nomor SK/Izin dari Disnaker' },
  ],
  'PUBT': [
    { name: 'jenisPUBT',           label: 'Jenis Pesawat Uap/Bejana',  type: 'select',  required: true,
      options: ['Boiler Pipa Api', 'Boiler Pipa Air', 'Bejana Tekan', 'Tangki Refrigerasi', 'Autoclave', 'Heat Exchanger', 'Pressure Vessel', 'Air Receiver', 'Lainnya'] },
    { name: 'volume',              label: 'Volume',                     type: 'number',  unit: 'Liter',  required: true },
    { name: 'tekananKerjaMaks',    label: 'Tekanan Kerja Maksimum',     type: 'number',  unit: 'Bar',    required: true },
    { name: 'temperaturKerja',     label: 'Temperatur Kerja',           type: 'number',  unit: '°C' },
    { name: 'mediaIsi',            label: 'Media Isi',                  type: 'select',
      options: ['Steam / Uap Air', 'Air Bertekanan', 'Gas Nitrogen', 'Gas CO2', 'Freon/Refrigerant', 'Oli Hidraulik', 'BBM / Avtur', 'LPG / LNG', 'Lainnya'] },
    { name: 'kapasitasProduksi',   label: 'Kapasitas Produksi',         type: 'number',  unit: 'kg/jam' },
    { name: 'nomorNDT',            label: 'Nomor NDT Terakhir',         type: 'text',    placeholder: 'Nomor sertifikat NDT' },
    { name: 'tanggalNDT',          label: 'Tanggal NDT Terakhir',       type: 'text',    placeholder: 'YYYY-MM-DD' },
  ],
  'PTP': [
    { name: 'jenisPTP',            label: 'Jenis Pesawat Tenaga',       type: 'select',  required: true,
      options: ['Motor Listrik', 'Generator / Genset', 'Kompresor Udara', 'Kompresor Gas', 'Pompa Sentrifugal', 'Pompa Reciprocating', 'Mesin Produksi', 'Turbin', 'Lainnya'] },
    { name: 'daya',                label: 'Daya',                       type: 'number',  unit: 'kW',  required: true },
    { name: 'dayaHP',              label: 'Daya (HP)',                  type: 'number',  unit: 'HP' },
    { name: 'putaranRPM',          label: 'Putaran',                    type: 'number',  unit: 'RPM' },
    { name: 'mediaKerja',          label: 'Media Kerja',                type: 'select',
      options: ['Udara', 'Air', 'Oli', 'Gas', 'Steam', 'Bahan Kimia', 'Lainnya'] },
    { name: 'tekananKerjaPTP',     label: 'Tekanan Kerja',              type: 'number',  unit: 'Bar' },
    { name: 'tegangan',            label: 'Tegangan Listrik',           type: 'number',  unit: 'Volt' },
    { name: 'arusListrik',         label: 'Arus Listrik',               type: 'number',  unit: 'Ampere' },
  ],
  'Listrik': [
    { name: 'jenisListrik',        label: 'Jenis Instalasi',            type: 'select',  required: true,
      options: ['Instalasi Listrik Umum', 'Panel Distribusi (MDP)', 'Panel Distribusi (SDP)', 'Transformator', 'Genset / UPS', 'Instalasi Hazardous Area', 'Lainnya'] },
    { name: 'dayaTerpasang',       label: 'Daya Terpasang',             type: 'number',  unit: 'kVA',  required: true },
    { name: 'teganganSistem',      label: 'Tegangan Sistem',            type: 'select',
      options: ['380 V (3 Phase)', '220 V (1 Phase)', '20 kV (Menengah)', '150 kV (Tinggi)', 'Lainnya'] },
    { name: 'luasArea',            label: 'Luas Area Instalasi',        type: 'number',  unit: 'm²' },
    { name: 'jumlahPanel',         label: 'Jumlah Panel',               type: 'number',  unit: 'unit' },
    { name: 'tahananIsolasi',      label: 'Tahanan Isolasi',            type: 'number',  unit: 'MΩ' },
    { name: 'nilaiGrounding',      label: 'Nilai Grounding',            type: 'number',  unit: 'Ω' },
    { name: 'nomorSertifikatSLO',  label: 'Nomor Sertifikat SLO',       type: 'text',    placeholder: 'Nomor SLO dari PLN/Disnaker' },
  ],
  'Penyalur Petir': [
    { name: 'jenisPenyalurPetir',  label: 'Jenis Sistem Penangkal',     type: 'select',  required: true,
      options: ['Sistem Franklin (Konvensional)', 'Sistem Faraday (Sangkar)', 'Early Streamer Emission (ESE)', 'Sistem Kawat Catenary', 'Lainnya'] },
    { name: 'luasAreaPetir',       label: 'Luas Area yang Dilindungi',  type: 'number',  unit: 'm²',  required: true },
    { name: 'tinggiTiangPenangkal',label: 'Tinggi Tiang Penangkal',     type: 'number',  unit: 'm',   required: true },
    { name: 'tahananPembumian',    label: 'Nilai Tahanan Pembumian',    type: 'number',  unit: 'Ω',   required: true },
    { name: 'jumlahTitikGrounding',label: 'Jumlah Titik Grounding',     type: 'number',  unit: 'titik' },
    { name: 'jenisElektroda',      label: 'Jenis Elektroda Pembumian',  type: 'select',
      options: ['Copper Rod', 'Copper Plate', 'Copper Strip', 'Galvanized Rod', 'Lainnya'] },
    { name: 'kedalamanElektroda',  label: 'Kedalaman Elektroda',        type: 'number',  unit: 'm' },
  ],
  'Lift': [
    { name: 'jenisLift',           label: 'Jenis Elevator/Eskalator',   type: 'select',  required: true,
      options: ['Lift Penumpang', 'Lift Barang', 'Lift Barang + Penumpang', 'Lift Panoramik', 'Lift Rumah Sakit (Dumbwaiter)', 'Eskalator', 'Moving Walk / Travelator', 'Lainnya'] },
    { name: 'kapasitasKg',         label: 'Kapasitas',                  type: 'number',  unit: 'kg',  required: true },
    { name: 'kapasitasOrang',      label: 'Kapasitas',                  type: 'number',  unit: 'orang' },
    { name: 'kecepatanLift',       label: 'Kecepatan',                  type: 'number',  unit: 'm/s',  required: true },
    { name: 'jumlahLantai',        label: 'Jumlah Lantai / Stop',       type: 'number',  unit: 'lantai',  required: true },
    { name: 'jenisPenggerakLift',  label: 'Jenis Penggerak',            type: 'select',
      options: ['Traction (MRL)', 'Traction (Machine Room)', 'Hydraulic', 'Rack & Pinion', 'Lainnya'] },
    { name: 'nomorIzinLift',       label: 'Nomor Izin Operasi',         type: 'text',    placeholder: 'Nomor SK dari Disnaker' },
    { name: 'tanggalIzinBerlaku',  label: 'Berlaku Hingga',             type: 'text',    placeholder: 'YYYY-MM-DD' },
  ],
  'Proteksi Kebakaran': [
    { name: 'jenisProteksi',       label: 'Jenis Sistem Proteksi',      type: 'select',  required: true,
      options: ['APAR (Portable)', 'Hydrant Box + Pillar', 'Sprinkler Otomatis', 'Fire Alarm System', 'Clean Agent System (FM200, NOVEC)', 'Foam System', 'CO2 System', 'Lainnya'] },
    { name: 'jumlahUnitAPAR',      label: 'Jumlah Unit APAR',           type: 'number',  unit: 'unit' },
    { name: 'kapasitasMedia',      label: 'Kapasitas Media Pemadam',    type: 'number',  unit: 'kg',   required: true },
    { name: 'luasAreaProteksi',    label: 'Luas Area Proteksi',         type: 'number',  unit: 'm²',   required: true },
    { name: 'jumlahHeadSprinkler', label: 'Jumlah Head Sprinkler',      type: 'number',  unit: 'pcs' },
    { name: 'tekananSistem',       label: 'Tekanan Sistem',             type: 'number',  unit: 'Bar',  required: true },
    { name: 'mediaPemadam',        label: 'Jenis Media Pemadam',        type: 'select',
      options: ['Dry Chemical Powder', 'CO2', 'AFFF Foam', 'FM200', 'NOVEC 1230', 'Halon', 'Air (Water Mist)', 'Lainnya'] },
    { name: 'jumlahHydrant',       label: 'Jumlah Hydrant',             type: 'number',  unit: 'unit' },
  ],
};

const OBJECT_TYPES = [
  { key: 'Angkur',             label: 'Angkur',             desc: 'Safety Anchor',                 icon: '⚓' },
  { key: 'PAA',                label: 'PAA',                desc: 'Pesawat Angkat & Angkut',       icon: '🏗️' },
  { key: 'PUBT',               label: 'PUBT',               desc: 'Pesawat Uap & Bejana Tekan',    icon: '⚗️' },
  { key: 'PTP',                label: 'PTP',                desc: 'Pesawat Tenaga & Produksi',     icon: '⚙️' },
  { key: 'Listrik',            label: 'Listrik',            desc: 'Instalasi Listrik',             icon: '⚡' },
  { key: 'Penyalur Petir',     label: 'Penyalur Petir',     desc: 'Instalasi Penyalur Petir',      icon: '🌩️' },
  { key: 'Lift',               label: 'Lift / Eskalator',   desc: 'Elevator & Eskalator',          icon: '🛗' },
  { key: 'Proteksi Kebakaran', label: 'Proteksi Kebakaran', desc: 'Instalasi Proteksi Kebakaran',  icon: '🧯' },
];

// ─────────────────────────────────────────────
// GOOGLE OAUTH
// ─────────────────────────────────────────────
const CLIENT_ID = '595024932466-v01dd7n525plvlh0j05pqu1o3u4aekf2.apps.googleusercontent.com';
const REDIRECT_URI = window.location.origin;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

function buildOAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: SCOPES,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function validateForm(
  clientName: string,
  formData: Record<string, string>,
  activeObject: string
): string[] {
  const errors: string[] = [];
  if (!clientName.trim()) errors.push('Nama Perusahaan Klien');

  const requiredCommon = COMMON_FIELDS.filter((f) => f.required && !formData[f.name]?.trim());
  const requiredSpecific = (SPECIFIC_FIELDS[activeObject] || []).filter(
    (f) => f.required && !formData[f.name]?.trim()
  );

  return [...errors, ...requiredCommon.map((f) => f.label), ...requiredSpecific.map((f) => f.label)];
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  // ── Navigation ──────────────────────────────
  const [view, setView] = useState<View>('HOME');

  // ── Auth ────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ── Data ────────────────────────────────────
  const [drafts, setDrafts] = useState<SessionWithPhotos[]>([]);
  const [history, setHistory] = useState<SessionWithPhotos[]>([]);
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);

  // ── Form State ──────────────────────────────
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);   // ID sesi yang sedang diedit
  const [activeObject, setActiveObject] = useState('');
  const [clientName, setClientName] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Foto dibagi jadi dua kategori:
  // existingPhotos = foto lama dari DB (sudah tersimpan)
  // newPhotos      = foto baru yang baru saja ditambahkan (belum tersimpan)
  const [existingPhotos, setExistingPhotos] = useState<InspectionPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);          // dataUrl[]
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);

  // ── UI State ────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load data ───────────────────────────────
  const refreshData = useCallback(async () => {
    const [d, h, names] = await Promise.all([
      SessionRepository.getDrafts(),
      SessionRepository.getHistory(),
      SessionRepository.getClientNames(),
    ]);
    setDrafts(d);
    setHistory(h);
    setClientSuggestions(names);
  }, []);

  // Check auth on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      if (token) {
        localStorage.setItem('google_token', token);
        setIsAuthenticated(true);
        window.history.replaceState({}, document.title, '/');
      }
    } else if (localStorage.getItem('google_token')) {
      setIsAuthenticated(true);
    }
    refreshData();
  }, [refreshData]);

  // ── Form Helpers ────────────────────────────
  const resetForm = () => {
    setFormMode('create');
    setEditingId(null);
    setActiveObject('');
    setClientName('');
    setFormData({});
    setExistingPhotos([]);
    setNewPhotos([]);
    setDeletedPhotoIds([]);
  };

  // ── Handlers ────────────────────────────────
  const handleLogin = () => { window.location.href = buildOAuthUrl(); };
  const handleLogout = () => { localStorage.removeItem('google_token'); setIsAuthenticated(false); };

  /** Buka form CREATE baru */
  const handleSelectObject = (key: string) => {
    resetForm();
    setActiveObject(key);
    setFormMode('create');
    setView('FORM');
  };

  /** Buka form EDIT dari data lama */
  const handleEdit = async (sessionId: string) => {
    const session = await SessionRepository.getById(sessionId);
    if (!session) return;

    setFormMode('edit');
    setEditingId(sessionId);
    setActiveObject(session.objectType);
    setClientName(session.clientName);
    setFormData(session.unitData);
    setExistingPhotos(session.photos);
    setNewPhotos([]);
    setDeletedPhotoIds([]);
    setView('FORM');
  };

  const handleFieldChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPhotos((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    // Reset file input agar bisa pilih file yang sama lagi
    e.target.value = '';
  };

  /** Hapus foto LAMA (tandai untuk dihapus saat save) */
  const removeExistingPhoto = (photoId: string) => {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setDeletedPhotoIds((prev) => [...prev, photoId]);
  };

  /** Hapus foto BARU (sebelum tersimpan) */
  const removeNewPhoto = (idx: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  /**
   * handleSaveForm — satu fungsi untuk CREATE dan UPDATE
   * Membedakan mode lewat `formMode` dan `editingId`
   */
  const handleSaveForm = async () => {
    const errors = validateForm(clientName, formData, activeObject);
    if (errors.length > 0) {
      alert(`⚠️ Field wajib belum diisi:\n${errors.map((e) => `• ${e}`).join('\n')}`);
      return;
    }

    setIsSaving(true);
    try {
      if (formMode === 'edit' && editingId) {
        // ── UPDATE ─────────────────────────────────
        await SessionRepository.update(
          editingId,
          { clientName: clientName.trim(), objectType: activeObject, unitData: formData },
          newPhotos,
          deletedPhotoIds
        );
        alert('✅ Data berhasil diperbarui!');
      } else {
        // ── CREATE ─────────────────────────────────
        await SessionRepository.create(
          { clientName: clientName.trim(), objectType: activeObject, unitData: formData, status: 'draft' },
          newPhotos
        );
        alert('✅ Data berhasil disimpan!');
      }

      await refreshData();
      resetForm();
      setView('HOME');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async (id: string) => {
    if (!isAuthenticated) {
      alert('Wajib Login Google Drive terlebih dahulu!');
      return;
    }
    setIsUploading(id);
    try {
      const session = await SessionRepository.getById(id);
      if (!session) throw new Error('Sesi tidak ditemukan');
      await uploadToDrive(session, session.photos);
      await SessionRepository.markSynced(id);
      await refreshData();
    } catch (err: any) {
      alert('Gagal sinkronisasi: ' + err.message);
    } finally {
      setIsUploading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus data ini? Tindakan tidak bisa dibatalkan.')) return;
    await SessionRepository.delete(id);
    await refreshData();
  };

  // ── Computed ────────────────────────────────
  const specificFields = SPECIFIC_FIELDS[activeObject] || [];
  const objMeta = OBJECT_TYPES.find((o) => o.key === activeObject);
  const totalNewPhotos = newPhotos.length;
  const totalExistingPhotos = existingPhotos.length;
  const totalPhotos = totalExistingPhotos + totalNewPhotos;

  // ── RENDER ──────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-gray-800 font-sans">

      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => { resetForm(); setView('HOME'); }} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-black text-sm shadow">
              A
            </div>
            <span className="font-black text-sm tracking-tight text-gray-900">
              Aksara <span className="text-emerald-500">Inspect</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            {/* Tombol History */}
            <button
              onClick={() => setView('HISTORY')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === 'HISTORY'
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100'
              }`}
            >
              📋 Riwayat
              {history.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                  {history.length}
                </span>
              )}
            </button>

            {/* Tombol Sync Hub */}
            {drafts.length > 0 && (
              <button
                onClick={() => setView('SYNC_HUB')}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  view === 'SYNC_HUB'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'
                }`}
              >
                ☁️ Sync
                <span className="bg-amber-400 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                  {drafts.length}
                </span>
              </button>
            )}

            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-500 hover:bg-red-100 border border-red-100 transition-all"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition-all"
              >
                Login Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">

        {/* ══════════════════════════════════════
            HOME VIEW
        ══════════════════════════════════════ */}
        {view === 'HOME' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black tracking-tight text-gray-900">Dashboard Inspeksi</h1>
                <p className="text-xs text-gray-400 mt-0.5">PT Aksara Riksa Perdana — PJK3</p>
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                isAuthenticated
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  : 'bg-amber-50 text-amber-600 border-amber-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isAuthenticated ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                {isAuthenticated ? 'Drive Terhubung' : 'Belum Login'}
              </div>
            </div>

            {/* Login prompt */}
            {!isAuthenticated && (
              <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center text-lg flex-shrink-0">🔐</div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900 mb-1">Login Google Drive Diperlukan</p>
                    <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                      Login sekali untuk mengaktifkan sinkronisasi foto & laporan ke Google Drive.
                    </p>
                    <button
                      onClick={handleLogin}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-emerald-500/20"
                    >
                      Login dengan Google →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Draft" value={drafts.length} color="amber" icon="📝" onClick={() => setView('SYNC_HUB')} />
              <StatCard label="Selesai" value={history.length} color="blue" icon="✅" onClick={() => setView('HISTORY')} />
              <StatCard
                label="Total Foto"
                value={[...drafts, ...history].reduce((a, b) => a + b.photos.length, 0)}
                color="emerald"
                icon="📷"
              />
            </div>

            {/* Draft preview (maks 3) */}
            {drafts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Draft Terbaru</p>
                  <button
                    onClick={() => setView('SYNC_HUB')}
                    className="text-[10px] font-bold text-emerald-600 hover:underline"
                  >
                    Lihat semua →
                  </button>
                </div>
                <div className="space-y-2">
                  {drafts.slice(0, 3).map((item) => (
                    <SessionCard
                      key={item.id}
                      item={item}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onSync={isAuthenticated ? handleSync : undefined}
                      isUploading={isUploading === item.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Object type selector */}
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3">
                + Buat Inspeksi Baru
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {OBJECT_TYPES.map((obj) => (
                  <button
                    key={obj.key}
                    onClick={() => handleSelectObject(obj.key)}
                    className="group flex items-center gap-3 p-3.5 bg-white border border-gray-200 shadow-sm hover:border-emerald-400 hover:bg-emerald-50 rounded-xl transition-all text-left"
                  >
                    <span className="text-2xl flex-shrink-0">{obj.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate group-hover:text-emerald-600 transition-colors">{obj.label}</p>
                      <p className="text-[10px] text-gray-400 truncate">{obj.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            FORM VIEW (CREATE & EDIT)
        ══════════════════════════════════════ */}
        {view === 'FORM' && (
          <div className="space-y-5">
    
    {/* --- TAMBAH INI --- */}
    <button 
      onClick={() => exportToPDF('area-cetak', 'Laporan-Inspeksi')}
      className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all"
    >
      Download PDF
    </button>
    {/* ------------------ */}

    {/* BUNGKUS DARI SINI */}
    <div id="area-cetak" className="space-y-5">
      
      {/* Form header */}
      <div className="flex items-center gap-3">
      </div>

      {/* ... semua kode form lu dari "Nama Perusahaan Klien" sampe "Save button" tetep di dalem sini ... */}
      
    </div>
            {/* Form header */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => { resetForm(); setView('HOME'); }}
                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 shadow-sm"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{objMeta?.icon}</span>
                  <h2 className="text-base font-black text-gray-900">{objMeta?.label}</h2>
                  {formMode === 'edit' && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full uppercase">Edit</span>
                  )}
                </div>
                <p className="text-[10px] font-medium text-gray-400">{objMeta?.desc}</p>
              </div>
            </div>

            {/* Nama Klien */}
            <div className="relative bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Nama Perusahaan Klien <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => { setClientName(e.target.value); setShowClientDropdown(true); }}
                onFocus={() => setShowClientDropdown(true)}
                onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                placeholder="Contoh: PT Maju Bersama Tbk"
                className="w-full bg-gray-50 border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              />
              {showClientDropdown && clientSuggestions.filter((s) =>
                s.toLowerCase().includes(clientName.toLowerCase()) && clientName
              ).length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl">
                  {clientSuggestions
                    .filter((s) => s.toLowerCase().includes(clientName.toLowerCase()))
                    .slice(0, 5)
                    .map((s) => (
                      <button
                        key={s}
                        onMouseDown={() => { setClientName(s); setShowClientDropdown(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-all font-medium"
                      >
                        {s}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Common fields */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 ml-1">Data Umum Unit</p>
              <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                {COMMON_FIELDS.map((field) => (
                  <FormField
                    key={field.name}
                    field={field}
                    value={formData[field.name] || ''}
                    onChange={(val) => handleFieldChange(field.name, val)}
                  />
                ))}
              </div>
            </div>

            {/* Specific fields */}
            {specificFields.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3 ml-1">
                  Data Teknis Spesifik — {objMeta?.label}
                </p>
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3 shadow-sm">
                  {specificFields.map((field) => (
                    <FormField
                      key={field.name}
                      field={field}
                      value={formData[field.name] || ''}
                      onChange={(val) => handleFieldChange(field.name, val)}
                      accent
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Photo section */}
            <div>
              <div className="flex items-center justify-between mb-3 ml-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Foto Inspeksi ({totalPhotos})
                  {formMode === 'edit' && totalExistingPhotos > 0 && (
                    <span className="ml-1 text-blue-500">• {totalExistingPhotos} lama, {totalNewPhotos} baru</span>
                  )}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 text-xs font-bold rounded-lg transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Foto
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handlePhotos}
                className="hidden"
              />

              {totalPhotos === 0 ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-white border-2 border-dashed border-gray-300 rounded-2xl py-8 flex flex-col items-center gap-2 hover:border-emerald-400 hover:bg-emerald-50 transition-all shadow-sm"
                >
                  <span className="text-3xl">📷</span>
                  <p className="text-sm font-bold text-gray-500">Tap untuk ambil / pilih foto</p>
                  <p className="text-[10px] text-gray-400">Bisa pilih banyak sekaligus</p>
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2 bg-white p-3 rounded-2xl border border-gray-200 shadow-sm">
                  {/* Foto LAMA */}
                  {existingPhotos.map((p, i) => (
                    <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden group border border-blue-100">
                      <img src={p.dataUrl} className="w-full h-full object-cover" alt={`foto-lama-${i + 1}`} />
                      <button
                        onClick={() => removeExistingPhoto(p.id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      {/* Badge penanda foto lama */}
                      <div className="absolute bottom-1 left-1 bg-blue-500/80 text-white text-[8px] px-1.5 py-0.5 rounded font-bold backdrop-blur-sm">
                        Lama
                      </div>
                    </div>
                  ))}

                  {/* Foto BARU */}
                  {newPhotos.map((p, i) => (
                    <div key={`new-${i}`} className="relative aspect-square rounded-xl overflow-hidden group border border-emerald-100">
                      <img src={p} className="w-full h-full object-cover" alt={`foto-baru-${i + 1}`} />
                      <button
                        onClick={() => removeNewPhoto(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <div className="absolute bottom-1 left-1 bg-emerald-500/80 text-white text-[8px] px-1.5 py-0.5 rounded font-bold backdrop-blur-sm">
                        Baru
                      </div>
                    </div>
                  ))}

                  {/* Tombol tambah foto */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-emerald-400 hover:bg-emerald-50 transition-all bg-gray-50"
                  >
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="pb-4">
              <button
                onClick={handleSaveForm}
                disabled={isSaving}
                className={`w-full py-4 disabled:opacity-60 text-white font-black text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                  formMode === 'edit'
                    ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'
                    : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                }`}
              >
                {isSaving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {formMode === 'edit' ? 'Memperbarui...' : 'Menyimpan...'}
                  </>
                ) : formMode === 'edit' ? (
                  <>✏️ Perbarui Data ({totalPhotos} foto)</>
                ) : (
                  <>✅ Simpan Draft Offline ({totalPhotos} foto)</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            SYNC HUB VIEW
        ══════════════════════════════════════ */}
        {view === 'SYNC_HUB' && (
          <div className="space-y-5">
            <ViewHeader title="Antrian Sinkronisasi" subtitle={`${drafts.length} draft siap upload ke Google Drive`} onBack={() => setView('HOME')} />

            {!isAuthenticated && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="text-sm font-bold text-amber-700">Perlu Login Google Drive</p>
                  <button onClick={handleLogin} className="text-xs text-amber-600 underline mt-0.5 font-medium hover:text-amber-800">
                    Login sekarang →
                  </button>
                </div>
              </div>
            )}

            {drafts.length === 0 ? (
              <EmptyState icon="✅" title="Semua data sudah tersinkronisasi" subtitle="Tidak ada draft yang tertunda" />
            ) : (
              <div className="space-y-3">
                {drafts.map((item) => (
                  <SyncCard
                    key={item.id}
                    item={item}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onSync={handleSync}
                    isUploading={isUploading === item.id}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            HISTORY VIEW
        ══════════════════════════════════════ */}
        {view === 'HISTORY' && (
          <div className="space-y-5">
            <ViewHeader title="Riwayat Inspeksi" subtitle={`${history.length} inspeksi selesai`} onBack={() => setView('HOME')} />

            {history.length === 0 ? (
              <EmptyState icon="📋" title="Belum ada riwayat inspeksi" subtitle="Sinkronisasi draft ke Drive untuk melihat riwayat di sini" />
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <HistoryCard
                    key={item.id}
                    item={item}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function StatCard({
  label, value, color, icon, onClick,
}: {
  label: string; value: number; color: 'amber' | 'blue' | 'emerald'; icon: string; onClick?: () => void;
}) {
  const colors = {
    amber:   'bg-amber-50  border-amber-100  text-amber-600',
    blue:    'bg-blue-50   border-blue-100   text-blue-600',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
  };
  const numColors = { amber: 'text-amber-500', blue: 'text-blue-500', emerald: 'text-emerald-500' };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`${colors[color]} border rounded-xl p-3.5 text-left transition-all ${onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="text-lg mb-1">{icon}</div>
      <p className={`text-2xl font-black ${numColors[color]}`}>{value}</p>
      <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wide">{label}</p>
    </button>
  );
}

function ViewHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 shadow-sm"
      >
        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div>
        <h2 className="text-base font-black text-gray-900">{title}</h2>
        <p className="text-[10px] font-medium text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl shadow-sm">
      <span className="text-5xl">{icon}</span>
      <p className="text-sm font-bold text-gray-600 mt-4">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}

/** Card ringkas untuk Home / Sync Hub */
function SessionCard({
  item, onEdit, onDelete, onSync, isUploading,
}: {
  item: SessionWithPhotos;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSync?: (id: string) => void;
  isUploading: boolean;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl flex-shrink-0">{meta?.icon || '📋'}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{item.unitData?.namaUnit || 'Unit Tanpa Nama'}</p>
            <p className="text-[10px] text-gray-400 font-medium">{item.clientName} · {item.photos.length} foto</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(item.id)}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center border border-blue-100 transition-all text-sm"
            title="Edit"
          >✏️</button>
          {onSync && (
            <button
              onClick={() => onSync(item.id)}
              disabled={isUploading}
              className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-500 hover:bg-emerald-100 flex items-center justify-center border border-emerald-100 transition-all disabled:opacity-50 text-sm"
              title="Sync ke Drive"
            >
              {isUploading ? '⏳' : '☁️'}
            </button>
          )}
          <button
            onClick={() => onDelete(item.id)}
            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm"
            title="Hapus"
          >🗑️</button>
        </div>
      </div>
    </div>
  );
}

/** Card detail untuk Sync Hub */
function SyncCard({
  item, onEdit, onDelete, onSync, isUploading, isAuthenticated,
}: {
  item: SessionWithPhotos;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSync: (id: string) => void;
  isUploading: boolean;
  isAuthenticated: boolean;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  const dateStr = formatDate(item.updatedAt || item.createdAt);

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">{meta?.icon || '📋'}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{item.unitData?.namaUnit || 'Unit Tanpa Nama'}</p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{item.clientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(item.id)}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center border border-blue-100 transition-all text-sm"
            title="Edit"
          >✏️</button>
          <button
            onClick={() => onDelete(item.id)}
            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm"
            title="Hapus"
          >🗑️</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-bold">{meta?.label}</span>
        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">📷 {item.photos.length} foto</span>
        <span className="text-[10px] font-medium text-gray-400">{dateStr}</span>
      </div>

      {/* Drive path preview */}
      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        <p className="text-[9px] text-gray-400 font-mono leading-relaxed break-all">
          Drive/ {item.clientName} / {new Date(item.createdAt).toISOString().slice(0, 10)} / {item.objectType} / {item.unitData?.namaUnit || 'Unit'} - {item.unitData?.nomorSeri || 'NoSeri'}
        </p>
      </div>

      <button
        onClick={() => onSync(item.id)}
        disabled={isUploading || !isAuthenticated}
        className="w-full py-2.5 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
      >
        {isUploading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sedang Upload ke Drive...
          </>
        ) : (
          <>☁️ Upload ke Google Drive</>
        )}
      </button>
    </div>
  );
}

/** Card untuk History (sudah synced) */
function HistoryCard({
  item, onEdit, onDelete,
}: {
  item: SessionWithPhotos;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = OBJECT_TYPES.find((o) => o.key === item.objectType);
  const dateStr = formatDate(item.updatedAt || item.createdAt);

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-4 space-y-3">
      
      {/* Tombol PDF (Panggil fungsi dari utils) */}
      <button 
        onClick={() => exportToPDF(item, `Laporan-${item.unitData?.namaUnit || 'Inspeksi'}`)}
        className="w-full py-2 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-all mb-2"
      >
        Download PDF Laporan
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">{meta?.icon || '📋'}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{item.unitData?.namaUnit || 'Unit Tanpa Nama'}</p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">{item.clientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(item.id)}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 flex items-center justify-center border border-blue-100 transition-all text-sm"
            title="Edit"
          >✏️</button>
          <button
            onClick={() => onDelete(item.id)}
            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center border border-red-100 transition-all text-sm"
            title="Hapus"
          >🗑️</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-bold">{meta?.label}</span>
        <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-100 rounded-full text-[10px] font-bold">✅ Synced</span>
        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-bold">📷 {item.photos.length} foto</span>
        <span className="text-[10px] font-medium text-gray-400">{dateStr}</span>
      </div>

      {/* Unit data preview */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 space-y-1">
        {item.unitData?.nomorSeri && (
          <p className="text-[10px] text-gray-500"><span className="font-bold">S/N:</span> {item.unitData.nomorSeri}</p>
        )}
        {item.unitData?.lokasiUnit && (
          <p className="text-[10px] text-gray-500"><span className="font-bold">Lokasi:</span> {item.unitData.lokasiUnit}</p>
        )}
        {item.unitData?.catatan && (
          <p className="text-[10px] text-gray-500 truncate"><span className="font-bold">Catatan:</span> {item.unitData.catatan}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FORM FIELD COMPONENT
// ─────────────────────────────────────────────
function FormField({
  field, value, onChange, accent = false,
}: {
  field: FieldDef; value: string; onChange: (val: string) => void; accent?: boolean;
}) {
  const baseInput = `
    w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-900
    placeholder-gray-400 outline-none transition-all
    ${accent
      ? 'border-emerald-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 bg-white'
      : 'border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'}
  `;

  return (
    <div>
      <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1.5 ${accent ? 'text-emerald-700' : 'text-gray-500'}`}>
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
        {field.unit && <span className="ml-1 normal-case font-medium opacity-60">({field.unit})</span>}
      </label>

      {field.type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput + ' cursor-pointer appearance-none'}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: 'right 0.5rem center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '1.5em 1.5em',
            paddingRight: '2.5rem',
          }}
        >
          <option value="" disabled>— Pilih —</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={baseInput + ' resize-none'}
        />
      ) : (
        <input
          type={field.type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || (field.unit ? `0 ${field.unit}` : '')}
          className={baseInput}
        />
      )}
    </div>
  );
}