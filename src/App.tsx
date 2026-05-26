// src/App.tsx
// REDESIGN: Premium modern UI — emerald brand, bottom nav + FAB kamera,
//           stat cards, hero template, object grid 2-col

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SessionRepository,
  RoleRepository,
  type InspectionSession,
  type InspectionPhoto,
} from './db/db';
import {
  uploadToDrive,
  getValidToken,
  saveToken,
  clearToken,
  TokenExpiredError,
  type UploadProgress,
} from './services/driveService';
import { GOOGLE_CONFIG } from './config';
import { FormView } from './components/FormView';
import { SyncHub } from './components/SyncHub';
import { HistoryView } from './components/HistoryView';
import { AdminPanel } from './components/AdminPanel';
import { ClientPicker, type PickedUnit } from './components/ClientPicker';

// ─── TYPES ───────────────────────────────────────────────────────────────────

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

// ─── FIELD DEFINITIONS ───────────────────────────────────────────────────────

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
  Angkur: [
    { name: 'jenisAngkur',     label: 'Jenis Angkur',           type: 'select', required: true, options: ['Chemical Anchor','Mechanical Anchor','Wedge Anchor','Sleeve Anchor','Expansion Anchor','Lainnya'] },
    { name: 'kapasitasTarik',  label: 'Kapasitas Tarik (MBS)',  type: 'number', unit: 'kN', required: true },
    { name: 'kapasitasGeser',  label: 'Kapasitas Geser',        type: 'number', unit: 'kN' },
    { name: 'diameterAngkur',  label: 'Diameter Angkur',        type: 'number', unit: 'mm', required: true },
    { name: 'kedalamanPasang', label: 'Kedalaman Pasang',       type: 'number', unit: 'mm', required: true },
    { name: 'materialAngkur',  label: 'Material Angkur',        type: 'select', options: ['Stainless Steel 316','Stainless Steel 304','Galvanized Steel','Carbon Steel','Lainnya'] },
    { name: 'jumlahAngkur',    label: 'Jumlah Angkur Diperiksa',type: 'number', unit: 'pcs', required: true },
    { name: 'lokasiKodeTitik', label: 'Lokasi / Kode Titik',    type: 'text',   placeholder: 'Contoh: Grid-A1, Lantai 5' },
  ],
  PAA: [
    { name: 'jenisPAA',            label: 'Jenis Pesawat Angkat',       type: 'select', required: true, options: ['Overhead Crane','Mobile Crane','Tower Crane','Crawler Crane','Forklift','Reach Stacker','Hoist (Electric)','Hoist (Manual)','Gondola','Pallet Truck','Lainnya'] },
    { name: 'kapasitasAngkat',     label: 'Kapasitas Angkat Maksimum',  type: 'number', unit: 'Ton', required: true },
    { name: 'jangkauanBoom',       label: 'Jangkauan / Span Boom',      type: 'number', unit: 'm' },
    { name: 'tinggiAngkatMaks',    label: 'Tinggi Angkat Maksimum',     type: 'number', unit: 'm' },
    { name: 'jenisPenggerak',      label: 'Jenis Penggerak',            type: 'select', options: ['Electric','Diesel','Hydraulic','Manual','Pneumatic','Lainnya'] },
    { name: 'nomorPlatRegistrasi', label: 'Nomor Plat / Registrasi',    type: 'text',   placeholder: 'Contoh: B 1234 XYZ' },
    { name: 'nomorIzinOperasi',    label: 'Nomor Izin Operasi',         type: 'text',   placeholder: 'Nomor SK/Izin dari Disnaker' },
  ],
  PUBT: [
    { name: 'jenisPUBT',         label: 'Jenis Pesawat Uap/Bejana',  type: 'select', required: true, options: ['Boiler Pipa Api','Boiler Pipa Air','Bejana Tekan','Tangki Refrigerasi','Autoclave','Heat Exchanger','Pressure Vessel','Air Receiver','Lainnya'] },
    { name: 'volume',            label: 'Volume',                     type: 'number', unit: 'Liter', required: true },
    { name: 'tekananKerjaMaks',  label: 'Tekanan Kerja Maksimum',     type: 'number', unit: 'Bar', required: true },
    { name: 'temperaturKerja',   label: 'Temperatur Kerja',           type: 'number', unit: '°C' },
    { name: 'mediaIsi',          label: 'Media Isi',                  type: 'select', options: ['Steam / Uap Air','Air Bertekanan','Gas Nitrogen','Gas CO2','Freon/Refrigerant','Oli Hidraulik','BBM / Avtur','LPG / LNG','Lainnya'] },
    { name: 'kapasitasProduksi', label: 'Kapasitas Produksi',         type: 'number', unit: 'kg/jam' },
    { name: 'nomorNDT',          label: 'Nomor NDT Terakhir',         type: 'text',   placeholder: 'Nomor sertifikat NDT' },
    { name: 'tanggalNDT',        label: 'Tanggal NDT Terakhir',       type: 'text',   placeholder: 'YYYY-MM-DD' },
  ],
  PTP: [
    { name: 'jenisPTP',      label: 'Jenis Pesawat Tenaga',  type: 'select', required: true, options: ['Motor Listrik','Generator / Genset','Kompresor Udara','Kompresor Gas','Pompa Sentrifugal','Pompa Reciprocating','Mesin Produksi','Turbin','Lainnya'] },
    { name: 'daya',          label: 'Daya',                  type: 'number', unit: 'kW', required: true },
    { name: 'dayaHP',        label: 'Daya (HP)',             type: 'number', unit: 'HP' },
    { name: 'putaranRPM',    label: 'Putaran',               type: 'number', unit: 'RPM' },
    { name: 'mediaKerja',    label: 'Media Kerja',           type: 'select', options: ['Udara','Air','Oli','Gas','Steam','Bahan Kimia','Lainnya'] },
    { name: 'tekananKerjaPTP', label: 'Tekanan Kerja',       type: 'number', unit: 'Bar' },
    { name: 'tegangan',      label: 'Tegangan Listrik',      type: 'number', unit: 'Volt' },
    { name: 'arusListrik',   label: 'Arus Listrik',          type: 'number', unit: 'Ampere' },
  ],
  Listrik: [
    { name: 'jenisListrik',       label: 'Jenis Instalasi',        type: 'select', required: true, options: ['Instalasi Listrik Umum','Panel Distribusi (MDP)','Panel Distribusi (SDP)','Transformator','Genset / UPS','Instalasi Hazardous Area','Lainnya'] },
    { name: 'dayaTerpasang',      label: 'Daya Terpasang',         type: 'number', unit: 'kVA', required: true },
    { name: 'teganganSistem',     label: 'Tegangan Sistem',        type: 'select', options: ['380 V (3 Phase)','220 V (1 Phase)','20 kV (Menengah)','150 kV (Tinggi)','Lainnya'] },
    { name: 'luasArea',           label: 'Luas Area Instalasi',    type: 'number', unit: 'm²' },
    { name: 'jumlahPanel',        label: 'Jumlah Panel',           type: 'number', unit: 'unit' },
    { name: 'tahananIsolasi',     label: 'Tahanan Isolasi',        type: 'number', unit: 'MΩ' },
    { name: 'nilaiGrounding',     label: 'Nilai Grounding',        type: 'number', unit: 'Ω' },
    { name: 'nomorSertifikatSLO', label: 'Nomor Sertifikat SLO',  type: 'text',   placeholder: 'Nomor SLO dari PLN/Disnaker' },
  ],
  'Penyalur Petir': [
    { name: 'jenisPenyalurPetir',   label: 'Jenis Sistem Penangkal',       type: 'select', required: true, options: ['Sistem Franklin (Konvensional)','Sistem Faraday (Sangkar)','Early Streamer Emission (ESE)','Sistem Kawat Catenary','Lainnya'] },
    { name: 'luasAreaPetir',        label: 'Luas Area yang Dilindungi',    type: 'number', unit: 'm²', required: true },
    { name: 'tinggiTiangPenangkal', label: 'Tinggi Tiang Penangkal',       type: 'number', unit: 'm', required: true },
    { name: 'tahananPembumian',     label: 'Nilai Tahanan Pembumian',      type: 'number', unit: 'Ω', required: true },
    { name: 'jumlahTitikGrounding', label: 'Jumlah Titik Grounding',       type: 'number', unit: 'titik' },
    { name: 'jenisElektroda',       label: 'Jenis Elektroda Pembumian',    type: 'select', options: ['Copper Rod','Copper Plate','Copper Strip','Galvanized Rod','Lainnya'] },
    { name: 'kedalamanElektroda',   label: 'Kedalaman Elektroda',          type: 'number', unit: 'm' },
  ],
  Lift: [
    { name: 'jenisLift',          label: 'Jenis Elevator/Eskalator', type: 'select', required: true, options: ['Lift Penumpang','Lift Barang','Lift Barang + Penumpang','Lift Panoramik','Lift Rumah Sakit (Dumbwaiter)','Eskalator','Moving Walk / Travelator','Lainnya'] },
    { name: 'kapasitasKg',        label: 'Kapasitas',                type: 'number', unit: 'kg', required: true },
    { name: 'kapasitasOrang',     label: 'Kapasitas',                type: 'number', unit: 'orang' },
    { name: 'kecepatanLift',      label: 'Kecepatan',                type: 'number', unit: 'm/s', required: true },
    { name: 'jumlahLantai',       label: 'Jumlah Lantai / Stop',     type: 'number', unit: 'lantai', required: true },
    { name: 'jenisPenggerakLift', label: 'Jenis Penggerak',          type: 'select', options: ['Traction (MRL)','Traction (Machine Room)','Hydraulic','Rack & Pinion','Lainnya'] },
    { name: 'nomorIzinLift',      label: 'Nomor Izin Operasi',       type: 'text',   placeholder: 'Nomor SK dari Disnaker' },
    { name: 'tanggalIzinBerlaku', label: 'Berlaku Hingga',           type: 'text',   placeholder: 'YYYY-MM-DD' },
  ],
  'Proteksi Kebakaran': [
    { name: 'jenisProteksi',      label: 'Jenis Sistem Proteksi',    type: 'select', required: true, options: ['APAR (Portable)','Hydrant Box + Pillar','Sprinkler Otomatis','Fire Alarm System','Clean Agent System (FM200, NOVEC)','Foam System','CO2 System','Lainnya'] },
    { name: 'jumlahUnitAPAR',     label: 'Jumlah Unit APAR',         type: 'number', unit: 'unit' },
    { name: 'kapasitasMedia',     label: 'Kapasitas Media Pemadam',  type: 'number', unit: 'kg', required: true },
    { name: 'luasAreaProteksi',   label: 'Luas Area Proteksi',       type: 'number', unit: 'm²', required: true },
    { name: 'jumlahHeadSprinkler',label: 'Jumlah Head Sprinkler',    type: 'number', unit: 'pcs' },
    { name: 'tekananSistem',      label: 'Tekanan Sistem',           type: 'number', unit: 'Bar', required: true },
    { name: 'mediaPemadam',       label: 'Jenis Media Pemadam',      type: 'select', options: ['Dry Chemical Powder','CO2','AFFF Foam','FM200','NOVEC 1230','Halon','Air (Water Mist)','Lainnya'] },
    { name: 'jumlahHydrant',      label: 'Jumlah Hydrant',           type: 'number', unit: 'unit' },
  ],
};

