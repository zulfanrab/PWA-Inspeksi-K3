// src/App.tsx
// CHANGED: Integrasi fitur Template Unit — pilih klien → pilih unit → form pre-filled
//          Role detection (admin vs ahli), Admin Panel, backward-compatible

import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionRepository, RoleRepository, type InspectionSession, type InspectionPhoto } from './db/db';
import { uploadToDrive, getValidToken, saveToken, clearToken, TokenExpiredError, type UploadProgress } from './services/driveService';
import { GOOGLE_CONFIG } from './config';
import { FormView } from './components/FormView';
import { SyncHub } from './components/SyncHub';
import { HistoryView } from './components/HistoryView';
import { AdminPanel } from './components/AdminPanel'; // NEW
import { ClientPicker, type PickedUnit } from './components/ClientPicker'; // NEW

// ==========================================
// TYPES
// ==========================================

// CHANGED: tambah 'PICK_UNIT' dan 'ADMIN' view
type View = 'HOME' | 'PICK_UNIT' | 'FORM' | 'SYNC_HUB' | 'HISTORY' | 'ADMIN';
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

// ==========================================
// FIELD DEFINITIONS (tidak berubah sesuai requirement)
// ==========================================

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
    { name: 'jenisPUBT',           label: 'Jenis Pesawat Uap/Bejana',   type: 'select',  required: true,
      options: ['Boiler Pipa Api', 'Boiler Pipa Air', 'Bejana Tekan', 'Tangki Refrigerasi', 'Autoclave', 'Heat Exchanger', 'Pressure Vessel', 'Air Receiver', 'Lainnya'] },
    { name: 'volume',              label: 'Volume',                      type: 'number',  unit: 'Liter',  required: true },
    { name: 'tekananKerjaMaks',    label: 'Tekanan Kerja Maksimum',      type: 'number',  unit: 'Bar',    required: true },
    { name: 'temperaturKerja',     label: 'Temperatur Kerja',            type: 'number',  unit: '°C' },
    { name: 'mediaIsi',            label: 'Media Isi',                   type: 'select',
      options: ['Steam / Uap Air', 'Air Bertekanan', 'Gas Nitrogen', 'Gas CO2', 'Freon/Refrigerant', 'Oli Hidraulik', 'BBM / Avtur', 'LPG / LNG', 'Lainnya'] },
    { name: 'kapasitasProduksi',   label: 'Kapasitas Produksi',          type: 'number',  unit: 'kg/jam' },
    { name: 'nomorNDT',            label: 'Nomor NDT Terakhir',          type: 'text',    placeholder: 'Nomor sertifikat NDT' },
    { name: 'tanggalNDT',          label: 'Tanggal NDT Terakhir',        type: 'text',    placeholder: 'YYYY-MM-DD' },
  ],
  'PTP': [
    { name: 'jenisPTP',            label: 'Jenis Pesawat Tenaga',        type: 'select',  required: true,
      options: ['Motor Listrik', 'Generator / Genset', 'Kompresor Udara', 'Kompresor Gas', 'Pompa Sentrifugal', 'Pompa Reciprocating', 'Mesin Produksi', 'Turbin', 'Lainnya'] },
    { name: 'daya',                label: 'Daya',                        type: 'number',  unit: 'kW',     required: true },
    { name: 'dayaHP',              label: 'Daya (HP)',                   type: 'number',  unit: 'HP' },
    { name: 'putaranRPM',          label: 'Putaran',                     type: 'number',  unit: 'RPM' },
    { name: 'mediaKerja',          label: 'Media Kerja',                 type: 'select',
      options: ['Udara', 'Air', 'Oli', 'Gas', 'Steam', 'Bahan Kimia', 'Lainnya'] },
    { name: 'tekananKerjaPTP',     label: 'Tekanan Kerja',               type: 'number',  unit: 'Bar' },
    { name: 'tegangan',            label: 'Tegangan Listrik',            type: 'number',  unit: 'Volt' },
    { name: 'arusListrik',         label: 'Arus Listrik',                type: 'number',  unit: 'Ampere' },
  ],
  'Listrik': [
    { name: 'jenisListrik',        label: 'Jenis Instalasi',             type: 'select',  required: true,
      options: ['Instalasi Listrik Umum', 'Panel Distribusi (MDP)', 'Panel Distribusi (SDP)', 'Transformator', 'Genset / UPS', 'Instalasi Hazardous Area', 'Lainnya'] },
    { name: 'dayaTerpasang',       label: 'Daya Terpasang',              type: 'number',  unit: 'kVA',    required: true },
    { name: 'teganganSistem',      label: 'Tegangan Sistem',             type: 'select',
      options: ['380 V (3 Phase)', '220 V (1 Phase)', '20 kV (Menengah)', '150 kV (Tinggi)', 'Lainnya'] },
    { name: 'luasArea',            label: 'Luas Area Instalasi',         type: 'number',  unit: 'm²' },
    { name: 'jumlahPanel',         label: 'Jumlah Panel',                type: 'number',  unit: 'unit' },
    { name: 'tahananIsolasi',      label: 'Tahanan Isolasi',             type: 'number',  unit: 'MΩ' },
    { name: 'nilaiGrounding',      label: 'Nilai Grounding',             type: 'number',  unit: 'Ω' },
    { name: 'nomorSertifikatSLO',  label: 'Nomor Sertifikat SLO',        type: 'text',    placeholder: 'Nomor SLO dari PLN/Disnaker' },
  ],
  'Penyalur Petir': [
    { name: 'jenisPenyalurPetir',  label: 'Jenis Sistem Penangkal',      type: 'select',  required: true,
      options: ['Sistem Franklin (Konvensional)', 'Sistem Faraday (Sangkar)', 'Early Streamer Emission (ESE)', 'Sistem Kawat Catenary', 'Lainnya'] },
    { name: 'luasAreaPetir',       label: 'Luas Area yang Dilindungi',   type: 'number',  unit: 'm²',  required: true },
    { name: 'tinggiTiangPenangkal',label: 'Tinggi Tiang Penangkal',      type: 'number',  unit: 'm',   required: true },
    { name: 'tahananPembumian',    label: 'Nilai Tahanan Pembumian',     type: 'number',  unit: 'Ω',   required: true },
    { name: 'jumlahTitikGrounding',label: 'Jumlah Titik Grounding',      type: 'number',  unit: 'titik' },
    { name: 'jenisElektroda',      label: 'Jenis Elektroda Pembumian',   type: 'select',
      options: ['Copper Rod', 'Copper Plate', 'Copper Strip', 'Galvanized Rod', 'Lainnya'] },
    { name: 'kedalamanElektroda',  label: 'Kedalaman Elektroda',         type: 'number',  unit: 'm' },
  ],
  'Lift': [
    { name: 'jenisLift',           label: 'Jenis Elevator/Eskalator',    type: 'select',  required: true,
      options: ['Lift Penumpang', 'Lift Barang', 'Lift Barang + Penumpang', 'Lift Panoramik', 'Lift Rumah Sakit (Dumbwaiter)', 'Eskalator', 'Moving Walk / Travelator', 'Lainnya'] },
    { name: 'kapasitasKg',         label: 'Kapasitas',                   type: 'number',  unit: 'kg',     required: true },
    { name: 'kapasitasOrang',      label: 'Kapasitas',                   type: 'number',  unit: 'orang' },
    { name: 'kecepatanLift',       label: 'Kecepatan',                   type: 'number',  unit: 'm/s',    required: true },
    { name: 'jumlahLantai',        label: 'Jumlah Lantai / Stop',        type: 'number',  unit: 'lantai', required: true },
    { name: 'jenisPenggerakLift',  label: 'Jenis Penggerak',             type: 'select',
      options: ['Traction (MRL)', 'Traction (Machine Room)', 'Hydraulic', 'Rack & Pinion', 'Lainnya'] },
    { name: 'nomorIzinLift',       label: 'Nomor Izin Operasi',          type: 'text',    placeholder: 'Nomor SK dari Disnaker' },
    { name: 'tanggalIzinBerlaku',  label: 'Berlaku Hingga',              type: 'text',    placeholder: 'YYYY-MM-DD' },
  ],
  'Proteksi Kebakaran': [
    { name: 'jenisProteksi',       label: 'Jenis Sistem Proteksi',       type: 'select',  required: true,
      options: ['APAR (Portable)', 'Hydrant Box + Pillar', 'Sprinkler Otomatis', 'Fire Alarm System', 'Clean Agent System (FM200, NOVEC)', 'Foam System', 'CO2 System', 'Lainnya'] },
    { name: 'jumlahUnitAPAR',      label: 'Jumlah Unit APAR',            type: 'number',  unit: 'unit' },
    { name: 'kapasitasMedia',      label: 'Kapasitas Media Pemadam',     type: 'number',  unit: 'kg',     required: true },
    { name: 'luasAreaProteksi',    label: 'Luas Area Proteksi',          type: 'number',  unit: 'm²',     required: true },
    { name: 'jumlahHeadSprinkler', label: 'Jumlah Head Sprinkler',       type: 'number',  unit: 'pcs' },
    { name: 'tekananSistem',       label: 'Tekanan Sistem',              type: 'number',  unit: 'Bar',    required: true },
    { name: 'mediaPemadam',        label: 'Jenis Media Pemadam',         type: 'select',
      options: ['Dry Chemical Powder', 'CO2', 'AFFF Foam', 'FM200', 'NOVEC 1230', 'Halon', 'Air (Water Mist)', 'Lainnya'] },
    { name: 'jumlahHydrant',       label: 'Jumlah Hydrant',              type: 'number',  unit: 'unit' },
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
// GOOGLE OAUTH
// ==========================================

function buildOAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    redirect_uri: window.location.origin,
    response_type: 'token',
    scope: GOOGLE_CONFIG.scope + ' email profile',  // CHANGED: tambah email+profile untuk deteksi user
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

// ==========================================
// HELPERS
// ==========================================

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

// NEW: Ambil email user dari Google token via userinfo
async function fetchUserEmail(token: string): Promise<{ email: string; name: string } | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.email || '', name: data.name || '' };
  } catch {
    return null;
  }
}

