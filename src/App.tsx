// src/App.tsx
// FIXED: OAuth scope hanya drive.file
// FIXED: Role system kosmetik - badge saja
// FIXED: Auto sync saat online + toggle di SyncHub
// NEW: Indikator online/offline di navbar
// FIXED: Semua field form optional (hanya clientName wajib)
// FIXED (PR #1): pullInspectionsFromDrive saat app dibuka + saat online event
// FIXED (PR #2 — double upload): status diset 'draft' dulu, markSynced dipanggil
//   SETELAH uploadToDrive sukses. Cegah double write dan status inconsistency.
// FIXED (PR #2 — duplikasi foto): saat edit, kirim onlyNewPhotos ke uploadToDrive
//   bukan session.photos semua. Foto lama sudah ada di Drive, tidak perlu re-upload.
// FIXED (PR #4): Compress foto ke max 1MB sebelum disimpan ke IndexedDB

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  SessionRepository,
  RoleRepository,
  ClientRepository,
  UnitRepository,
  type InspectionSession,
  type InspectionPhoto,
} from './db/db';
import {
  uploadToDrive,
  getValidToken,
  saveToken,
  clearToken,
  TokenExpiredError,
  isTokenExpiringSoon,
  trySilentRefresh,
  type UploadProgress,
  deletePhotoFromDrive,
} from './services/driveService';
import {
  pullTemplatesFromDrive,
  pullInspectionsFromDrive,
  pushTemplatesToDrive,
} from './services/syncService';
import { GOOGLE_CONFIG, getGoogleRedirectUri, getApiBaseUrl } from './config';
import { FormView } from './components/FormView';
import { SyncHub } from './components/SyncHub';
import { HistoryView } from './components/HistoryView';
import { AdminPanel } from './components/AdminPanel';
import { ClientPicker, type PickedUnit } from './components/ClientPicker';
import { useResponsive } from './hooks/useResponsive';
import { uploadProfilePhoto, getProfilePhoto } from './services/profilePhotoService';
import { convertHeicToJpeg } from './utils/heicConvert';
import { ReportDashboard } from './components/report/ReportDashboard';
import { ReportWizard } from './components/report/ReportWizard';
// ─── TYPES ───────────────────────────────────────────────────────────────────

type View = 'HOME' | 'PICK_UNIT' | 'FORM' | 'SYNC_HUB' | 'HISTORY' | 'ADMIN' | 'REPORT_DASHBOARD' | 'REPORT_WIZARD';
type FormMode = 'create' | 'edit';
type FieldType = 'text' | 'number' | 'select' | 'textarea';

const FUNNY_LOADER_MESSAGES = [
  "Proses penarikan data sedang berlangsung",
  "Mohon bersabar ya sayang",
  "Jangan lupa makan ya sayang",
  "Mohon bersabar, yang sabar disayang Rio",
  "Kalem euy, sabar nuju proses Kaka",
  "Server nuju ngopi heula Kaka, antosan sakedap",
  "Data sedang berselancar dari awan Google Drive",
  "Sabar nuju digarap, tong rurusuhan bisi salah hidung"
];

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

// ─── FIELD DEFINITIONS ───────────────────────────────────────────────────────

const COMMON_FIELDS: FieldDef[] = [
  { name: 'namaUnit',       label: 'Nama Unit / Deskripsi',    type: 'text',     placeholder: 'Contoh: Overhead Crane #1' },
  { name: 'nomorSeri',      label: 'Nomor Seri',               type: 'text',     placeholder: 'Contoh: SN-2024-001' },
  { name: 'nomorUnit',      label: 'Nomor Unit / Kode Alat',   type: 'text',     placeholder: 'Contoh: KRN-01' },
  { name: 'merekModel',     label: 'Merek / Model',            type: 'text',     placeholder: 'Contoh: Kito ER2' },
  { name: 'pabrikPembuat',  label: 'Pabrik Pembuat',           type: 'text',     placeholder: 'Contoh: PT. Kito Indonesia' },
  { name: 'tahunPembuatan', label: 'Tahun Pembuatan',          type: 'number',   placeholder: '2020' },
  { name: 'lokasiUnit',     label: 'Lokasi / Penempatan Unit', type: 'text',     placeholder: 'Contoh: Gedung A, Lantai 3' },
  { name: 'catatan',        label: 'Catatan Tambahan',         type: 'textarea', placeholder: 'Kondisi umum, temuan awal, dll.' },
];