// Icon SVG inline — pakai path sederhana agar tidak bergantung webfont
// Semua 20×20 viewBox, stroke currentColor
const ICONS = {
  // Angkur: baut/hex bolt — reliable cross-platform
  angkur: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <polygon points="10,2 13.5,5.5 13.5,9 10,12.5 6.5,9 6.5,5.5" />
      <line x1="10" y1="12.5" x2="10" y2="18" />
      <line x1="7.5" y1="15.5" x2="12.5" y2="15.5" />
    </svg>
  ),
  // PAA: crane hook
  paa: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <line x1="10" y1="2" x2="10" y2="8" />
      <path d="M4 8 h12 v2 l-4 6 H8 l-4-6 V8z" />
      <line x1="10" y1="16" x2="10" y2="18" />
    </svg>
  ),
  // PUBT: pressure gauge dial
  pubt: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M4 13 A6 6 0 1 1 16 13" />
      <line x1="10" y1="11" x2="13" y2="7" />
      <circle cx="10" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <line x1="10" y1="14.5" x2="10" y2="17" />
    </svg>
  ),
  // PTP: cog/gear
  ptp: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  ),
  // Listrik: lightning bolt
  listrik: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <polyline points="12,2 7,11 11,11 8,18 15,8 10,8" />
    </svg>
  ),
  // Petir: cloud + bolt
  petir: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <path d="M5 10.5 A4 4 0 0 1 13 8 A3 3 0 0 1 16 11 H9" />
      <polyline points="11,11 8,16 12,16 9,20" />
    </svg>
  ),
  // Lift: elevator box + arrow up-down
  lift: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="4" y="2" width="12" height="16" rx="1.5" />
      <line x1="10" y1="2" x2="10" y2="18" />
      <polyline points="7,6 10,3 13,6" />
      <polyline points="7,14 10,17 13,14" />
    </svg>
  ),
  // Proteksi Kebakaran: fire extinguisher silhouette
  kebakaran: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
      <rect x="7" y="7" width="7" height="10" rx="2" />
      <line x1="10.5" y1="7" x2="10.5" y2="4" />
      <line x1="8" y1="4" x2="13" y2="4" />
      <path d="M14 9 Q17 9 17 7" />
      <line x1="10.5" y1="10" x2="10.5" y2="13" />
    </svg>
  ),
  // Kamera
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  // Home
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  // Clipboard
  clipboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  ),
  // Cloud upload
  cloudUp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true">
      <polyline points="16,16 12,12 8,16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  ),
  // Shield
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9,12 11,14 15,10" />
    </svg>
  ),
  // Building/factory
  factory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
      <path d="M2 20V10l7-5v5l7-5v5l4-2v12H2z" />
      <rect x="8" y="14" width="3" height="6" />
      <rect x="13" y="14" width="3" height="6" />
    </svg>
  ),
  // Package
  package: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  // Chevron right
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
      <polyline points="9,18 15,12 9,6" />
    </svg>
  ),
  // Hard hat
  hardHat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" aria-hidden="true">
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z" />
      <path d="M10 5V3m4 2V3" />
      <path d="M6 15V9a6 6 0 0 1 12 0v6" />
    </svg>
  ),
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

