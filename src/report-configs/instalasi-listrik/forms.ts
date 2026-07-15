// src/report-configs/instalasi-listrik/forms.ts
import { FormFieldConfig } from '../types';

export const forms: FormFieldConfig[] = [
  // --- DATA UMUM (GENERAL) ---
  {
    fieldId: 'instalerPemasang',
    section: 'general',
    label: 'Instaler / Pemasang',
    type: 'text',
    required: false,
    placeholder: 'Contoh: PT. Cipta Listrik',
    mappedPlaceholder: '{instaler_pemasang}'
  },
  {
    fieldId: 'sumberTegangan',
    section: 'general',
    label: 'Sumber Tegangan',
    type: 'select',
    options: ['PLN', 'Genset', 'PLTS', 'Lainnya'],
    defaultValue: 'PLN',
    required: true,
    mappedPlaceholder: '{sumber_tegangan}'
  },
  {
    fieldId: 'sumberDayaListrik',
    section: 'general',
    label: 'Sumber Daya Listrik (kVA)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{sumber_daya_listrik}'
  },
  {
    fieldId: 'dayaPenerangan',
    section: 'general',
    label: 'Daya Penerangan (kVA)',
    type: 'number',
    required: false,
    mappedPlaceholder: '{daya_penerangan}'
  },
  {
    fieldId: 'dayaTenaga',
    section: 'general',
    label: 'Daya Tenaga (kVA)',
    type: 'number',
    required: false,
    mappedPlaceholder: '{daya_tenaga}'
  },
  {
    fieldId: 'jumlahPhasa',
    section: 'general',
    label: 'Jumlah Phasa',
    type: 'select',
    options: ['3 Phase', '1 Phase'],
    defaultValue: '3 Phase',
    required: true,
    mappedPlaceholder: '{jumlah_phasa}'
  },
  {
    fieldId: 'frekuensi',
    section: 'general',
    label: 'Frekuensi (Hz)',
    type: 'number',
    defaultValue: 50,
    required: true,
    mappedPlaceholder: '{frekuensi}'
  },
  {
    fieldId: 'jenisArus',
    section: 'general',
    label: 'Jenis Arus',
    type: 'select',
    options: ['AC', 'DC'],
    defaultValue: 'AC',
    required: true,
    mappedPlaceholder: '{jenis_arus}'
  },
  {
    fieldId: 'teganganKerja',
    section: 'general',
    label: 'Tegangan Kerja (Volt)',
    type: 'number',
    defaultValue: 380,
    required: true,
    mappedPlaceholder: '{tegangan_kerja}'
  },

  // --- DATA TEKNIS (TECHNICAL) ---
  {
    fieldId: 'namaPanel',
    section: 'technical',
    label: 'Nama Panel',
    type: 'text',
    required: true,
    placeholder: 'Contoh: MDP Lantai 1',
    mappedPlaceholder: '{nama_panel}'
  },
  {
    fieldId: 'merekPanel',
    section: 'technical',
    label: 'Merek Panel',
    type: 'text',
    required: false,
    placeholder: 'Contoh: Schneider',
    mappedPlaceholder: '{merek_panel}'
  },
  {
    fieldId: 'tipePanel',
    section: 'technical',
    label: 'Tipe Panel',
    type: 'text',
    required: false,
    mappedPlaceholder: '{tipe_panel}'
  },
  {
    fieldId: 'nomorSeriPanel',
    section: 'technical',
    label: 'Nomor Seri Panel',
    type: 'text',
    required: false,
    mappedPlaceholder: '{nomor_seri_panel}'
  },
  {
    fieldId: 'lokasiPanel',
    section: 'technical',
    label: 'Lokasi Panel',
    type: 'text',
    required: true,
    placeholder: 'Contoh: Ruang Elektrikal Lt.1',
    mappedPlaceholder: '{lokasi_panel}'
  },
  {
    fieldId: 'materialBusbar',
    section: 'technical',
    label: 'Material Busbar',
    type: 'text',
    required: false,
    placeholder: 'Contoh: Tembaga (Cu)',
    mappedPlaceholder: '{material_busbar}'
  },
  {
    fieldId: 'jenisProteksiUtama',
    section: 'technical',
    label: 'Jenis Proteksi Utama',
    type: 'select',
    options: ['MCCB', 'MCB', 'ACB', 'Fuse', 'Lainnya'],
    defaultValue: 'MCCB',
    required: true,
    mappedPlaceholder: '{jenis_proteksi_utama}'
  },
  {
    fieldId: 'ratingProteksiUtama',
    section: 'technical',
    label: 'Rating Proteksi Utama (A)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{rating_proteksi_utama}'
  },
  {
    fieldId: 'tipeKabelUtama',
    section: 'technical',
    label: 'Tipe Kabel Utama',
    type: 'text',
    required: false,
    placeholder: 'Contoh: NYY',
    mappedPlaceholder: '{tipe_kabel_utama}'
  },
  {
    fieldId: 'ukuranKabelUtama',
    section: 'technical',
    label: 'Ukuran Kabel Utama (mm2)',
    type: 'text',
    required: false,
    placeholder: 'Contoh: 4x50',
    mappedPlaceholder: '{ukuran_kabel_utama}'
  },

  // --- DATA PENGUJIAN (TESTING FIELDS) ---
  {
    fieldId: 'bebanR',
    section: 'testing',
    label: 'Arus Beban Phasa R (A)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{beban_r}'
  },
  {
    fieldId: 'bebanS',
    section: 'testing',
    label: 'Arus Beban Phasa S (A)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{beban_s}'
  },
  {
    fieldId: 'bebanT',
    section: 'testing',
    label: 'Arus Beban Phasa T (A)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{beban_t}'
  },
  {
    fieldId: 'isolasiRN',
    section: 'testing',
    label: 'Tahanan Isolasi R-N (MΩ)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{isolasi_rn}'
  },
  {
    fieldId: 'isolasiSN',
    section: 'testing',
    label: 'Tahanan Isolasi S-N (MΩ)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{isolasi_sn}'
  },
  {
    fieldId: 'isolasiTN',
    section: 'testing',
    label: 'Tahanan Isolasi T-N (MΩ)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{isolasi_tn}'
  },
  {
    fieldId: 'isolasiRG',
    section: 'testing',
    label: 'Tahanan Isolasi R-G (MΩ)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{isolasi_rg}'
  },
  {
    fieldId: 'isolasiSG',
    section: 'testing',
    label: 'Tahanan Isolasi S-G (MΩ)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{isolasi_sg}'
  },
  {
    fieldId: 'isolasiTG',
    section: 'testing',
    label: 'Tahanan Isolasi T-G (MΩ)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{isolasi_tg}'
  },
  {
    fieldId: 'tahananPentanahan',
    section: 'testing',
    label: 'Tahanan Pentanahan / Grounding (Ω)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{tahanan_pentanahan}'
  }
];