const SPECIFIC_FIELDS: Record<string, FieldDef[]> = {
  Angkur: [
    { name: 'jenisAngkur',     label: 'Jenis Angkur',            type: 'select', options: ['Chemical Anchor','Mechanical Anchor','Wedge Anchor','Sleeve Anchor','Expansion Anchor','Lainnya'] },
    { name: 'kapasitasTarik',  label: 'Kapasitas Tarik (MBS)',   type: 'number', unit: 'kN' },
    { name: 'kapasitasGeser',  label: 'Kapasitas Geser',         type: 'number', unit: 'kN' },
    { name: 'diameterAngkur',  label: 'Diameter Angkur',         type: 'number', unit: 'mm' },
    { name: 'kedalamanPasang', label: 'Kedalaman Pasang',        type: 'number', unit: 'mm' },
    { name: 'materialAngkur',  label: 'Material Angkur',         type: 'select', options: ['Stainless Steel 316','Stainless Steel 304','Galvanized Steel','Carbon Steel','Lainnya'] },
    { name: 'jumlahAngkur',    label: 'Jumlah Angkur Diperiksa', type: 'number', unit: 'pcs' },
    { name: 'lokasiKodeTitik', label: 'Lokasi / Kode Titik',     type: 'text',   placeholder: 'Contoh: Grid-A1, Lantai 5' },
  ],
  PAA: [
    { name: 'jenisPAA',            label: 'Jenis Pesawat Angkat',       type: 'select', options: ['Overhead Crane','Mobile Crane','Tower Crane','Crawler Crane','Forklift','Reach Stacker','Hoist (Electric)','Hoist (Manual)','Gondola','Pallet Truck','Lainnya'] },
    { name: 'kapasitasAngkat',     label: 'Kapasitas Angkat Maksimum',  type: 'number', unit: 'Ton' },
    { name: 'jangkauanBoom',       label: 'Jangkauan / Span Boom',      type: 'number', unit: 'm' },
    { name: 'tinggiAngkatMaks',    label: 'Tinggi Angkat Maksimum',     type: 'number', unit: 'm' },
    { name: 'jenisPenggerak',      label: 'Jenis Penggerak',            type: 'select', options: ['Electric','Diesel','Hydraulic','Manual','Pneumatic','Lainnya'] },
    { name: 'nomorPlatRegistrasi', label: 'Nomor Plat / Registrasi',    type: 'text',   placeholder: 'Contoh: B 1234 XYZ' },
    { name: 'nomorIzinOperasi',    label: 'Nomor Izin Operasi',         type: 'text',   placeholder: 'Nomor SK/Izin dari Disnaker' },
  ],
  PUBT: [
    { name: 'jenisPUBT',         label: 'Jenis Pesawat Uap/Bejana',  type: 'select', options: ['Boiler Pipa Api','Boiler Pipa Air','Bejana Tekan','Tangki Refrigerasi','Autoclave','Heat Exchanger','Pressure Vessel','Air Receiver','Lainnya'] },
    { name: 'volume',            label: 'Volume',                    type: 'number', unit: 'Liter' },
    { name: 'tekananKerjaMaks',  label: 'Tekanan Kerja Maksimum',    type: 'number', unit: 'Bar' },
    { name: 'temperaturKerja',   label: 'Temperatur Kerja',          type: 'number', unit: '°C' },
    { name: 'mediaIsi',          label: 'Media Isi',                 type: 'select', options: ['Steam / Uap Air','Air Bertekanan','Gas Nitrogen','Gas CO2','Freon/Refrigerant','Oli Hidraulik','BBM / Avtur','LPG / LNG','Lainnya'] },
    { name: 'kapasitasProduksi', label: 'Kapasitas Produksi',        type: 'number', unit: 'kg/jam' },
    { name: 'nomorNDT',          label: 'Nomor NDT Terakhir',        type: 'text',   placeholder: 'Nomor sertifikat NDT' },
    { name: 'tanggalNDT',        label: 'Tanggal NDT Terakhir',      type: 'text',   placeholder: 'YYYY-MM-DD' },
  ],
  PTP: [
    { name: 'jenisPTP',        label: 'Jenis Pesawat Tenaga',  type: 'select', options: ['Motor Listrik','Generator / Genset','Kompresor Udara','Kompresor Gas','Pompa Sentrifugal','Pompa Reciprocating','Mesin Produksi','Turbin','Lainnya'] },
    { name: 'daya',            label: 'Daya',                  type: 'number', unit: 'kW' },
    { name: 'dayaHP',          label: 'Daya (HP)',             type: 'number', unit: 'HP' },
    { name: 'putaranRPM',      label: 'Putaran',               type: 'number', unit: 'RPM' },
    { name: 'mediaKerja',      label: 'Media Kerja',           type: 'select', options: ['Udara','Air','Oli','Gas','Steam','Bahan Kimia','Lainnya'] },
    { name: 'tekananKerjaPTP', label: 'Tekanan Kerja',         type: 'number', unit: 'Bar' },
    { name: 'tegangan',        label: 'Tegangan Listrik',      type: 'number', unit: 'Volt' },
    { name: 'arusListrik',     label: 'Arus Listrik',          type: 'number', unit: 'Ampere' },
  ],
  Listrik: [
    { name: 'jenisListrik',       label: 'Jenis Instalasi',       type: 'select', options: ['Instalasi Listrik Umum','Panel Distribusi (MDP)','Panel Distribusi (SDP)','Transformator','Genset / UPS','Instalasi Hazardous Area','Lainnya'] },
    { name: 'dayaTerpasang',      label: 'Daya Terpasang',        type: 'number', unit: 'kVA' },
    { name: 'teganganSistem',     label: 'Tegangan Sistem',       type: 'select', options: ['380 V (3 Phase)','220 V (1 Phase)','20 kV (Menengah)','150 kV (Tinggi)','Lainnya'] },
    { name: 'luasArea',           label: 'Luas Area Instalasi',   type: 'number', unit: 'm²' },
    { name: 'jumlahPanel',        label: 'Jumlah Panel',          type: 'number', unit: 'unit' },
    { name: 'tahananIsolasi',     label: 'Tahanan Isolasi',       type: 'number', unit: 'MΩ' },
    { name: 'nilaiGrounding',     label: 'Nilai Grounding',       type: 'number', unit: 'Ω' },
    { name: 'nomorSertifikatSLO', label: 'Nomor Sertifikat SLO',  type: 'text',   placeholder: 'Nomor SLO dari PLN/Disnaker' },
  ],
  'Penyalur Petir': [
    { name: 'jenisPenyalurPetir',   label: 'Jenis Sistem Penangkal',     type: 'select', options: ['Sistem Franklin (Konvensional)','Sistem Faraday (Sangkar)','Early Streamer Emission (ESE)','Sistem Kawat Catenary','Lainnya'] },
    { name: 'luasAreaPetir',        label: 'Luas Area yang Dilindungi',  type: 'number', unit: 'm²' },
    { name: 'tinggiTiangPenangkal', label: 'Tinggi Tiang Penangkal',     type: 'number', unit: 'm' },
    { name: 'tahananPembumian',     label: 'Nilai Tahanan Pembumian',    type: 'number', unit: 'Ω' },
    { name: 'jumlahTitikGrounding', label: 'Jumlah Titik Grounding',     type: 'number', unit: 'titik' },
    { name: 'jenisElektroda',       label: 'Jenis Elektroda Pembumian',  type: 'select', options: ['Copper Rod','Copper Plate','Copper Strip','Galvanized Rod','Lainnya'] },
    { name: 'kedalamanElektroda',   label: 'Kedalaman Elektroda',        type: 'number', unit: 'm' },
  ],
  Lift: [
    { name: 'jenisLift',          label: 'Jenis Elevator/Eskalator', type: 'select', options: ['Lift Penumpang','Lift Barang','Lift Barang + Penumpang','Lift Panoramik','Lift Rumah Sakit (Dumbwaiter)','Eskalator','Moving Walk / Travelator','Lainnya'] },
    { name: 'kapasitasKg',        label: 'Kapasitas',                type: 'number', unit: 'kg' },
    { name: 'kapasitasOrang',     label: 'Kapasitas',                type: 'number', unit: 'orang' },
    { name: 'kecepatanLift',      label: 'Kecepatan',                type: 'number', unit: 'm/s' },
    { name: 'jumlahLantai',       label: 'Jumlah Lantai / Stop',     type: 'number', unit: 'lantai' },
    { name: 'jenisPenggerakLift', label: 'Jenis Penggerak',          type: 'select', options: ['Traction (MRL)','Traction (Machine Room)','Hydraulic','Rack & Pinion','Lainnya'] },
    { name: 'nomorIzinLift',      label: 'Nomor Izin Operasi',       type: 'text',   placeholder: 'Nomor SK dari Disnaker' },
    { name: 'tanggalIzinBerlaku', label: 'Berlaku Hingga',           type: 'text',   placeholder: 'YYYY-MM-DD' },
  ],
  'Proteksi Kebakaran': [
    { name: 'jenisProteksi',       label: 'Jenis Sistem Proteksi',   type: 'select', options: ['APAR (Portable)','Hydrant Box + Pillar','Sprinkler Otomatis','Fire Alarm System','Clean Agent System (FM200, NOVEC)','Foam System','CO2 System','Lainnya'] },
    { name: 'jumlahUnitAPAR',      label: 'Jumlah Unit APAR',        type: 'number', unit: 'unit' },
    { name: 'kapasitasMedia',      label: 'Kapasitas Media Pemadam', type: 'number', unit: 'kg' },
    { name: 'luasAreaProteksi',    label: 'Luas Area Proteksi',      type: 'number', unit: 'm²' },
    { name: 'jumlahHeadSprinkler', label: 'Jumlah Head Sprinkler',   type: 'number', unit: 'pcs' },
    { name: 'tekananSistem',       label: 'Tekanan Sistem',          type: 'number', unit: 'Bar' },
    { name: 'mediaPemadam',        label: 'Jenis Media Pemadam',     type: 'select', options: ['Dry Chemical Powder','CO2','AFFF Foam','FM200','NOVEC 1230','Halon','Air (Water Mist)','Lainnya'] },
    { name: 'jumlahHydrant',       label: 'Jumlah Hydrant',          type: 'number', unit: 'unit' },
  ],
};

// Icon SVG inline
const ICONS = {
  angkur: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polygon points="10,2 13.5,5.5 13.5,9 10,12.5 6.5,9 6.5,5.5" /><line x1="10" y1="12.5" x2="10" y2="18" /><line x1="7.5" y1="15.5" x2="12.5" y2="15.5" /></svg>),
  paa: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><line x1="10" y1="2" x2="10" y2="8" /><path d="M4 8 h12 v2 l-4 6 H8 l-4-6 V8z" /><line x1="10" y1="16" x2="10" y2="18" /></svg>),
  pubt: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M4 13 A6 6 0 1 1 16 13" /><line x1="10" y1="11" x2="13" y2="7" /><circle cx="10" cy="13" r="1.2" fill="currentColor" stroke="none" /><line x1="10" y1="14.5" x2="10" y2="17" /></svg>),
  ptp: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="10" cy="10" r="3" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" /></svg>),
  listrik: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><polyline points="12,2 7,11 11,11 8,18 15,8 10,8" /></svg>),
  petir: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M5 10.5 A4 4 0 0 1 13 8 A3 3 0 0 1 16 11 H9" /><polyline points="11,11 8,16 12,16 9,20" /></svg>),
  lift: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="4" y="2" width="12" height="16" rx="1.5" /><line x1="10" y1="2" x2="10" y2="18" /><polyline points="7,6 10,3 13,6" /><polyline points="7,14 10,17 13,14" /></svg>),
  kebakaran: (<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="7" y="7" width="7" height="10" rx="2" /><line x1="10.5" y1="7" x2="10.5" y2="4" /><line x1="8" y1="4" x2="13" y2="4" /><path d="M14 9 Q17 9 17 7" /><line x1="10.5" y1="10" x2="10.5" y2="13" /></svg>),
  camera: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>),
  home: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9,22 9,12 15,12 15,22" /></svg>),
  clipboard: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>),
  cloudUp: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polyline points="16,16 12,12 8,16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>),
  shield: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9,12 11,14 15,10" /></svg>),
  factory: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M2 20V10l7-5v5l7-5v5l4-2v12H2z" /><rect x="8" y="14" width="3" height="6" /><rect x="13" y="14" width="3" height="6" /></svg>),
  package: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27,6.96 12,12.01 20.73,6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>),
  chevronRight: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="9,18 15,12 9,6" /></svg>),
  hardHat: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z" /><path d="M10 5V3m4 2V3" /><path d="M6 15V9a6 6 0 0 1 12 0v6" /></svg>),
};