// ─── OAUTH ───────────────────────────────────────────────────────────────────

function buildOAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    redirect_uri: window.location.origin,
    response_type: 'token',
    scope: GOOGLE_CONFIG.scope + ' email profile',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function validateForm(clientName: string, formData: Record<string, string>, activeObject: string): string[] {
  const errors: string[] = [];
  if (!clientName.trim()) errors.push('Nama Perusahaan Klien');
  const requiredCommon = COMMON_FIELDS.filter((f) => f.required && !formData[f.name]?.trim());
  const requiredSpecific = (SPECIFIC_FIELDS[activeObject] || []).filter((f) => f.required && !formData[f.name]?.trim());
  return [...errors, ...requiredCommon.map((f) => f.label), ...requiredSpecific.map((f) => f.label)];
}

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

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
// Semua warna & spacing terpusat di sini agar mudah diganti

const T = {
  // Brand
  emerald500: '#10B981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald900: '#065F46',
  emeraldLight: '#ECFDF5',
  emeraldBorder: '#6EE7B7',
  emeraldText: '#065F46',

  // Amber
  amber400: '#FCD34D',
  amber500: '#F59E0B',
  amber600: '#D97706',
  amber700: '#B45309',
  amber800: '#92400E',
  amberLight: '#FFFBEB',
  amberBorder: '#FDE68A',
  amberMid: '#FEF3C7',

  // Red
  redLight: '#FEF2F2',
  redBorder: '#FCA5A5',
  redText: '#B91C1C',

  // Neutral
  bg: '#F7F8FA',
  white: '#FFFFFF',
  border: 'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.15)',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

/** Stat metric card */
function StatCard({ label, value, color, dot }: { label: string; value: number | string; color: string; dot: string }) {
  return (
    <div style={{
      background: T.white,
      border: `0.5px solid ${T.border}`,
      borderRadius: 12,
      padding: '12px 14px',
      flex: 1,
    }}>
      <p style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color, letterSpacing: '-0.5px', margin: '2px 0' }}>{value}</p>
      <p style={{ fontSize: 10, color: T.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: dot }} />
        {color === T.amber600 ? 'Belum di-sync' : 'Bulan ini'}
      </p>
    </div>
  );
}

