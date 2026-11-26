// src/components/AdminPanel.tsx
// NEW: Panel admin untuk kelola Klien & Unit Template

import { useState, useEffect, useCallback } from 'react';
import {
  ClientRepository,
  UnitRepository,
  RoleRepository,
  InspectorRepository,
  CompanySkpRepository,
  type ClientTemplate,
  type UnitTemplate,
  type UserRole,
  type InspectorProfile,
} from '../db/db';

import { pushTemplatesToDrive, pullTemplatesFromDrive } from '../services/syncService';
import { UNIT_NAME_SUGGESTIONS } from '../config/suggestions';
import { getApiBaseUrl } from '../config';
import { processSkpFileToImageDataUrl } from '../utils/skpImageHelper';

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
    { name: 'jenisPenyalurPetir',       label: 'Jenis Penyalur Petir',        type: 'select', required: true, options: ['Elektrostatis', 'Konvensional'] },
    { name: 'bentukPenerima',           label: 'Bentuk Penerima',             type: 'select', options: ['Bulat Runcing', 'Runcing', 'Multi-point'] },
    { name: 'tinggiTiangPenerima',      label: 'Tinggi Tiang Penerima',       type: 'text',   placeholder: '± 5 meter' },
    { name: 'tinggiBangunan',           label: 'Tinggi Bangunan',             type: 'text',   placeholder: '± 77 Meter' },
    { name: 'radiusPerlindungan',       label: 'Radius Perlindungan',         type: 'text',   placeholder: '70 Meter' },
    { name: 'jumlahAirTerminal',        label: 'Jumlah Air Terminal',         type: 'text',   placeholder: '1 unit' },
    { name: 'jumlahDownConductor',      label: 'Jumlah Penghantar Penurunan', type: 'text',   placeholder: '1 buah' },
    { name: 'jenisDownConductor',       label: 'Jenis Penghantar Penurunan',  type: 'text',   placeholder: 'BC 50 mm2' },
    { name: 'hasilUkurSigmat',          label: 'Hasil Ukur Sigmat (Diameter)',type: 'number', unit: 'mm', placeholder: '8.24' },
    { name: 'jumlahBoxKontrol',         label: 'Jumlah Box Kontrol',          type: 'text',   placeholder: '1 unit' },
    { name: 'jumlahElektrodaPembumian', label: 'Jumlah Elektroda Pembumian',  type: 'text',   placeholder: '1 buah' },
    { name: 'tahananPembumian',         label: 'Tahanan Pembumian',           type: 'text',   unit: 'Ω', placeholder: '1.39 atau 1.39, 2.10' },
    { name: 'lokasiPemasangan',         label: 'Lokasi Pemasangan',           type: 'text',   placeholder: 'Rooftop Gedung / Tower A' },
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