const OBJECT_TYPES = [
  { key: 'Angkur',             label: 'Angkur',             desc: 'Safety Anchor',                icon: ICONS.angkur },
  { key: 'PAA',                label: 'PAA',                desc: 'Pesawat Angkat & Angkut',      icon: ICONS.paa },
  { key: 'PUBT',               label: 'PUBT',               desc: 'Pesawat Uap & Bejana Tekan',   icon: ICONS.pubt },
  { key: 'PTP',                label: 'PTP',                desc: 'Pesawat Tenaga & Produksi',    icon: ICONS.ptp },
  { key: 'Listrik',            label: 'Listrik',            desc: 'Instalasi Listrik',            icon: ICONS.listrik },
  { key: 'Penyalur Petir',     label: 'Penyalur Petir',     desc: 'Instalasi Penyalur Petir',     icon: ICONS.petir },
  { key: 'Lift',               label: 'Lift / Eskalator',   desc: 'Elevator & Eskalator',         icon: ICONS.lift },
  { key: 'Proteksi Kebakaran', label: 'Proteksi Kebakaran', desc: 'Proteksi Kebakaran',           icon: ICONS.kebakaran },
];

const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL || 'zulfanrafly03@gmail.com';

// ─── OAUTH ───────────────────────────────────────────────────────────────────

function buildOAuthUrl() {
  const redirectUri = getGoogleRedirectUri();
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: GOOGLE_CONFIG.scope,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

async function ensureClientAndUnitTemplates(
  clientNameStr: string,
  objectTypeStr: string,
  unitDataObj: Record<string, string>,
  templateClientId?: string,
  templateUnitId?: string,
  email?: string
): Promise<{ clientId: string; unitId: string }> {
  const trimmedClient = clientNameStr.trim();
  if (!trimmedClient) return { clientId: '', unitId: '' };

  let finalClientId = templateClientId;

  // 1. Pastikan Klien terdaftar di template
  if (!finalClientId) {
    const allClients = await ClientRepository.getAll();
    const match = allClients.find(c => c.name.toLowerCase() === trimmedClient.toLowerCase());
    if (match) {
      finalClientId = match.id;
    } else {
      finalClientId = await ClientRepository.create({
        name: trimmedClient,
        createdBy: email || 'system',
      });
    }
  }

  let finalUnitId = templateUnitId;

  // 2. Pastikan Unit terdaftar di template klien tersebut
  if (finalClientId) {
    const trimmedNamaUnit = (unitDataObj.namaUnit || '').trim();
    const trimmedNomorSeri = (unitDataObj.nomorSeri || '').trim();

    const allUnits = await UnitRepository.getByClient(finalClientId);
    const match = allUnits.find(u => 
      u.label.toLowerCase() === trimmedNamaUnit.toLowerCase() &&
      (u.unitData?.nomorSeri || '').toLowerCase() === trimmedNomorSeri.toLowerCase()
    );

    if (match) {
      finalUnitId = match.id;
    } else {
      finalUnitId = await UnitRepository.create({
        clientId: finalClientId,
        objectType: objectTypeStr,
        unitData: unitDataObj,
        label: trimmedNamaUnit || 'Unit Tanpa Nama',
        createdBy: email || 'system',
      });
    }
  }

  // Push template terbaru ke Drive di background agar ter-sync ke perangkat lain
  pushTemplatesToDrive().catch(err => console.warn('[TemplateSync] Gagal push template:', err));

  return {
    clientId: finalClientId || '',
    unitId: finalUnitId || ''
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function validateForm(clientName: string, formData: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!clientName.trim()) errors.push('Nama Perusahaan Klien');
  if (!formData.tanggal_inspeksi?.trim()) errors.push('Tanggal Inspeksi');
  if (!formData.sifat_pemeriksaan?.trim()) errors.push('Sifat Pemeriksaan');
  return errors;
}

function defaultFormFields(): Record<string, string> {
  return {
    tanggal_inspeksi: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
    sifat_pemeriksaan: 'Baru',
  };
}

async function fetchUserInfo(token: string): Promise<{ email: string; name: string } | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const res2 = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res2.ok) return null;
      const data2 = await res2.json();
      return { email: data2.email || '', name: data2.name || '' };
    }
    const data = await res.json();
    const email = data.email || '';
    const name = data.name || data.given_name || '';
    const displayName = name || (email ? email.split('@')[0] : '');
    return { email, name: displayName };
  } catch {
    return null;
  }
}

function getRoleBadge(email: string): 'Admin' | 'Ahli K3' {
  return email === OWNER_EMAIL ? 'Admin' : 'Ahli K3';
}

// PR #4: Compress foto ke max 1MB menggunakan canvas
async function compressPhoto(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 1. Turunin batas maksimal ke 1080px (Resolusi ideal & tajam buat laporan PDF)
      const MAX_DIMENSION = 1080;
      let { width, height } = img;
      
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, width, height);
      
      // 2. Hapus looping (while) yang bikin HP kerja paksa.
      // Langsung tembak quality 0.6. Ini sweet spot: file super kecil, visual tetap jelas!
      const result = canvas.toDataURL('image/jpeg', 0.6);
      resolve(result);
    };
    
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────

function getTokens(dark: boolean) {
  return {
    emerald500: '#10B981',
    emerald600: '#059669',
    emerald700: '#047857',
    emerald900: dark ? '#064E3B' : '#065F46',
    emeraldLight: dark ? '#052e16' : '#ECFDF5',
    emeraldBorder: dark ? '#064E3B' : '#6EE7B7',
    emeraldText: dark ? '#34D399' : '#065F46',
    amber400: '#FCD34D',
    amber500: '#F59E0B',
    amber600: '#D97706',
    amber700: dark ? '#FCD34D' : '#B45309',
    amber800: dark ? '#FEF3C7' : '#92400E',
    amberLight: dark ? '#1C1400' : '#FFFBEB',
    amberBorder: dark ? '#78350F' : '#FDE68A',
    amberMid: dark ? '#292000' : '#FEF3C7',
    redLight: dark ? '#1C0A0A' : '#FEF2F2',
    redBorder: dark ? '#7F1D1D' : '#FCA5A5',
    redText: dark ? '#FCA5A5' : '#B91C1C',
    bg: dark ? '#0F172A' : '#F7F8FA',
    white: dark ? '#1E293B' : '#FFFFFF',
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    borderHover: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
    textPrimary: dark ? '#F1F5F9' : '#0F172A',
    textSecondary: dark ? '#94A3B8' : '#64748B',
    textMuted: dark ? '#64748B' : '#94A3B8',
  };
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
const T = getTokens(false); // fallback untuk sub-components di luar App()
function StatCard({ label, value, color, dot }: { label: string; value: number | string; color: string; dot: string }) {
  return (
    <div style={{ background: T.white, border: `0.5px solid ${T.border}`, borderRadius: 12, padding: '12px 14px', flex: 1 }}>
      <p style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color, letterSpacing: '-0.5px', margin: '2px 0' }}>{value}</p>
      <p style={{ fontSize: 10, color: T.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: dot }} />
        {color === T.amber600 ? 'Belum di-sync' : 'Tersimpan'}
      </p>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 0.5, background: T.border }} />
    </div>
  );
}

function ObjCard({ obj, onClick }: { obj: typeof OBJECT_TYPES[0]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: T.white, border: `0.5px solid ${T.border}`, borderRadius: 12,
        padding: 12, textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'border-color 0.15s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.emerald500; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: T.emeraldLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.emerald600 }}>
          {obj.icon}
        </div>
        <span style={{ color: T.textMuted }}>{ICONS.chevronRight}</span>
      </div>
      <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{obj.label}</p>
      <p style={{ fontSize: 10, color: T.textSecondary }}>{obj.desc}</p>
    </button>
  );
}

function NavTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer',
        color: active ? T.emerald500 : T.textSecondary,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
      <span style={{ fontSize: 9, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const { isMobile, isDesktop } = useResponsive();
  const [screenStack, setScreenStack] = useState<View[]>(() => {
    try {
      const saved = localStorage.getItem('aksara_navigation_stack');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as View[];
        }
      }
    } catch (e) {
      console.warn('Failed to parse aksara_navigation_stack:', e);
    }
    return ['HOME'];
  });

  const view = screenStack[screenStack.length - 1] || 'HOME';

  const navigateTo = useCallback((newScreen: View) => {
    setScreenStack((prev) => [...prev, newScreen]);
  }, []);

  const goBack = useCallback(() => {
    setScreenStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : ['HOME']));
  }, []);

  useEffect(() => {
    localStorage.setItem('aksara_navigation_stack', JSON.stringify(screenStack));
  }, [screenStack]);

  const goBackRef = useRef(goBack);
  useEffect(() => {
    goBackRef.current = goBack;
  }, [goBack]);

  useEffect(() => {
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      goBackRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [roleChecked, setRoleChecked] = useState(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [autoSync, setAutoSync] = useState(() => {
    return localStorage.getItem('aksara_auto_sync') === 'true';
  });

  const [drafts, setDrafts] = useState<SessionWithPhotos[]>([]);
  const [history, setHistory] = useState<SessionWithPhotos[]>([]);
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);

  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeObject, setActiveObject] = useState('');
  const [clientName, setClientName] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>(defaultFormFields());
  const [existingPhotos, setExistingPhotos] = useState<InspectionPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [deletedPhotos, setDeletedPhotos] = useState<InspectionPhoto[]>([]);
  const [fromTemplateClientId, setFromTemplateClientId] = useState<string | undefined>();
  const [fromTemplateUnitId, setFromTemplateUnitId] = useState<string | undefined>();

  const [isSaving, setIsSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ percentage: number; loaded: number; total: number } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('aksara_dark_mode') === 'true';
  });
  const T = getTokens(darkMode);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  // Gallery processing state
  const [isProcessingGallery, setIsProcessingGallery] = useState(false);
  const [galleryProcessProgress, setGalleryProcessProgress] = useState({ current: 0, total: 0 });

  // Global loading overlay state
  const [globalLoading, setGlobalLoading] = useState<string | null>(null);

  // Background data pulling / sync banner state
  const [pullingDataMessage, setPullingDataMessage] = useState<string | null>(null);

  // Profile photo state
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  // Load profile photo on mount and when user changes
  useEffect(() => {
    if (currentUserEmail) {
      const photo = getProfilePhoto(currentUserEmail);
      setProfilePhotoUrl(photo?.dataUrl || null);
    }
  }, [currentUserEmail]);

  // Handle profile photo upload
  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserEmail) return;

    const result = await uploadProfilePhoto(currentUserEmail, file);
    if (result.success && result.dataUrl) {
      setProfilePhotoUrl(result.dataUrl);
    } else {
      alert(result.message);
    }
    // Reset input
    if (profilePhotoInputRef.current) {
      profilePhotoInputRef.current.value = '';
    }
  };

  // ── Data loading ───────────────────────────────────────────────────────────

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
      alert('⚠️ Penyimpanan perangkat hampir penuh!\n\nHapus draft lama atau sync ke Google Drive terlebih dahulu.');
    } else {
      console.error('[App] refreshData error:', err);
    }
  }
}, []);

const setupRole = useCallback(async (email: string, name: string) => {
  await RoleRepository.seedIfEmpty(email, name);
  setRoleChecked(true);
}, []);