/** Section divider dengan label */
function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 0.5, background: T.border }} />
    </div>
  );
}

/** Object type card di grid */
function ObjCard({ obj, onClick }: { obj: typeof OBJECT_TYPES[0]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: T.white,
        border: `0.5px solid ${T.border}`,
        borderRadius: 12,
        padding: 12,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.emerald500;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: T.emeraldLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.emerald600,
        }}>
          {obj.icon}
        </div>
        <span style={{ color: T.textMuted }}>{ICONS.chevronRight}</span>
      </div>
      <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{obj.label}</p>
      <p style={{ fontSize: 10, color: T.textSecondary }}>{obj.desc}</p>
    </button>
  );
}

/** Bottom nav tab */
function NavTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '4px 0',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
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
  const [view, setView] = useState<View>('HOME');

  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

  // Data
  const [drafts, setDrafts] = useState<SessionWithPhotos[]>([]);
  const [history, setHistory] = useState<SessionWithPhotos[]>([]);
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);

  // Form
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeObject, setActiveObject] = useState('');
  const [clientName, setClientName] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [existingPhotos, setExistingPhotos] = useState<InspectionPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const [fromTemplateClientId, setFromTemplateClientId] = useState<string | undefined>();
  const [fromTemplateUnitId, setFromTemplateUnitId] = useState<string | undefined>();

  // UI
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

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

  const checkAndSetRole = useCallback(async (email: string, name: string) => {
    await RoleRepository.seedIfEmpty(email, name);
    const admin = await RoleRepository.isAdmin(email);
    setIsAdmin(admin);
    setRoleChecked(true);
  }, []);

  // ── Auth on mount ─────────────────────────────────────────────────────────

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
        fetchUserEmail(token).then((info) => {
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
          setTokenError('Sesi Google Drive berakhir. Silakan login ulang.');
        }
        setRoleChecked(true);
      }
    }
    refreshData();
  }, [refreshData, checkAndSetRole]);

  // ── Form helpers ──────────────────────────────────────────────────────────

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

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogin = () => { setTokenError(null); window.location.href = buildOAuthUrl(); };

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setCurrentUserEmail('');
    setCurrentUserName('');
    setIsAdmin(false);
    localStorage.removeItem('aksara_user_email');
    localStorage.removeItem('aksara_user_name');
  };

  const handleStartInspection = () => { resetForm(); setView('PICK_UNIT'); };

  const handleUnitPicked = (picked: PickedUnit) => {
    resetForm();
    setActiveObject(picked.unit.objectType);
    setClientName(picked.client.name);
    setFormData({ ...picked.unit.unitData });
    setFromTemplateClientId(picked.client.id);
    setFromTemplateUnitId(picked.unit.id);
    setFormMode('create');
    setView('FORM');
  };

  const handleManualPick = (objectType: string) => {
    resetForm();
    setActiveObject(objectType);
    setFormMode('create');
    setView('FORM');
  };

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
      reader.onloadend = () => setNewPhotos((prev) => [...prev, reader.result as string]);
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
          { clientName: clientName.trim(), objectType: activeObject, unitData: formData, templateClientId: fromTemplateClientId, templateUnitId: fromTemplateUnitId, inspectorEmail: currentUserEmail },
          newPhotos,
          deletedPhotoIds
        );
        alert('✅ Data berhasil diperbarui!');
      } else {
        await SessionRepository.create(
          { clientName: clientName.trim(), objectType: activeObject, unitData: formData, status: 'draft', templateClientId: fromTemplateClientId, templateUnitId: fromTemplateUnitId, inspectorEmail: currentUserEmail },
          newPhotos
        );
        alert('✅ Data berhasil disimpan!');
      }
      await refreshData();
      resetForm();
      setView('HOME');
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.inner?.name === 'QuotaExceededError') {
        alert('⚠️ Penyimpanan penuh! Hapus draft lama atau sync ke Drive.');
      } else {
        alert('Gagal menyimpan: ' + err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async (id: string) => {
    if (!isAuthenticated) { alert('⚠️ Login Google Drive terlebih dahulu!'); return; }
    setUploadingId(id);
    setUploadProgress(null);
    try {
      const session = await SessionRepository.getById(id);
      if (!session) throw new Error('Sesi tidak ditemukan');
      await uploadToDrive(session, session.photos, (progress) => setUploadProgress(progress));
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

  // ── Computed ──────────────────────────────────────────────────────────────

  const specificFields = SPECIFIC_FIELDS[activeObject] || [];
  const objMeta = OBJECT_TYPES.find((o) => o.key === activeObject);
  const totalPhotos = existingPhotos.length + newPhotos.length;
  const userInitial = currentUserName ? currentUserName.charAt(0).toUpperCase() : '?';
  const firstName = currentUserName ? currentUserName.split(' ')[0] : '';

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'system-ui, -apple-system, sans-serif', color: T.textPrimary }}>

      {/* ── NAVBAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(8px)',
        borderBottom: `0.5px solid ${T.border}`,
        padding: '0 16px',
        height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 640, margin: '0 auto',
      }}>
        {/* Brand */}
        <button
          onClick={() => { resetForm(); setView('HOME'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: T.emerald500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 800,
          }}>A</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.3px' }}>
            Aksara <span style={{ color: T.emerald500 }}>Inspect</span>
          </span>
        </button>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Riwayat */}
          <button
            onClick={() => setView('HISTORY')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 20,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: `0.5px solid ${view === 'HISTORY' ? T.emeraldBorder : T.border}`,
              background: view === 'HISTORY' ? T.emeraldLight : T.white,
              color: view === 'HISTORY' ? T.emeraldText : T.textSecondary,
            }}
          >
            Riwayat
            {history.length > 0 && (
              <span style={{ background: T.emeraldLight, color: T.emeraldText, borderRadius: 10, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>
                {history.length}
              </span>
            )}
          </button>

          {/* Sync */}
          {drafts.length > 0 && (
            <button
              onClick={() => setView('SYNC_HUB')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `0.5px solid ${T.amberBorder}`,
                background: T.amberLight,
                color: T.amber800,
              }}
            >
              Sync
              <span style={{ background: T.amber400, color: T.amber800, borderRadius: 10, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>
                {drafts.length}
              </span>
            </button>
          )}

          {/* Admin */}
          {roleChecked && isAdmin && (
            <button
              onClick={() => setView('ADMIN')}
              style={{
                padding: '5px 10px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `0.5px solid ${view === 'ADMIN' ? '#C4B5FD' : T.border}`,
                background: view === 'ADMIN' ? '#EDE9FE' : T.white,
                color: view === 'ADMIN' ? '#5B21B6' : T.textSecondary,
              }}
            >
              Admin
            </button>
          )}

          {/* Auth */}
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              title={currentUserEmail}
              style={{
                padding: '5px 10px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `0.5px solid ${T.redBorder}`,
                background: T.redLight, color: T.redText,
              }}
            >
              Logout
            </button>
          ) : (
            <button
              onClick={handleLogin}
              style={{
                padding: '5px 10px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `0.5px solid ${T.border}`,
                background: T.white, color: T.textSecondary,
              }}
            >
              Login Google
            </button>
          )}
        </div>
      </header>

      {/* ── TOKEN ERROR BANNER ── */}
      {tokenError && !isAuthenticated && (
        <div style={{ maxWidth: 640, margin: '10px auto 0', padding: '0 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.redLight, border: `0.5px solid ${T.redBorder}`,
            borderRadius: 10, padding: '10px 12px',
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <p style={{ flex: 1, fontSize: 12, fontWeight: 500, color: T.redText }}>{tokenError}</p>
            <button
              onClick={handleLogin}
              style={{ fontSize: 11, fontWeight: 700, color: T.redText, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Login ulang
            </button>
          </div>
        </div>
      )}

      {/* ── USER BAR ── */}
      {isAuthenticated && currentUserName && (
        <div style={{ maxWidth: 640, margin: '10px auto 0', padding: '0 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.white, border: `0.5px solid ${T.border}`,
            borderRadius: 12, padding: '8px 12px',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: T.emeraldLight, border: `1px solid ${T.emeraldBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: T.emeraldText,
            }}>
              {userInitial}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{currentUserName}</span>
            <span style={{
              marginLeft: 'auto', fontSize: 10, fontWeight: 600,
              padding: '3px 8px', borderRadius: 20,
              background: isAdmin ? '#EDE9FE' : T.emeraldLight,
              color: isAdmin ? '#5B21B6' : T.emeraldText,
              border: `0.5px solid ${isAdmin ? '#C4B5FD' : T.emeraldBorder}`,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              {ICONS.hardHat}
              {isAdmin ? 'Admin' : 'Ahli K3'}
            </span>
          </div>
        </div>
      )}

      {/* ── MAIN ── */}
      <main style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '16px 16px 100px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>

        {/* ── HOME ── */}
        {view === 'HOME' && (
          <>
            {/* Greeting */}
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.3px' }}>
                {firstName ? `Selamat datang, ${firstName}` : 'Beranda Inspeksi'}
              </h1>
              <p style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>
                Mulai inspeksi baru atau pantau status lapangan
              </p>
            </div>

            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 8 }}>
              <StatCard label="Draft tertunda" value={drafts.length} color={T.amber600} dot={T.amber600} />
              <StatCard label="Selesai bulan ini" value={history.length} color={T.emerald500} dot={T.emerald500} />
            </div>

            {/* Hero: template */}
            <div>
              <Divider label="Inspeksi cepat" />
              <button
                onClick={handleStartInspection}
                style={{
                  width: '100%',
                  marginTop: 8,
                  background: T.emerald900,
                  border: 'none',
                  borderRadius: 16,
                  padding: '16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* decorative circles */}
                <div style={{ position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', right: 30, bottom: -30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.10)', pointerEvents: 'none' }} />

                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.emeraldBorder, flexShrink: 0, position: 'relative', zIndex: 1,
                }}>
                  {ICONS.factory}
                </div>
                <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Dari Template Unit</p>
                  <p style={{ fontSize: 11, color: T.emeraldBorder, marginTop: 2 }}>Pilih klien → unit → form otomatis terisi</p>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, position: 'relative', zIndex: 1 }}>›</span>
              </button>
            </div>

            {/* Draft alert */}
            {drafts.length > 0 && (
              <div style={{
                background: T.amberLight, border: `0.5px solid ${T.amberBorder}`,
                borderRadius: 12, padding: '12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: T.amberMid,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, color: T.amber600,
                }}>
                  {ICONS.package}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: T.amber800 }}>{drafts.length} draft belum di-sync</p>
                  <p style={{ fontSize: 10, color: T.amber700, marginTop: 1 }}>Hubungkan internet & upload ke Drive</p>
                </div>
                <button
                  onClick={() => setView('SYNC_HUB')}
                  style={{
                    padding: '5px 10px', background: T.amber600,
                    color: '#fff', borderRadius: 8, fontSize: 10,
                    fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Buka Sync
                </button>
              </div>
            )}

            {/* Object grid */}
            <div>
              <Divider label="Atau pilih jenis manual" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 8 }}>
                {OBJECT_TYPES.map((obj) => (
                  <ObjCard key={obj.key} obj={obj} onClick={() => handleSelectObject(obj.key)} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── PICK UNIT ── */}
        {view === 'PICK_UNIT' && (
          <ClientPicker
            onPick={handleUnitPicked}
            onManual={handleManualPick}
            onCancel={() => setView('HOME')}
          />
        )}

        {/* ── FORM ── */}
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
            onClientNameChange={setClientName}
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
        )}

        {/* ── SYNC HUB ── */}
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

        {/* ── HISTORY ── */}
        {view === 'HISTORY' && (
          <HistoryView history={history} onEdit={handleEdit} onDelete={handleDelete} />
        )}

        {/* ── ADMIN ── */}
        {view === 'ADMIN' && isAdmin && (
          <AdminPanel currentUserEmail={currentUserEmail} onClose={() => setView('HOME')} />
        )}
        {view === 'ADMIN' && !isAdmin && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <p style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Akses Ditolak</p>
            <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>Anda tidak memiliki izin Admin</p>
            <button
              onClick={() => setView('HOME')}
              style={{ marginTop: 16, padding: '10px 20px', background: T.emerald500, color: '#fff', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer' }}
            >
              Kembali
            </button>
          </div>
        )}

      </main>

      {/* ── BOTTOM NAV + FAB ── */}
      {(view === 'HOME' || view === 'HISTORY' || view === 'SYNC_HUB' || view === 'ADMIN') && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(8px)',
          borderTop: `0.5px solid ${T.border}`,
          padding: '8px 16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          maxWidth: 640, margin: '0 auto',
          zIndex: 40,
        }}>
          <NavTab icon={ICONS.home} label="Beranda" active={view === 'HOME'} onClick={() => { resetForm(); setView('HOME'); }} />
          <NavTab icon={ICONS.clipboard} label="Riwayat" active={view === 'HISTORY'} onClick={() => setView('HISTORY')} />

          {/* FAB — kamera mencolok */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            {/* cincin luar glow */}
            <button
              onClick={handleStartInspection}
              aria-label="Mulai inspeksi baru"
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: `rgba(16,185,129,0.15)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                marginTop: -32,
                WebkitTapHighlightColor: 'transparent',
                padding: 0,
              }}
            >
              {/* lingkaran utama */}
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: T.emerald500,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
                border: `2.5px solid #fff`,
                boxShadow: `0 0 0 1px ${T.emeraldBorder}`,
              }}>
                {ICONS.camera}
              </div>
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: T.emerald500, letterSpacing: '0.02em' }}>Inspeksi</span>
          </div>

          <NavTab icon={ICONS.cloudUp} label="Sync" active={view === 'SYNC_HUB'} onClick={() => setView('SYNC_HUB')} />
          <NavTab icon={ICONS.shield} label="Admin" active={view === 'ADMIN'} onClick={() => roleChecked && isAdmin ? setView('ADMIN') : undefined} />
        </nav>
      )}
    </div>
  );
}