type AdminTab = 'clients' | 'roles' | 'inspectors' | 'templates';
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
    <div className="w-full max-w-full min-w-0 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-black text-gray-900">🛡️ Admin Panel</h2>
          <p className="text-xs text-gray-400 font-medium mt-0.5 truncate">Kelola klien, unit template, ahli K3 & template Word</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-all shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-gray-100 rounded-xl p-1 w-full">
        <button
          onClick={() => setTab('clients')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-all truncate ${
            tab === 'clients' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏢 Klien & Unit
        </button>
        <button
          onClick={() => setTab('roles')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-all truncate ${
            tab === 'roles' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          👥 Akses User
        </button>
        <button
          onClick={() => setTab('inspectors')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-all truncate ${
            tab === 'inspectors' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          👷 Ahli K3
        </button>
        <button
          onClick={() => setTab('templates')}
          className={`py-2 px-2 rounded-lg text-xs font-bold transition-all truncate ${
            tab === 'templates' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📄 Template Word
        </button>
      </div>

      {/* Content */}
      {tab === 'clients' && <ClientManager currentUserEmail={currentUserEmail} />}
      {tab === 'roles' && <RoleManager currentUserEmail={currentUserEmail} />}
      {tab === 'inspectors' && <InspectorManager />}
      {tab === 'templates' && <TemplateManager />}

      {/* Bottom Close Button for Mobile */}
      <div className="pt-4 border-t border-gray-100 flex justify-end md:hidden">
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 text-gray-700 text-xs font-black rounded-xl hover:bg-gray-200 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
        >
          ✕ Tutup Panel Admin
        </button>
      </div>
    </div>
  );
}

// ==========================================
// TEMPLATE MANAGER
// ==========================================

function TemplateManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/report?action=template`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        // Save folder ID to state if returned
        if (data.templatesFolderId) {
          (window as any)._templatesFolderId = data.templatesFolderId;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleUpload = async (typeCode: string, file: File) => {
    setUploading(typeCode);
    const apiBase = getApiBaseUrl();
    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    try {
      // 1. Minta Resumable Upload Session URI dari server (pakai OAuth Refresh Token perusahaan, bukan token user browser)
      const sessionRes = await fetch(`${apiBase}/api/report?action=template-upload-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typeCode }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok || !sessionData.success || !sessionData.uploadUrl) {
        throw new Error(sessionData.error || 'Gagal menyiapkan sesi upload Google Drive.');
      }

      // 2. Upload langsung dari browser ke Google Drive API (aman untuk file > 4.5MB tanpa kena limit Vercel 413)
      let uploadedDirect = false;
      try {
        const putRes = await fetch(sessionData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': docxMime },
          body: file,
        });
        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => '');
          throw new Error(`HTTP ${putRes.status} ${errText}`);
        }
        uploadedDirect = true;
      } catch (directErr: any) {
        // Fallback hanya jika file < 3.5MB dan direct PUT terkendala CORS/network
        if (file.size <= 3.5 * 1024 * 1024) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Gagal membaca file template.'));
            reader.readAsDataURL(file);
          });
          const fallbackRes = await fetch(`${apiBase}/api/report?action=template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ typeCode, fileBase64: base64, fileName: file.name }),
          });
          const fallbackData = await fallbackRes.json();
          if (!fallbackRes.ok || !fallbackData.success) {
            throw new Error(fallbackData.error || directErr.message);
          }
          uploadedDirect = true;
        } else {
          throw directErr;
        }
      }

      if (uploadedDirect) {
        alert(`✅ Template ${typeCode} berhasil diunggah ke Google Drive!`);
        await loadTemplates();
      }
    } catch (err: any) {
      alert(`Gagal mengunggah template: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const getTemplateInfo = (typeCode: string) => {
    const fileName = `Template_${typeCode.toUpperCase()}.docx`;
    return templates.find(t => t.name === fileName);
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 bg-white p-4 rounded-xl border border-gray-200">
      <h3 className="text-xs font-black uppercase text-gray-500 tracking-wider">Kelola Template Laporan Word (.docx)</h3>
      <p className="text-[11px] text-gray-400 break-words">Unggah template dokumen Word dengan penanda tag seperti <code>{`{companyName}`}</code>. File template otomatis disimpan sebagai <code>Template_[CODE].docx</code> di Drive.</p>
      
      {loading ? (
        <div className="text-center py-4 text-xs font-bold text-gray-400">Memeriksa status template di Google Drive...</div>
      ) : (
        <div className="space-y-3">
          {[
            { code: 'IL', name: 'Instalasi Listrik' },
            { code: 'IPP', name: 'Penyalur Petir' }
          ].map(t => {
            const info = getTemplateInfo(t.code);
            const dateStr = info?.modifiedTime || info?.createdTime;
            return (
              <div key={t.code} className="p-3.5 border border-gray-200 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-gray-50/50 w-full min-w-0">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-gray-800">{t.name} ({t.code})</h4>
                  {info ? (
                    <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                      ✓ Aktif di Drive (Diperbarui: {dateStr ? new Date(dateStr).toLocaleDateString('id-ID') : '-'})
                    </p>
                  ) : (
                    <p className="text-[10px] text-rose-500 font-bold mt-0.5">
                      ✗ Belum ada template di Drive
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  <input
                    type="file"
                    accept=".docx"
                    id={`file-${t.code}`}
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(t.code, file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading === t.code}
                    onClick={() => document.getElementById(`file-${t.code}`)?.click()}
                    className="w-full sm:w-auto text-xs font-bold text-white bg-emerald-600 border border-emerald-600 px-3.5 py-2 rounded-lg hover:bg-emerald-700 active:scale-95 transition-all whitespace-nowrap disabled:opacity-50"
                  >
                    {uploading === t.code ? 'Mengunggah...' : 'Unggah File .docx'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [refreshingDrive, setRefreshingDrive] = useState(false);

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

  // Auto-pull dari Drive saat buka Admin Panel agar data yang dihapus di device lain langsung hilang
  useEffect(() => {
    if (navigator.onLine) {
      pullTemplatesFromDrive()
        .then((res) => {
          if (res.purgedClients > 0 || res.purgedUnits > 0 || res.pulledClients > 0) {
            loadClients();
          }
        })
        .catch(console.warn);
    }
  }, [loadClients]);

  const handleRefreshFromDrive = async () => {
    setRefreshingDrive(true);
    try {
      const res = await pullTemplatesFromDrive();
      await loadClients();
      if (res.purgedClients > 0 || res.purgedUnits > 0) {
        alert(`✅ Sinkronisasi bersih! ${res.purgedClients} klien dan ${res.purgedUnits} unit yang telah dihapus di server berhasil dibersihkan dari perangkat ini.`);
      } else {
        alert(`✅ Sinkronisasi selesai: ${res.pulledClients} klien aktif terverifikasi dari server Google Drive.`);
      }
    } catch (e: any) {
      alert('Gagal sync dari Drive: ' + e.message);
    } finally {
      setRefreshingDrive(false);
    }
  };

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
      await pushTemplatesToDrive().catch(console.warn);
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
    setSavingClient(true);
    try {
      await ClientRepository.delete(c.id);
      await loadClients();
      await pushTemplatesToDrive();
    } catch (err: any) {
      console.warn('[AdminPanel] Gagal sync hapus ke Drive:', err);
      alert('Klien dihapus di perangkat ini. Namun ada kendala ke server: ' + (err.message || 'Gagal'));
    } finally {
      setSavingClient(false);
    }
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
    setSavingUnit(true);
    try {
      await UnitRepository.delete(u.id);
      await loadUnits();
      await pushTemplatesToDrive();
    } catch (err: any) {
      console.warn('[AdminPanel] Gagal sync hapus unit ke Drive:', err);
      alert('Unit dihapus di perangkat ini. Namun ada kendala ke server: ' + (err.message || 'Gagal'));
    } finally {
      setSavingUnit(false);
    }
  };

  const specificFields = SPECIFIC_FIELDS[unitObjectType] || [];
  const objMeta = OBJECT_TYPES.find(o => o.key === unitObjectType);

  // ==========================================
  // RENDER - LIST CLIENTS
  // ==========================================

  if (subView === 'list') {
    return (
      <div className="w-full max-w-full min-w-0 space-y-4">
        {/* Search + Refresh + Add */}
        <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari klien..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 rounded-xl text-sm outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefreshFromDrive}
              disabled={refreshingDrive}
              title="Tarik ulang data bersih dari Google Drive & bersihkan data terhapus"
              className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>{refreshingDrive ? '⏳' : '🔄'}</span>
              <span>Sync Drive</span>
            </button>
            <button
              type="button"
              onClick={openAddClient}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm whitespace-nowrap"
            >
              + Klien Baru
            </button>
          </div>
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
                suggestions={field.name === 'namaUnit' ? UNIT_NAME_SUGGESTIONS[unitObjectType] : undefined}
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
  field,
  value,
  onChange,
  suggestions
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  suggestions?: string[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputCls = 'w-full bg-gray-50 border border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all';

  const filtered = suggestions
    ? suggestions.filter((s) => s.toLowerCase().includes((value || '').toLowerCase()))
    : [];

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
        <div className="relative">
          <input
            type={field.type}
            value={value}
            onChange={e => {
              onChange(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={field.placeholder}
            className={inputCls}
          />
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute z-30 top-full mt-1.5 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1 max-h-60 overflow-y-auto">
              {filtered.slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={() => {
                    onChange(s);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors font-medium active:bg-emerald-100"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// INSPECTOR MANAGER (Master Ahli K3 & SKP)
// ==========================================

function InspectorManager() {
  const [inspectors, setInspectors] = useState<InspectorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [convertingPdf, setConvertingPdf] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [field, setField] = useState('Ahli Keselamatan dan Kesehatan Kerja Bidang Listrik');
  const [regNumber, setRegNumber] = useState('');
  const [skpImageDataUrl, setSkpImageDataUrl] = useState<string>('');

  const [companySkpImage, setCompanySkpImage] = useState<string>('');
  const [savingCompanySkp, setSavingCompanySkp] = useState(false);

  const apiBase = getApiBaseUrl();

  const loadLocal = useCallback(async () => {
    const [list, compSkp] = await Promise.all([
      InspectorRepository.getAll(),
      CompanySkpRepository.getSkpImage(),
    ]);
    setInspectors(list);
    setCompanySkpImage(compSkp);
    return list;
  }, []);

  const syncFromCloud = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${apiBase}/api/report?action=inspectors`);
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.inspectors) && data.inspectors.length > 0) {
          await InspectorRepository.replaceAllFromSync(data.inspectors);
        }
        if (typeof data.companySkpImage === 'string' && data.companySkpImage) {
          await CompanySkpRepository.saveSkpImage(data.companySkpImage);
        }
        await loadLocal();
      }
    } catch (err) {
      console.warn('[InspectorManager] Gagal tarik dari cloud, gunakan data lokal:', err);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [apiBase, loadLocal]);

  useEffect(() => {
    loadLocal().then(() => syncFromCloud());
  }, [loadLocal, syncFromCloud]);

  const pushToCloud = async (payload: { inspectors?: InspectorProfile[]; companySkpImage?: string }) => {
    const res = await fetch(`${apiBase}/api/report?action=inspectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Gagal menyinkronkan ke Google Drive.');
    }
  };

  const handleCompanySkpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setSavingCompanySkp(true);
    try {
      const dataUrl = await processSkpFileToImageDataUrl(file);
      await CompanySkpRepository.saveSkpImage(dataUrl);
      setCompanySkpImage(dataUrl);
      await pushToCloud({ companySkpImage: dataUrl });
      setMessage({ type: 'success', text: 'Scan SKP PJK3 Perusahaan berhasil disimpan & tersinkron ke Drive.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal mengunggah SKP PJK3 Perusahaan.' });
    } finally {
      setSavingCompanySkp(false);
      e.target.value = '';
    }
  };

  const handleClearCompanySkp = async () => {
    if (!confirm('Hapus lampiran scan SKP PJK3 Perusahaan?')) return;
    setSavingCompanySkp(true);
    setMessage(null);
    try {
      await CompanySkpRepository.clearSkpImage();
      setCompanySkpImage('');
      await pushToCloud({ companySkpImage: '' });
      setMessage({ type: 'success', text: 'SKP PJK3 Perusahaan dihapus.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal menghapus SKP PJK3 Perusahaan.' });
    } finally {
      setSavingCompanySkp(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setField('Ahli Keselamatan dan Kesehatan Kerja Bidang Listrik');
    setRegNumber('');
    setSkpImageDataUrl('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setConvertingPdf(true);
    try {
      const dataUrl = await processSkpFileToImageDataUrl(file);
      setSkpImageDataUrl(dataUrl);
      setMessage({ type: 'success', text: 'File SKP siap dilampirkan.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal memproses file SKP.' });
    } finally {
      setConvertingPdf(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !regNumber.trim()) {
      setMessage({ type: 'error', text: 'Nama lengkap dan Nomor Registrasi SKP wajib diisi.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await InspectorRepository.upsert({
        id: editingId || undefined,
        name: name.trim(),
        field: field.trim() || 'Ahli Keselamatan dan Kesehatan Kerja Bidang Listrik',
        regNumber: regNumber.trim(),
        skpImageDataUrl: skpImageDataUrl || undefined,
      });

      const updated = await loadLocal();
      await pushToCloud({ inspectors: updated });
      setMessage({ type: 'success', text: editingId ? 'Data Ahli K3 diperbarui & tersinkron.' : 'Ahli K3 baru ditambahkan & tersinkron.' });
      resetForm();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Tersimpan lokal, tapi gagal sync Drive: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: InspectorProfile) => {
    setEditingId(item.id);
    setName(item.name);
    setField(item.field);
    setRegNumber(item.regNumber);
    setSkpImageDataUrl(item.skpImageDataUrl || '');
    setMessage(null);
  };

  const handleDelete = async (id: string, itemName: string) => {
    if (!confirm(`Hapus Ahli K3 "${itemName}"?`)) return;
    try {
      await InspectorRepository.delete(id);
      const updated = await loadLocal();
      await pushToCloud({ inspectors: updated });
      setMessage({ type: 'success', text: `Ahli K3 "${itemName}" dihapus.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal menghapus Ahli K3.' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-center justify-between gap-2">
        <div>
          <p className="font-bold">Master Ahli K3 & Lampiran SKP</p>
          <p className="text-[11px] opacity-80">
            Data ahli & scan SKP (JPG/PNG/PDF 1 hal.) otomatis masuk ke blok tanda tangan dan lampiran akhir laporan Word.
          </p>
        </div>
        <button
          type="button"
          onClick={syncFromCloud}
          disabled={syncing}
          className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 font-bold text-[11px] hover:bg-emerald-100 disabled:opacity-50 shrink-0"
        >
          {syncing ? 'Sinkron...' : '↻ Sync Drive'}
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Kartu Kelola SKP PJK3 Perusahaan */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">
              SKP PJK3 Perusahaan (PT. Aksara Riksa Perdana)
            </h3>
            <p className="text-[11px] text-amber-800/80 mt-0.5">
              Upload scan SKP Perusahaan (PDF 1 hal. / JPG / PNG). Otomatis masuk sebagai lampiran{' '}
              <span className="font-mono font-bold">{'{%skpPerusahaanImage}'}</span> di Template_IPP-v3.docx.
            </p>
          </div>
          {companySkpImage && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
              ✓ Tersimpan
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="px-3.5 py-2 rounded-xl bg-white border border-amber-300 text-xs font-bold text-amber-900 hover:bg-amber-100 cursor-pointer">
            {savingCompanySkp ? 'Memproses & Sync...' : companySkpImage ? 'Ganti SKP Perusahaan' : '+ Upload SKP Perusahaan'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={handleCompanySkpUpload}
              className="hidden"
              disabled={savingCompanySkp}
            />
          </label>
          {companySkpImage && (
            <div className="flex items-center gap-2">
              <img
                src={companySkpImage}
                alt="Preview SKP PJK3 Perusahaan"
                className="w-12 h-16 object-cover rounded-lg border border-amber-300 bg-white"
              />
              <button
                type="button"
                onClick={handleClearCompanySkp}
                disabled={savingCompanySkp}
                className="text-[11px] font-bold text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Hapus SKP
              </button>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
            {editingId ? 'Edit Ahli K3' : 'Tambah Ahli K3 Baru'}
          </h3>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-[11px] font-bold text-gray-500 hover:text-gray-700">
              Batal Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-600 mb-1">Nama Lengkap *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Fauzan Akmaluddin"
              className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-600 mb-1">Nomor Registrasi SKP *</label>
            <input
              type="text"
              value={regNumber}
              onChange={(e) => setRegNumber(e.target.value)}
              placeholder="No. 5 / 10425 / AS.01.04 / V / 2025"
              className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-600 mb-1">Bidang Keahlian</label>
          <input
            type="text"
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder="Ahli Keselamatan dan Kesehatan Kerja Bidang Listrik"
            className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-600 mb-1">
            Scan SKP Ahli K3 (JPG / PNG / PDF 1 halaman)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="px-3 py-2 rounded-xl bg-white border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer">
              {convertingPdf ? 'Mengonversi...' : skpImageDataUrl ? 'Ganti File SKP' : 'Pilih File SKP'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={handleFileChange}
                className="hidden"
                disabled={convertingPdf}
              />
            </label>
            {skpImageDataUrl && (
              <div className="flex items-center gap-2">
                <img
                  src={skpImageDataUrl}
                  alt="Preview SKP"
                  className="w-12 h-16 object-cover rounded-lg border border-gray-300 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setSkpImageDataUrl('')}
                  className="text-[11px] font-bold text-red-500 hover:text-red-700"
                >
                  Hapus Lampiran
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-1 flex justify-end">
          <button
            type="submit"
            disabled={saving || convertingPdf}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : '+ Simpan Ahli K3'}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">
          Daftar Ahli K3 ({inspectors.length})
        </h3>
        {loading ? (
          <p className="text-xs text-gray-400 py-4 text-center">Memuat daftar Ahli K3...</p>
        ) : inspectors.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
            Belum ada data Ahli K3. Tambahkan di form atas.
          </p>
        ) : (
          <div className="space-y-2">
            {inspectors.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.skpImageDataUrl ? (
                    <img
                      src={item.skpImageDataUrl}
                      alt={item.name}
                      className="w-10 h-12 object-cover rounded-lg border border-gray-200 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                      No SKP
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{item.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{item.field}</p>
                    <p className="text-[11px] font-mono text-emerald-700 truncate">{item.regNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-bold hover:bg-gray-200"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.name)}
                    className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