const doPullInspections = useCallback(async () => {
  setPullingDataMessage("Menarik data riwayat terbaru...");
  try {
    const result = await pullInspectionsFromDrive();
    if (result.pulled > 0) {
      await refreshData();
      setPullStatus(`✅ ${result.pulled} data baru dari Drive`);
      setTimeout(() => setPullStatus(null), 4000);
    }
    
    // 🔥 BERSIHKAN DELETED ITEMS SETELAH PULL
    if (isAuthenticated) {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/pull-inspections`);
        const data = await res.json();
        const deletedIds = data.deletedIds ?? [];
        
        for (const deletedId of deletedIds) {
          await SessionRepository.delete(deletedId).catch(() => {});
        }
        if (deletedIds.length > 0) {
          await refreshData();
        }
      } catch (e) {
        console.warn('[doPullInspections] Gagal cek deleted-log:', e);
      }
    }
  } catch (err) {
    console.warn('[App] pullInspectionsFromDrive error:', err);
  } finally {
    setPullingDataMessage(null);
  }
}, [refreshData, isAuthenticated]);

  // ── Auth on mount ──────────────────────────────────────────────────────────

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
        fetchUserInfo(token).then((info) => {
          if (info) {
            setCurrentUserEmail(info.email);
            setCurrentUserName(info.name);
            localStorage.setItem('aksara_user_email', info.email);
            localStorage.setItem('aksara_user_name', info.name);
            setupRole(info.email, info.name);
          } else {
            setRoleChecked(true);
          }
        });
      }
    } else {
      try {
        getValidToken();
        setIsAuthenticated(true);
        const cachedEmail = localStorage.getItem('aksara_user_email') || '';
        const cachedName = localStorage.getItem('aksara_user_name') || '';
        setCurrentUserEmail(cachedEmail);
        setCurrentUserName(cachedName);
        if (cachedEmail) {
          setupRole(cachedEmail, cachedName);
        } else {
          setRoleChecked(true);
        }
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          setIsAuthenticated(false);
          setTokenError('Sesi Google Drive berakhir. Silakan login ulang.');
        }
        setRoleChecked(true);
      }
    }
    refreshData();
    pullTemplatesFromDrive().catch(console.warn);
    setTimeout(() => doPullInspections(), 2000);

  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('aksara_dark_mode', String(darkMode));
  }, [darkMode]);
  // Auto silent refresh — cek tiap 10 menit, refresh kalau token mau expired
useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      if (isTokenExpiringSoon(15)) {
        trySilentRefresh(
          GOOGLE_CONFIG.clientId,
          getGoogleRedirectUri()
        );
      }
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // ── Auto sync ──────────────────────────────────────────────────────────────

const triggerAutoSync = useCallback(async () => {
    if (!isAuthenticated) {
      console.log('[BulkSync] Batal: Belum terautentikasi (belum login)');
      return;
    }
    
    if (!navigator.onLine) {
      console.log('[BulkSync] Batal: Offline');
      return;
    }
    
    // Fetch state awal untuk di-looping
    const currentDrafts = await SessionRepository.getDrafts();
    if (currentDrafts.length === 0) return;
    
    setPullingDataMessage("Sinkronisasi otomatis draft...");
    console.log(`[BulkSync] Memulai upload massal untuk ${currentDrafts.length} draft...`);
    
    try {
      for (const draft of currentDrafts) {
        try {
          setUploadingId(draft.id);
          setUploadProgress(null);
          
          const { folderId } = await uploadToDrive(draft, draft.photos, (p) => flushSync(() => setUploadProgress(p)), null);
          
          // Tandai sukses di DB
          await SessionRepository.markSynced(draft.id, folderId);
          
          // Clear status uploading
          setUploadingId(null);  
          setUploadProgress(null);

          // 🔥 FIX: Panggil refreshData() DI SINI (di dalam loop)
          // Memaksa state 'drafts' update & re-render, item langsung ilang dari UI
          await refreshData(); 
          
        } catch (err: unknown) {
          console.error(`[BulkSync] Gagal upload draft ${draft.id}:`, err);
          // Reset id kalau error biar UI gak nyangkut
          setUploadingId(null); 
          setUploadProgress(null);
          
          if (err instanceof TokenExpiredError) {
            setIsAuthenticated(false);
            setTokenError((err as Error).message);
            break; // Stop semua jika token mati
          }
        }
      }
    } finally {
      setPullingDataMessage(null);
    }
    
    // Opsional: jaga-jaga panggil lagi setelah loop selesai total
    await refreshData();
    console.log('[BulkSync] Proses upload massal selesai');
    
  }, [refreshData, isAuthenticated]);
  // 🔄 TRIGGER AUTO-SYNC SAAT APLIKASI BARU DIBUKA (VERSI ANTI-GAGAL)
  useEffect(() => {
    if (isAuthenticated && isOnline && autoSync) {
      console.log('[Auto-Sync] Sistem siap, mencoba sync background...');
      const timer = setTimeout(() => {
        triggerAutoSync();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isOnline, autoSync, triggerAutoSync]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const shouldAutoSync = localStorage.getItem('aksara_auto_sync') === 'true';
      if (shouldAutoSync) {
        setTimeout(() => triggerAutoSync(), 1500);
      }
      setTimeout(() => doPullInspections(), 2000);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerAutoSync, doPullInspections]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isAuthenticated && isTokenExpiringSoon(10)) {
        setTokenError('Sesi akan berakhir. Login ulang untuk lanjut sync.');
        setIsAuthenticated(false);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleAutoSyncToggle = (val: boolean) => {
    setAutoSync(val);
    localStorage.setItem('aksara_auto_sync', String(val));
  };
  
  // 🔄 AUTO-REFRESH & SELF CLEANING SAAT MASUK TAB RIWAYAT
  useEffect(() => {
    if (view === 'HISTORY' && isOnline) {
      console.log('[Auto-Sync] User masuk tab Riwayat, menjalankan pembersihan di background...');
      
      pullInspectionsFromDrive()
        .then(() => {
          // Setelah laci lokal dibersihkan oleh syncService, 
          // paksa layar buat nge-refresh datanya biar instan berubah
          refreshData(); 
        })
        .catch((err) => {
          console.warn('[Auto-Sync] Gagal melakukan background cleanup:', err);
        });
    }
  }, [view, isOnline]); // Akan memicu setiap kali tab berubah atau internet kembali online

  // ── Form helpers ───────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormMode('create');
    setEditingId(null);
    setActiveObject('');
    setClientName('');
    setFormData(defaultFormFields());
    setExistingPhotos([]);
    setNewPhotos([]);
    setDeletedPhotos([]);
    setFromTemplateClientId(undefined);
    setFromTemplateUnitId(undefined);
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLogin = () => { setTokenError(null); window.location.href = buildOAuthUrl(); };

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setCurrentUserEmail('');
    setCurrentUserName('');
    localStorage.removeItem('aksara_user_email');
    localStorage.removeItem('aksara_user_name');
  };

  const handleStartInspection = () => { resetForm(); navigateTo('PICK_UNIT'); };

  const handleUnitPicked = (picked: PickedUnit) => {
    resetForm();
    setActiveObject(picked.unit.objectType);
    setClientName(picked.client.name);
    setFormData({ ...defaultFormFields(), ...picked.unit.unitData });
    setFromTemplateClientId(picked.client.id);
    setFromTemplateUnitId(picked.unit.id);
    setFormMode('create');
    navigateTo('FORM');
  };

  const handleManualPick = (objectType: string) => {
    resetForm();
    setActiveObject(objectType);
    setFormMode('create');
    navigateTo('FORM');
  };

  const handleSelectObject = (key: string) => {
    resetForm();
    setActiveObject(key);
    setFormMode('create');
    navigateTo('FORM');
  };

  const handleEdit = async (sessionId: string) => {
    const session = await SessionRepository.getById(sessionId);
    if (!session) return;
    setFormMode('edit');
    setEditingId(sessionId);
    setActiveObject(session.objectType);
    setClientName(session.clientName);
    setFormData({
      ...defaultFormFields(),
      ...session.unitData,
      tanggal_inspeksi: session.unitData?.tanggal_inspeksi || defaultFormFields().tanggal_inspeksi,
      sifat_pemeriksaan: session.unitData?.sifat_pemeriksaan || defaultFormFields().sifat_pemeriksaan,
    });
    setExistingPhotos(session.photos);
    setNewPhotos([]);
    setDeletedPhotos([]);
    setFromTemplateClientId(session.templateClientId);
    setFromTemplateUnitId(session.templateUnitId);
    navigateTo('FORM');
  };

  const handleFieldChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    setIsProcessingGallery(true);
    setGalleryProcessProgress({ current: 0, total: rawFiles.length });

    const processedPhotos: string[] = [];

    for (let i = 0; i < rawFiles.length; i++) {
      let file = rawFiles[i];
      
      // Render progress update
      setGalleryProcessProgress({ current: i + 1, total: rawFiles.length });
      await new Promise(res => setTimeout(res, 20)); // Kasih napas buat UI

      try {
        file = await convertHeicToJpeg(file);
      } catch (err) {
        console.error('Failed to convert HEIC:', err);
      }

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const original = reader.result as string;
          const compressed = await compressPhoto(original);
          resolve(compressed);
        };
        reader.readAsDataURL(file);
      });

      processedPhotos.push(dataUrl);
    }

    setNewPhotos((prev) => [...prev, ...processedPhotos]);
    setIsProcessingGallery(false);
    e.target.value = '';
  };

  const removeExistingPhoto = (photoId: string) => {
    const photoToDelete = existingPhotos.find(p => p.id === photoId);
    if (photoToDelete) {
      setDeletedPhotos((prev) => [...prev, photoToDelete]);
    }
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const removeNewPhoto = (idx: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── handleSaveForm ─────────────────────────────────────────────────────────
  // FIXED (double upload): status diset 'draft' dulu, markSynced hanya dipanggil
  //   setelah uploadToDrive benar-benar sukses
  // FIXED (duplikasi foto): saat edit, kirim onlyNewPhotos ke uploadToDrive
  //   bukan semua session.photos. Foto lama sudah ada di Drive.

  const handleSaveForm = async () => {
    const errors = validateForm(clientName, formData);
    if (errors.length > 0) {
      alert(`⚠️ Field wajib belum diisi:\n${errors.map((e) => `• ${e}`).join('\n')}`);
      return;
    }
    setIsSaving(true);
    setGlobalLoading("Sedang mengamankan data inspeksi Anda...");
    try {
      // Pastikan klien dan unit masuk ke template unit di admin panel (jika diinput manual)
      const { clientId, unitId } = await ensureClientAndUnitTemplates(
        clientName,
        activeObject,
        formData,
        fromTemplateClientId,
        fromTemplateUnitId,
        currentUserEmail
      );

      if (formMode === 'edit' && editingId) {
        // FIXED: Simpan selalu sebagai 'draft' dulu
        // Status baru akan diupdate ke 'synced' setelah upload sukses
        await SessionRepository.update(
          editingId,
          {
            clientName: clientName.trim(),
            objectType: activeObject,
            unitData: formData,
            templateClientId: clientId || fromTemplateClientId,
            templateUnitId: unitId || fromTemplateUnitId,
            inspectorEmail: currentUserEmail,
            status: 'draft', // FIXED: draft dulu, bukan synced
          },
          newPhotos,
          deletedPhotos.map(p => p.id)
        );
        // Hapus foto yang didelete dari Drive
        if (deletedPhotos.length > 0 && isOnline) {
          for (const photo of deletedPhotos) {
            if (photo.driveFileId) {
              try {
                await deletePhotoFromDrive(photo.driveFileId, currentUserEmail);
              } catch (e) {
                console.warn('[App] Gagal hapus foto dari Drive:', e);
              }
            }
          }
        }

        if (isOnline) {
  // 🔥 FIX: Set uploadingId DULU, baru await yang lain
  setUploadingId(editingId);
  setUploadProgress({ percentage: 0, loaded: 0, total: newPhotos.length });
  
  // Yield ke event loop biar React sempat render
  await new Promise(resolve => setTimeout(resolve, 50));
  
  try {

            // Ambil session yang sudah diupdate dari IndexedDB
            const updatedSession = await SessionRepository.getById(editingId);
            if (updatedSession) {
              // FIXED: Konversi newPhotos (string dataUrl) ke InspectionPhoto
              // agar bisa dipakai sebagai onlyNewPhotos parameter
              // Kita filter session.photos yang baru (createdAt mendekati sekarang)
              // Cara paling akurat: pakai foto dari updatedSession yang tidak ada di existingPhotos
              const existingPhotoIds = new Set(existingPhotos.map(p => p.id));
              const onlyNewPhotoObjects = updatedSession.photos.filter(
                p => !existingPhotoIds.has(p.id)
              );

              // FIXED: Kirim onlyNewPhotoObjects (bukan null/undefined)
              // api/upload.ts akan countExistingPhotos dan lanjut penomoran
              const { folderId } = await uploadToDrive(
                updatedSession,
                updatedSession.photos,
                (p) => flushSync(() => setUploadProgress(p)),  // ← tambah flushSync
                onlyNewPhotoObjects
              );

              // FIXED: markSynced dipanggil SETELAH uploadToDrive sukses
              await SessionRepository.markSynced(editingId, folderId);
            }
          } catch (uploadErr: any) {
            console.warn('[App] Re-upload setelah edit gagal:', uploadErr);
            // Upload gagal → status tetap 'draft', user bisa sync manual
            if (uploadErr instanceof TokenExpiredError) {
              setIsAuthenticated(false);
              setTokenError(uploadErr.message);
              alert('⚠️ Sesi Drive berakhir. Data disimpan sebagai draft, sync manual nanti.');
            } else {
              alert('⚠️ Data tersimpan tapi gagal upload ke Drive. Sync manual dari Sync Hub.');
            }
          } finally {
            setUploadingId(null);
            setUploadProgress(null);
          }
        } else {
          // Offline → tetap draft, user sync manual nanti
          alert('✅ Data berhasil diperbarui! (Offline — akan di-sync saat online)');
        }

      } else {
        // Create baru — status draft, tunggu manual sync atau auto sync
        await SessionRepository.create(
          {
            clientName: clientName.trim(),
            objectType: activeObject,
            unitData: formData,
            status: 'draft',
            templateClientId: clientId || fromTemplateClientId,
            templateUnitId: unitId || fromTemplateUnitId,
            inspectorEmail: currentUserEmail,
          },
          newPhotos
        );
        alert('✅ Data berhasil disimpan!');
      }

      await refreshData();
      resetForm();
      if (formMode === 'edit') {
        goBack();
      } else {
        setScreenStack(['HOME']);
      }
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.inner?.name === 'QuotaExceededError') {
        alert('⚠️ Penyimpanan penuh! Hapus draft lama atau sync ke Drive.');
      } else {
        alert('Gagal menyimpan: ' + err.message);
      }
    } finally {
      setIsSaving(false);
      setGlobalLoading(null);
    }
  };

  // handleSync dari SyncHub — create baru, kirim semua foto
  const handleSync = async (id: string) => {
    setUploadingId(id);
    setUploadProgress(null);
    setGlobalLoading("Sedang menyinkronkan data...");
    try {
      const session = await SessionRepository.getById(id);
      if (!session) throw new Error('Sesi tidak ditemukan');
      // Sync dari SyncHub = draft baru, kirim semua foto (onlyNewPhotos = null)
      const { folderId } = await uploadToDrive(session, session.photos, (progress) => flushSync(() => setUploadProgress(progress)), null);
      await SessionRepository.markSynced(id, folderId);
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
      setGlobalLoading(null);
    }
  };

  // handleReSyncFromHistory — upload ulang dari History, kirim semua foto
  const handleReSyncFromHistory = async (id: string) => {
    if (!isOnline) { alert('⚠️ Tidak ada koneksi internet.'); return; }
    setUploadingId(id);
    setUploadProgress(null);
    setGlobalLoading("Mengunggah ulang berkas inspeksi...");
    try {
      const session = await SessionRepository.getById(id);
      if (!session) throw new Error('Data tidak ditemukan');
      // Re-sync dari History = kirim semua foto (onlyNewPhotos = null)
      // api/upload.ts akan countExistingPhotos dan skip yang sudah ada
      const { folderId } = await uploadToDrive(session, session.photos, (progress) => flushSync(() => setUploadProgress(progress)), null);
      await SessionRepository.markSynced(id, folderId);
      setUploadProgress(null);
      alert('✅ Data berhasil diupload ulang ke Drive!');
    } catch (err: any) {
      setUploadProgress(null);
      if (err instanceof TokenExpiredError) {
        setIsAuthenticated(false);
        setTokenError(err.message);
        alert(`⚠️ ${err.message}`);
      } else {
        alert('Gagal upload ulang: ' + err.message);
      }
    } finally {
      setUploadingId(null);
      setGlobalLoading(null);
    }
  };

const handleDelete = async (id: string) => {
  if (!confirm('Hapus data ini? Tindakan tidak bisa dibatalkan.')) return;

  const session = await SessionRepository.getById(id);
  if (!session) return;

  // OPTIMISTIC UI UPDATE (WAJIB)
  setHistory(prev => prev.filter(item => item.id !== id));
  setDrafts(prev => prev.filter(item => item.id !== id));

  try {
    // 1. Hapus dari Drive dulu (kalau synced)
    if (session.status === 'synced') {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/delete-inspection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          folderId: session.driveFolderId,
          sessionId: session.id,
          userEmail: currentUserEmail 
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }

      // Hapus lokal di IndexedDB
      await SessionRepository.delete(id);

      // 🔥 LANGSUNG CLEANUP DARI deleted-log SETELAH DELETE SUKSES
      await doPullInspections();
      return;
    }

    // Kalau draft, hapus langsung dari DB lokal
    await SessionRepository.delete(id);

  } catch (err: any) {
    refreshData(); // Kembalikan data ke UI jika gagal
    alert(`⚠️ Gagal hapus: ${err.message}`);
  }
};

  // ── Computed ───────────────────────────────────────────────────────────────

  const specificFields = SPECIFIC_FIELDS[activeObject] || [];
  const objMeta = OBJECT_TYPES.find((o) => o.key === activeObject);
  const totalPhotos = existingPhotos.length + newPhotos.length;
  const userInitial = currentUserName ? currentUserName.charAt(0).toUpperCase() : '?';
  const firstName = currentUserName ? currentUserName.split(' ')[0] : '';
  const roleBadge = currentUserEmail ? getRoleBadge(currentUserEmail) : 'Ahli K3';
  const isOwner = currentUserEmail === OWNER_EMAIL;

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'system-ui, -apple-system, sans-serif', color: T.textPrimary }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes globalMarquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-100%, 0, 0); }
        }
      `}</style>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotos} style={{ display: 'none' }} aria-hidden="true" />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handlePhotos} style={{ display: 'none' }} aria-hidden="true" />
      <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoChange} style={{ display: 'none' }} aria-hidden="true" />

      {/* DESKTOP SIDEBAR - Only show on desktop */}
      {isDesktop && (
        <aside style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 260, background: darkMode ? '#0F172A' : '#FFFFFF', borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', zIndex: 50 }}>
          {/* Logo */}
          <div style={{ padding: 20, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/icons/icon-192.png" alt="ARP" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>
                  Aksara <span style={{ color: '#10B981' }}>Inspect</span>
                </h1>
                <p style={{ fontSize: 10, color: T.textSecondary, marginTop: 2 }}>PWA Inspeksi K3</p>
              </div>
            </div>
          </div>

          {/* User Profile - Only when authenticated */}
          {isAuthenticated && currentUserName && (
            <div style={{ padding: 16, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                {/* Profile Photo with Upload Button */}
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: T.emeraldLight, border: `2px solid ${T.emeraldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: T.emeraldText, overflow: 'hidden' }}>
                    {profilePhotoUrl ? (
                      <img src={profilePhotoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      userInitial
                    )}
                  </div>
                  <button 
                    onClick={() => profilePhotoInputRef.current?.click()}
                    style={{ 
                      position: 'absolute', 
                      bottom: 0, 
                      right: 0, 
                      width: 24, 
                      height: 24, 
                      borderRadius: '50%', 
                      background: '#3B82F6', 
                      border: `2px solid ${T.white}`, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      cursor: 'pointer',
                      fontSize: 12,
                      color: '#FFFFFF'
                    }}
                    title="Upload photo profile"
                  >
                    📷
                  </button>
                </div>
                
                {/* User Info */}
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginBottom: 2 }}>
                    {currentUserName}
                  </div>
                  <div style={{ fontSize: 11, color: T.textSecondary, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentUserEmail}
                  </div>
                  
                  {/* Role Badge Only - Clean design */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ 
                      fontSize: 12, 
                      fontWeight: 700, 
                      padding: '6px 14px', 
                      borderRadius: 20, 
                      background: isOwner ? '#EDE9FE' : T.emeraldLight, 
                      color: isOwner ? '#5B21B6' : T.emeraldText, 
                      border: `1px solid ${isOwner ? '#C4B5FD' : T.emeraldBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      {ICONS.hardHat}{roleBadge}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav style={{ flex: 1, padding: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingLeft: 12 }}>Menu</p>
            {[
              { id: 'HOME', icon: ICONS.home, label: 'Beranda' },
              { id: 'HISTORY', icon: ICONS.clipboard, label: 'Riwayat' },
              { id: 'SYNC_HUB', icon: ICONS.cloudUp, label: 'Sinkronisasi', badge: drafts.length },
              { id: 'REPORT_DASHBOARD', icon: '📄', label: 'Laporan K3' },
              { id: 'ADMIN', icon: ICONS.shield, label: 'Admin Panel' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setScreenStack([item.id as View])}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: view === item.id ? (darkMode ? '#1E3A5F' : '#EFF6FF') : 'transparent',
                  color: view === item.id ? '#3B82F6' : T.textSecondary,
                  fontSize: 13, fontWeight: view === item.id ? 600 : 500,
                  transition: 'all 0.15s', marginBottom: 4, textAlign: 'left'
                }}
              >
                <span style={{ fontSize: 18, opacity: 0.8 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span style={{ background: '#F59E0B', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Quick Action */}
          <div style={{ padding: 16, borderTop: `1px solid ${T.border}` }}>
            <button
              onClick={handleStartInspection}
              style={{ width: '100%', background: '#10B981', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {ICONS.camera}
              Mulai Inspeksi
            </button>
          </div>
        </aside>
      )}

      {/* MOBILE HEADER or DESKTOP TOP HEADER */}
      <header style={{ position: isDesktop ? 'sticky' : 'sticky', top: 0, zIndex: isDesktop ? 40 : 50, background: darkMode ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)', borderBottom: `0.5px solid ${T.border}`, padding: isDesktop ? '0 24px' : '0 16px', paddingTop: isDesktop ? 16 : 'env(safe-area-inset-top)', height: isDesktop ? 64 : `calc(52px + env(safe-area-inset-top))`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: isDesktop ? 'none' : 640, marginLeft: isDesktop ? 260 : 'auto', marginRight: isDesktop ? 0 : 'auto' }}>
        {isDesktop ? (
          /* Desktop Header - Page Title */
          <>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary }}>
              {view === 'HOME' ? 'Dashboard' : view === 'HISTORY' ? 'Riwayat Inspeksi' : view === 'SYNC_HUB' ? 'Sinkronisasi' : view === 'ADMIN' ? 'Admin Panel' : view === 'REPORT_DASHBOARD' ? 'Laporan K3' : view === 'REPORT_WIZARD' ? 'Wizard Laporan' : 'Aksara Inspect'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: isOnline ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${isOnline ? '#6EE7B7' : '#FCA5A5'}` }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#10B981' : '#EF4444' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: isOnline ? '#065F46' : '#B91C1C' }}>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              <button onClick={() => setDarkMode(d => !d)} style={{ width: 36, height: 36, borderRadius: 10, background: darkMode ? '#1E293B' : '#F1F5F9', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }} title="Toggle dark mode">{darkMode ? '☀️' : '🌙'}</button>
              {isAuthenticated ? <button onClick={handleLogout} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${T.redBorder}`, background: T.redLight, color: T.redText }}>Logout</button> : <button onClick={handleLogin} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${T.border}`, background: T.white, color: T.textSecondary }}>Login Google</button>}
            </div>
          </>
        ) : (
          /* Mobile Header - Logo */
          <>
            <button onClick={() => { resetForm(); setScreenStack(['HOME']); }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <img src="/icons/icon-192.png" alt="ARP" style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'cover' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.3px' }}>
                Aksara <span style={{ color: T.emerald500 }}>Inspect</span>
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 20, background: isOnline ? '#ECFDF5' : '#FEF2F2', border: `0.5px solid ${isOnline ? '#6EE7B7' : '#FCA5A5'}` }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: isOnline ? '#10B981' : '#EF4444' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: isOnline ? '#065F46' : '#B91C1C' }}>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              {drafts.length > 0 && (
                <button onClick={() => navigateTo('SYNC_HUB')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `0.5px solid ${T.amberBorder}`, background: T.amberLight, color: T.amber800 }}>
                  Sync <span style={{ background: T.amber400, color: T.amber800, borderRadius: 10, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{drafts.length}</span>
                </button>
              )}
              <button onClick={() => setDarkMode(d => !d)} style={{ width: 32, height: 32, borderRadius: 10, background: darkMode ? '#1E293B' : '#F1F5F9', border: `0.5px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }} title="Toggle dark mode">{darkMode ? '☀️' : '🌙'}</button>
              {isAuthenticated ? <button onClick={handleLogout} style={{ padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `0.5px solid ${T.redBorder}`, background: T.redLight, color: T.redText }}>Logout</button> : <button onClick={handleLogin} style={{ padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `0.5px solid ${T.border}`, background: T.white, color: T.textSecondary }}>Login Google</button>}
            </div>
          </>
        )}
      </header>

      {/* Alerts & User Bar - Desktop has its own section, mobile inline */}
      {!isDesktop && (
        <>
          {tokenError && !isAuthenticated && (
            <div style={{ maxWidth: 640, margin: '10px auto 0', padding: '0 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.redLight, border: `0.5px solid ${T.redBorder}`, borderRadius: 10, padding: '10px 12px' }}>
                <span style={{ fontSize: 14 }}>⚠️</span>
                <p style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.redText }}>{tokenError}</p>
                <button onClick={handleLogin} style={{ fontSize: 11, fontWeight: 700, color: T.redText, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Login ulang</button>
              </div>
            </div>
          )}

          {pullStatus && (
            <div style={{ maxWidth: 640, margin: '8px auto 0', padding: '0 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.emeraldLight, border: `0.5px solid ${T.emeraldBorder}`, borderRadius: 10, padding: '8px 12px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: T.emeraldText }}>{pullStatus}</p>
              </div>
            </div>
          )}

          {pullingDataMessage && (
            <div style={{ maxWidth: 640, margin: '8px auto 0', padding: '0 16px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: darkMode ? '#1e293b' : '#EFF6FF',
                border: `0.5px solid ${darkMode ? '#334155' : '#BFDBFE'}`,
                borderRadius: 10,
                padding: '8px 12px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: `2px solid ${darkMode ? '#334155' : '#DBEAFE'}`,
                  borderTopColor: '#3B82F6',
                  animation: 'spin 1s linear infinite',
                  flexShrink: 0
                }} />
                <p style={{ fontSize: 11, fontWeight: 600, color: darkMode ? '#60A5FA' : '#1D4ED8', margin: 0 }}>
                  {pullingDataMessage}
                </p>
              </div>
            </div>
          )}

          {isAuthenticated && currentUserName && (
            <div style={{ maxWidth: 640, margin: '10px auto 0', padding: '0 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.white, border: `0.5px solid ${T.border}`, borderRadius: 12, padding: '8px 12px' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.emeraldLight, border: `1px solid ${T.emeraldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: T.emeraldText }}>{userInitial}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{currentUserName}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: isOwner ? '#EDE9FE' : T.emeraldLight, color: isOwner ? '#5B21B6' : T.emeraldText, border: `0.5px solid ${isOwner ? '#C4B5FD' : T.emeraldBorder}`, display: 'flex', alignItems: 'center', gap: 3 }}>
                  {ICONS.hardHat}{roleBadge}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* MAIN */}
      <main style={{ maxWidth: isDesktop ? 'none' : 640, margin: isDesktop ? '0 24px' : '0 auto', padding: isDesktop ? '24px 24px 32px' : '16px 16px 100px', marginLeft: isDesktop ? 260 : 'auto', display: 'flex', flexDirection: 'column', gap: isDesktop ? 24 : 16 }}>

        {/* Desktop Alerts - Visible across all views on Desktop */}
        {isDesktop && (
          <>
            {tokenError && !isAuthenticated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.redLight, border: `1px solid ${T.redBorder}`, borderRadius: 12, padding: '12px 16px', maxWidth: 600 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.redText, margin: 0 }}>{tokenError}</p>
                <button onClick={handleLogin} style={{ fontSize: 12, fontWeight: 600, color: T.redText, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Login ulang</button>
              </div>
            )}

            {pullStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.emeraldLight, border: `1px solid ${T.emeraldBorder}`, borderRadius: 12, padding: '12px 16px', maxWidth: 600 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: T.emeraldText, margin: 0 }}>{pullStatus}</p>
              </div>
            )}

            {pullingDataMessage && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: darkMode ? '#1e293b' : '#EFF6FF',
                border: `1px solid ${darkMode ? '#334155' : '#BFDBFE'}`,
                borderRadius: 12,
                padding: '12px 16px',
                maxWidth: 600,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }}>
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: `2px solid ${darkMode ? '#334155' : '#DBEAFE'}`,
                  borderTopColor: '#3B82F6',
                  animation: 'spin 1s linear infinite',
                  flexShrink: 0
                }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: darkMode ? '#60A5FA' : '#1D4ED8', margin: 0 }}>
                  {pullingDataMessage}
                </p>
              </div>
            )}
          </>
        )}

        {view === 'HOME' && (
          <>

            <div>
              <h1 style={{ fontSize: isDesktop ? 24 : 16, fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.3px' }}>
                {firstName ? `Selamat datang, ${firstName}` : 'Beranda Inspeksi'}
              </h1>
              <p style={{ fontSize: isDesktop ? 14 : 11, color: T.textSecondary, marginTop: isDesktop ? 4 : 2 }}>Mulai inspeksi baru atau pantau status lapangan</p>
            </div>
            <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'none', gap: isDesktop ? 16 : 8 }}>
              <StatCard label="Draft tertunda" value={drafts.length} color={T.amber600} dot={T.amber600} />
              <StatCard label="Sudah disinkronkan" value={history.length} color={T.emerald500} dot={T.emerald500} />
              {isDesktop && (
                <>
                  <StatCard label="Total Inspeksi" value={drafts.length + history.length} color="#3B82F6" dot="#3B82F6" />
                  <StatCard label="Total Foto" value={existingPhotos.length + newPhotos.length} color="#8B5CF6" dot="#8B5CF6" />
                </>
              )}
            </div>
            <div>
              <Divider label="Inspeksi cepat" />
              {/* UPGRADE UI WARNA TEKS DARI TEMPLATE UNIT */}
              <button onClick={handleStartInspection} style={{ width: '100%', marginTop: 8, background: T.emerald900, border: 'none', borderRadius: 16, padding: '16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', pointerEvents: 'none' }} />
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.emeraldBorder, flexShrink: 0, position: 'relative', zIndex: 1 }}>{ICONS.factory}</div>
                <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>Dari Template Unit</p>
                  {/* FIX: MENGUNCI WARNA TEKS MENJADI CERAH (PUTIH TRANSPARAN 75%) AGAR SELALU TERBACA DI BACKGROUND HIJAU TUA */}
                  <p style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.75)', marginTop: 2 }}>Pilih klien → unit → form otomatis terisi</p>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, position: 'relative', zIndex: 1 }}>›</span>
              </button>
            </div>
            {drafts.length > 0 && (
              <div style={{ background: T.amberLight, border: `0.5px solid ${T.amberBorder}`, borderRadius: 12, padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: T.amberMid, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: T.amber600 }}>{ICONS.package}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: T.amber800 }}>{drafts.length} draft belum di-sync</p>
                  <p style={{ fontSize: 10, color: T.amber700, marginTop: 1 }}>Hubungkan internet & upload ke Drive</p>
                </div>
                <button onClick={() => navigateTo('SYNC_HUB')} style={{ padding: '5px 10px', background: T.amber600, color: '#fff', borderRadius: 8, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0 }}>Buka Sync</button>
              </div>
            )}
            <div>
              <Divider label="Atau pilih jenis manual" />
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: isDesktop ? 16 : 8, marginTop: isDesktop ? 12 : 8 }}>
                {OBJECT_TYPES.map((obj) => (
                  <ObjCard key={obj.key} obj={obj} onClick={() => handleSelectObject(obj.key)} />
                ))}
              </div>
            </div>
          </>
        )}

        {view === 'PICK_UNIT' && (
          <ClientPicker onPick={handleUnitPicked} onManual={handleManualPick} onCancel={goBack} />
        )}