// ==========================================
// MAIN APP
// ==========================================

export default function App() {
  // Navigation
  const [view, setView] = useState<View>('HOME');

  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // NEW: info user yang sedang login
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

  // Data
  const [drafts, setDrafts] = useState<SessionWithPhotos[]>([]);
  const [history, setHistory] = useState<SessionWithPhotos[]>([]);
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);

  // Form State
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeObject, setActiveObject] = useState('');
  const [clientName, setClientName] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [existingPhotos, setExistingPhotos] = useState<InspectionPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  // NEW: track apakah form diisi dari template
  const [fromTemplateClientId, setFromTemplateClientId] = useState<string | undefined>();
  const [fromTemplateUnitId, setFromTemplateUnitId] = useState<string | undefined>();

  // UI State
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ──── Load data ──────────────────────────────────────────

  const refreshData = useCallback(async () => {
    try {
      const [d, h, names] = await Promise.all([
        SessionRepository.getDrafts(),
        SessionRepository.getHistory(),
        SessionRepository.getClientNames(),
      ]);
      setDrafts(d);
      setHistory(h);
      setClientSuggestions(names);
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.inner?.name === 'QuotaExceededError') {
        alert(
          '⚠️ Penyimpanan perangkat hampir penuh!\n\n' +
          'Hapus beberapa draft lama atau sync ke Google Drive terlebih dahulu, ' +
          'lalu coba lagi.\n\n(Error: IndexedDB storage quota exceeded)'
        );
      } else {
        console.error('[App] refreshData error:', err);
      }
    }
  }, []);

  // NEW: Cek role user setelah dapat email
  const checkAndSetRole = useCallback(async (email: string, name: string) => {
    // Seed owner pertama kali jika DB kosong
    await RoleRepository.seedIfEmpty(email, name);
    const admin = await RoleRepository.isAdmin(email);
    setIsAdmin(admin);
    setRoleChecked(true);
  }, []);

  // ──── Auth on mount ───────────────────────────────────────

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

      if (token) {
        saveToken(token, expiresIn);
        setIsAuthenticated(true);
        setTokenError(null);
        window.history.replaceState({}, document.title, window.location.pathname);

        // NEW: Fetch email user setelah login
        fetchUserEmail(token).then(info => {
          if (info) {
            setCurrentUserEmail(info.email);
            setCurrentUserName(info.name);
            localStorage.setItem('aksara_user_email', info.email);
            localStorage.setItem('aksara_user_name', info.name);
            checkAndSetRole(info.email, info.name);
          }
        });
      }
    } else {
      try {
        getValidToken();
        setIsAuthenticated(true);
        // NEW: Ambil email dari localStorage cache
        const cachedEmail = localStorage.getItem('aksara_user_email') || '';
        const cachedName = localStorage.getItem('aksara_user_name') || '';
        setCurrentUserEmail(cachedEmail);
        setCurrentUserName(cachedName);
        if (cachedEmail) {
          checkAndSetRole(cachedEmail, cachedName);
        } else {
          setRoleChecked(true);
        }
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          setIsAuthenticated(false);
          const hadToken = !!localStorage.getItem('google_token');
          if (!hadToken) {
            setTokenError('Sesi Google Drive berakhir. Silakan login ulang.');
          }
        }
        setRoleChecked(true);
      }
    }
    refreshData();
  }, [refreshData, checkAndSetRole]);

  // ──── Form Helpers ────────────────────────────────────────

  const resetForm = () => {
    setFormMode('create');
    setEditingId(null);
    setActiveObject('');
    setClientName('');
    setFormData({});
    setExistingPhotos([]);
    setNewPhotos([]);
    setDeletedPhotoIds([]);
    setFromTemplateClientId(undefined);
    setFromTemplateUnitId(undefined);
  };

  // ──── Handlers ────────────────────────────────────────────

  const handleLogin = () => {
    setTokenError(null);
    window.location.href = buildOAuthUrl();
  };

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setCurrentUserEmail('');
    setCurrentUserName('');
    setIsAdmin(false);
    localStorage.removeItem('aksara_user_email');
    localStorage.removeItem('aksara_user_name');
  };

  // CHANGED: HOME sekarang langsung ke PICK_UNIT untuk ahli, tetap ke pilih jenis jika manual
  const handleStartInspection = () => {
    resetForm();
    setView('PICK_UNIT');
  };

  // NEW: dipanggil dari ClientPicker ketika unit dipilih
  const handleUnitPicked = (picked: PickedUnit) => {
    resetForm();
    setActiveObject(picked.unit.objectType);
    setClientName(picked.client.name);
    // Pre-fill form dari template unit
    setFormData({ ...picked.unit.unitData });
    setFromTemplateClientId(picked.client.id);
    setFromTemplateUnitId(picked.unit.id);
    setFormMode('create');
    setView('FORM');
  };

  // NEW: dipanggil dari ClientPicker ketika ahli memilih inspeksi manual
  const handleManualPick = (objectType: string) => {
    resetForm();
    setActiveObject(objectType);
    setFormMode('create');
    setView('FORM');
  };

  // Tetap support langsung pilih jenis (untuk backward-compat & legacy HOME)
  const handleSelectObject = (key: string) => {
    resetForm();
    setActiveObject(key);
    setFormMode('create');
    setView('FORM');
  };

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
    setFromTemplateClientId(session.templateClientId);
    setFromTemplateUnitId(session.templateUnitId);
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
    e.target.value = '';
  };

  const removeExistingPhoto = (photoId: string) => {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setDeletedPhotoIds((prev) => [...prev, photoId]);
  };

  const removeNewPhoto = (idx: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveForm = async () => {
    const errors = validateForm(clientName, formData, activeObject);
    if (errors.length > 0) {
      alert(`⚠️ Field wajib belum diisi:\n${errors.map((e) => `• ${e}`).join('\n')}`);
      return;
    }

    setIsSaving(true);
    try {
      if (formMode === 'edit' && editingId) {
        await SessionRepository.update(
          editingId,
          {
            clientName: clientName.trim(),
            objectType: activeObject,
            unitData: formData,
            templateClientId: fromTemplateClientId,
            templateUnitId: fromTemplateUnitId,
            inspectorEmail: currentUserEmail,
          },
          newPhotos,
          deletedPhotoIds
        );
        alert('✅ Data berhasil diperbarui!');
      } else {
        await SessionRepository.create(
          {
            clientName: clientName.trim(),
            objectType: activeObject,
            unitData: formData,
            status: 'draft',
            templateClientId: fromTemplateClientId,
            templateUnitId: fromTemplateUnitId,
            inspectorEmail: currentUserEmail,
          },
          newPhotos
        );
        alert('✅ Data berhasil disimpan!');
      }
      await refreshData();
      resetForm();
      setView('HOME');
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.inner?.name === 'QuotaExceededError') {
        alert('❌ Gagal menyimpan — penyimpanan perangkat penuh!\n\nSilakan sync draft ke Google Drive lalu hapus dari perangkat ini.');
      } else {
        alert('❌ Gagal menyimpan: ' + (err?.message || 'Unknown error'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async (id: string) => {
    try {
      getValidToken();
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        setIsAuthenticated(false);
        setTokenError(err.message);
        alert(`⚠️ ${err.message}`);
      } else {
        alert('Wajib Login Google Drive terlebih dahulu!');
      }
      return;
    }

    setUploadingId(id);
    setUploadProgress(null);

    try {
      const session = await SessionRepository.getById(id);
      if (!session) throw new Error('Sesi tidak ditemukan');

      await uploadToDrive(session, session.photos, (progress) => {
        setUploadProgress(progress);
      });

      await SessionRepository.markSynced(id);
      await refreshData();
      setUploadProgress(null);
    } catch (err: any) {
      setUploadProgress(null);
      if (err instanceof TokenExpiredError) {
        setIsAuthenticated(false);
        setTokenError(err.message);
        alert(`⚠️ ${err.message}`);
      } else {
        alert('Gagal sinkronisasi: ' + err.message);
      }
    } finally {
      setUploadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus data ini? Tindakan tidak bisa dibatalkan.')) return;
    await SessionRepository.delete(id);
    await refreshData();
  };

  // ──── Computed ────────────────────────────────────────────

  const specificFields = SPECIFIC_FIELDS[activeObject] || [];
  const objMeta = OBJECT_TYPES.find((o) => o.key === activeObject);
  const totalPhotos = existingPhotos.length + newPhotos.length;

  // ──── RENDER ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800 font-sans">

      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => { resetForm(); setView('HOME'); }}
            className="flex items-center gap-2.5"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-black text-sm shadow">
              A
            </div>
            <span className="font-black text-sm tracking-tight text-gray-900">
              Aksara <span className="text-emerald-500">Inspect</span>
            </span>
          </button>

          <div className="flex items-center gap-2">

            {/* CHANGED: Tombol Riwayat */}
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

            {/* NEW: Tombol Admin (hanya untuk admin, setelah role checked) */}
            {roleChecked && isAdmin && (
              <button
                onClick={() => setView('ADMIN')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  view === 'ADMIN'
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-100'
                }`}
              >
                🛡️ Admin
              </button>
            )}

            {tokenError && !isAuthenticated && (
              <span className="hidden sm:block text-[10px] text-red-500 font-medium max-w-[120px] truncate" title={tokenError}>
                ⚠️ Sesi berakhir
              </span>
            )}

            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-500 hover:bg-red-100 border border-red-100 transition-all"
                title={currentUserEmail}
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

      {/* Token error banner */}
      {tokenError && !isAuthenticated && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <span className="text-base">⚠️</span>
            <p className="flex-1 text-xs font-medium text-red-700">{tokenError}</p>
            <button
              onClick={handleLogin}
              className="text-xs font-bold text-red-600 underline hover:text-red-800 whitespace-nowrap"
            >
              Login ulang
            </button>
          </div>
        </div>
      )}

      {/* NEW: User info bar (hanya jika login) */}
      {isAuthenticated && currentUserName && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            <div className="w-6 h-6 rounded-full bg-emerald-200 flex items-center justify-center text-xs font-black text-emerald-700">
              {currentUserName.charAt(0).toUpperCase()}
            </div>
            <p className="text-xs font-bold text-emerald-800">{currentUserName}</p>
            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              isAdmin
                ? 'bg-purple-50 text-purple-700 border-purple-100'
                : 'bg-emerald-100 text-emerald-700 border-emerald-200'
            }`}>
              {isAdmin ? '🛡️ Admin' : '👷 Ahli K3'}
            </span>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6">

        {/* 🏠 HOME VIEW */}
        {view === 'HOME' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-lg font-black text-gray-900">Inspeksi Baru</h1>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                {/* CHANGED: teks berbeda untuk admin vs ahli */}
                {isAdmin
                  ? 'Pilih jenis objek K3 atau gunakan template unit klien'
                  : 'Pilih klien & unit — field akan terisi otomatis'}
              </p>
            </div>

            {/* NEW: Tombol utama untuk ahli - pakai template */}
            <button
              onClick={handleStartInspection}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white rounded-2xl px-5 py-4 text-left transition-all shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏢</span>
                <div>
                  <p className="text-sm font-black">Inspeksi dari Template Unit</p>
                  <p className="text-xs text-emerald-100 mt-0.5">Pilih klien → pilih unit → form otomatis terisi</p>
                </div>
                <span className="ml-auto text-white/70 text-lg">›</span>
              </div>
            </button>

            {/* Grid jenis K3 (manual, untuk backward compat) */}
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                Atau pilih jenis langsung (manual)
              </p>
              <div className="grid grid-cols-2 gap-3">
                {OBJECT_TYPES.map((obj) => (
                  <button
                    key={obj.key}
                    onClick={() => handleSelectObject(obj.key)}
                    className="bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-md rounded-xl p-4 text-left transition-all group active:scale-95"
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">
                      {obj.icon}
                    </div>
                    <p className="text-sm font-black text-gray-900">{obj.label}</p>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">{obj.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {drafts.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl">📦</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-800">
                    {drafts.length} draft belum di-sync
                  </p>
                  <p className="text-[10px] text-amber-600 font-medium">
                    Pastikan terhubung ke internet dan upload ke Drive
                  </p>
                </div>
                <button
                  onClick={() => setView('SYNC_HUB')}
                  className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-all whitespace-nowrap"
                >
                  Buka Sync
                </button>
              </div>
            )}
          </div>
        )}

        {/* 🏢 PICK UNIT VIEW - NEW */}
        {view === 'PICK_UNIT' && (
          <ClientPicker
            onPick={handleUnitPicked}
            onManual={handleManualPick}
            onCancel={() => setView('HOME')}
          />
        )}

        {/* 📝 FORM VIEW */}
        {view === 'FORM' && (
          <>
            {/* NEW: Banner "dari template" kalau pre-filled */}
            {fromTemplateUnitId && (
              <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <span className="text-base">⚡</span>
                <p className="text-xs text-emerald-700 font-medium flex-1">
                  Form diisi dari template unit — verifikasi dan modifikasi sesuai kondisi lapangan
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handlePhotos}
              className="hidden"
            />
            <FormView
              formMode={formMode}
              activeObject={activeObject}
              objMeta={objMeta}
              clientName={clientName}
              showClientDropdown={showClientDropdown}
              clientSuggestions={clientSuggestions}
              formData={formData}
              commonFields={COMMON_FIELDS}
              specificFields={specificFields}
              existingPhotos={existingPhotos}
              newPhotos={newPhotos}
              totalPhotos={totalPhotos}
              isSaving={isSaving}
              onClientNameChange={(val) => {
                setClientName(val);
                setShowClientDropdown(true);
              }}
              onClientNameFocus={() => setShowClientDropdown(true)}
              onClientSuggestionSelect={(name) => {
                setClientName(name);
                setShowClientDropdown(false);
              }}
              onFieldChange={handleFieldChange}
              onAddPhotoClick={() => fileInputRef.current?.click()}
              onRemoveExistingPhoto={removeExistingPhoto}
              onRemoveNewPhoto={removeNewPhoto}
              onSave={handleSaveForm}
              onCancel={() => { resetForm(); setView('HOME'); }}
            />
          </>
        )}

        {/* ☁️ SYNC HUB VIEW */}
        {view === 'SYNC_HUB' && (
          <SyncHub
            drafts={drafts}
            isAuthenticated={isAuthenticated}
            uploadingId={uploadingId}
            uploadProgress={uploadProgress}
            onLogin={handleLogin}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSync={handleSync}
          />
        )}

        {/* 📋 HISTORY VIEW */}
        {view === 'HISTORY' && (
          <HistoryView
            history={history}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {/* 🛡️ ADMIN VIEW - NEW (hanya admin) */}
        {view === 'ADMIN' && isAdmin && (
          <AdminPanel
            currentUserEmail={currentUserEmail}
            onClose={() => setView('HOME')}
          />
        )}

        {/* Guard: jika bukan admin tapi coba akses ADMIN view */}
        {view === 'ADMIN' && !isAdmin && (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-sm font-black text-gray-700">Akses Ditolak</p>
            <p className="text-xs text-gray-400 mt-1">Anda tidak memiliki izin Admin</p>
            <button
              onClick={() => setView('HOME')}
              className="mt-4 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl"
            >
              Kembali
            </button>
          </div>
        )}

      </main>
    </div>
  );
}