{view === 'FORM' && (
          <FormView
            formMode={formMode} 
            activeObject={activeObject} 
            clientName={clientName}
            clientSuggestions={clientSuggestions} 
            formData={formData} 
            commonFields={COMMON_FIELDS}
            specificFields={specificFields} 
            existingPhotos={existingPhotos} 
            newPhotos={newPhotos}
            totalPhotos={totalPhotos} 
            isSaving={isSaving} 
            objMeta={objMeta}
            showClientDropdown={showClientDropdown}
            
            // Masukin props di bawah ini CUMA SEKALI:
            uploadingId={uploadingId}
            uploadProgress={uploadProgress}
            editingId={editingId}
            isProcessingGallery={isProcessingGallery}
            galleryProcessProgress={galleryProcessProgress}
            
            onClientNameChange={setClientName}
            onClientNameFocus={() => setShowClientDropdown(true)}
            onClientSuggestionSelect={(name) => { setClientName(name); setShowClientDropdown(false); }}
            onFieldChange={handleFieldChange}
            onAddPhoto={async (dataUrl) => {
              const compressed = await compressPhoto(dataUrl);
              setNewPhotos((prev) => [...prev, compressed]);
            }}
            onGalleryClick={() => galleryInputRef.current?.click()}
            onRemoveExistingPhoto={removeExistingPhoto}
            onRemoveNewPhoto={removeNewPhoto}
            onSave={handleSaveForm}
            onCancel={() => { resetForm(); goBack(); }}
          />
        )}

        {view === 'SYNC_HUB' && (
          <SyncHub
            drafts={drafts} isAuthenticated={isAuthenticated} uploadingId={uploadingId}
            uploadProgress={uploadProgress} isOnline={isOnline} autoSync={autoSync}
            onAutoSyncToggle={handleAutoSyncToggle} onLogin={handleLogin}
            onEdit={handleEdit} onDelete={handleDelete} onSync={handleSync}
            onSyncAll={triggerAutoSync}
          />
        )}

        {view === 'HISTORY' && (
          <HistoryView
            history={history} onEdit={handleEdit} onDelete={handleDelete}
            onReSync={handleReSyncFromHistory} isAuthenticated={isAuthenticated}
            isOnline={isOnline} uploadingId={uploadingId} uploadProgress={uploadProgress}
            currentUserEmail={currentUserEmail} // TAMBAHKAN BARIS INI
          />
        )}

        {view === 'ADMIN' && (
          <AdminPanel currentUserEmail={currentUserEmail} onClose={goBack} />
        )}

        {view === 'REPORT_DASHBOARD' && (
          <ReportDashboard
            onNewReport={() => navigateTo('REPORT_WIZARD')}
            onEditReport={(id) => {
              setSelectedReportId(id);
              navigateTo('REPORT_WIZARD');
            }}
            setCurrentView={navigateTo}
          />
        )}

        {view === 'REPORT_WIZARD' && (
          <ReportWizard
            reportId={selectedReportId}
            onClose={() => {
              setSelectedReportId(null);
              goBack();
            }}
          />
        )}

      </main>



      {/* BOTTOM NAV + FAB - Only for Mobile */}
      {!isDesktop && (view === 'HOME' || view === 'HISTORY' || view === 'SYNC_HUB' || view === 'ADMIN' || view === 'REPORT_DASHBOARD') && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: darkMode ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)', borderTop: `0.5px solid ${T.border}`, padding: '8px 16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-around', maxWidth: 640, margin: '0 auto', zIndex: 40 }}>
          <NavTab icon={ICONS.home} label="Beranda" active={view === 'HOME'} onClick={() => { resetForm(); setScreenStack(['HOME']); }} />
          <NavTab icon={ICONS.clipboard} label="Riwayat" active={view === 'HISTORY'} onClick={() => setScreenStack(['HISTORY'])} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <button onClick={handleStartInspection} aria-label="Mulai inspeksi baru" style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', marginTop: -32, WebkitTapHighlightColor: 'transparent', padding: 0 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: T.emerald500, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: '2.5px solid #fff', boxShadow: `0 0 0 1px ${T.emeraldBorder}` }}>{ICONS.camera}</div>
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: T.emerald500, letterSpacing: '0.02em' }}>Inspeksi</span>
          </div>
          <NavTab icon={<span style={{ fontSize: 18 }}>📄</span>} label="Laporan" active={view === 'REPORT_DASHBOARD'} onClick={() => setScreenStack(['REPORT_DASHBOARD'])} />
          <NavTab icon={ICONS.cloudUp} label="Sync" active={view === 'SYNC_HUB'} onClick={() => setScreenStack(['SYNC_HUB'])} />
        </nav>
      )}

      {globalLoading && (
        <GlobalFunnyLoader message={globalLoading} />
      )}
    </div>
  );
}

function GlobalFunnyLoader({ message }: { message: string }) {
  const marqueeText = FUNNY_LOADER_MESSAGES.join("   •   ");
  
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.82)', backdropFilter: 'blur(10px)',
      color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* 3D Loading Card */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 24, padding: 32, maxWidth: 320, width: '85%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)', textAlign: 'center',
        transform: 'translateY(-20px)',
      }}>
        <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 20 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '4px solid rgba(16, 185, 129, 0.2)',
            borderTopColor: '#10B981',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{
            position: 'absolute', inset: 12, borderRadius: '50%',
            border: '4px solid rgba(59, 130, 246, 0.2)',
            borderBottomColor: '#3B82F6',
            animation: 'spin 1.5s linear infinite reverse'
          }} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, animation: 'pulse 2s infinite'
          }}>
            ⚡
          </div>
        </div>

        <h4 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: '#10B981', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Memproses Data
        </h4>
        <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.5 }}>
          {message}
        </p>
      </div>

      {/* Running Marquee Banner */}
      <div style={{
        position: 'absolute', bottom: 50, left: 0, right: 0,
        background: '#10B981', color: '#fff', padding: '12px 0',
        overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex',
        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
        transform: 'rotate(-1.5deg) scale(1.02)',
      }}>
        <div style={{
          display: 'inline-block',
          paddingLeft: '100%',
          animation: 'globalMarquee 40s linear infinite',
          fontSize: 13, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {marqueeText}   •   {marqueeText}
        </div>
      </div>

    </div>
  );
}