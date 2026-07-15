// src/report-configs/penyalur-petir/forms.ts
import { FormFieldConfig } from '../types';

export const forms: FormFieldConfig[] = [
  // --- DATA UMUM (GENERAL) ---
  {
    fieldId: 'jenisPenyalurPetir',
    section: 'general',
    label: 'Jenis Penyalur Petir',
    type: 'select',
    options: ['Konvensional', 'Elektrostatis'],
    defaultValue: 'Konvensional',
    required: true,
    mappedPlaceholder: '{jenis_penyalur_petir}'
  },
  {
    fieldId: 'lokasiPemasangan',
    section: 'general',
    label: 'Lokasi Pemasangan Tiang',
    type: 'text',
    required: true,
    placeholder: 'Contoh: Atap Gedung Produksi',
    mappedPlaceholder: '{lokasi_pemasangan}'
  },
  {
    fieldId: 'jenisKonstruksi',
    section: 'general',
    label: 'Jenis Konstruksi Bangunan',
    type: 'text',
    required: false,
    placeholder: 'Contoh: Beton Bertulang / Rangka Baja',
    mappedPlaceholder: '{jenis_konstruksi}'
  },
  
  // --- DATA TEKNIS (TECHNICAL) ---
  {
    fieldId: 'bentukPenerima',
    section: 'technical',
    label: 'Bentuk Penerima (Air Terminal)',
    type: 'select',
    options: ['Runcing', 'Bulat', 'Multi-point'],
    defaultValue: 'Runcing',
    required: true,
    mappedPlaceholder: '{bentuk_penerima}'
  },
  {
    fieldId: 'jumlahAirTerminal',
    section: 'technical',
    label: 'Jumlah Air Terminal (Splitzen)',
    type: 'number',
    defaultValue: 1,
    required: true,
    mappedPlaceholder: '{jumlah_air_terminal}'
  },
  {
    fieldId: 'tinggiTiangPenerima',
    section: 'technical',
    label: 'Tinggi Tiang Penerima (meter)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{tinggi_tiang_penerima}'
  },
  {
    fieldId: 'tinggiBangunan',
    section: 'technical',
    label: 'Tinggi Bangunan (meter)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{tinggi_bangunan}'
  },
  {
    fieldId: 'radiusPerlindungan',
    section: 'technical',
    label: 'Radius Perlindungan (meter)',
    type: 'number',
    required: false,
    mappedPlaceholder: '{radius_perlindungan}'
  },
  {
    fieldId: 'jumlahDownConductor',
    section: 'technical',
    label: 'Jumlah Down Conductor (Penyalur)',
    type: 'number',
    defaultValue: 1,
    required: true,
    mappedPlaceholder: '{jumlah_down_conductor}'
  },
  {
    fieldId: 'jenisDownConductor',
    section: 'technical',
    label: 'Jenis Down Conductor',
    type: 'select',
    options: ['Kabel BC 50 mm2', 'Kabel BC 70 mm2', 'Coaxial Cable', 'Pita Tembaga', 'Lainnya'],
    defaultValue: 'Kabel BC 50 mm2',
    required: true,
    mappedPlaceholder: '{jenis_down_conductor}'
  },
  {
    fieldId: 'ukuranDownConductor',
    section: 'technical',
    label: 'Ukuran/Penampang Down Conductor (mm2)',
    type: 'number',
    defaultValue: 50,
    required: true,
    mappedPlaceholder: '{ukuran_down_conductor}'
  },
  {
    fieldId: 'jumlahBoxKontrol',
    section: 'technical',
    label: 'Jumlah Box Kontrol Sambungan',
    type: 'number',
    defaultValue: 1,
    required: true,
    mappedPlaceholder: '{jumlah_box_kontrol}'
  },
  {
    fieldId: 'jumlahElektrodaPembumian',
    section: 'technical',
    label: 'Jumlah Elektroda Pembumian (Grounding)',
    type: 'number',
    defaultValue: 1,
    required: true,
    mappedPlaceholder: '{jumlah_elektroda_pembumian}'
  },

  // --- DATA PENGUJIAN (TESTING FIELDS) ---
  {
    fieldId: 'tahananPembumian',
    section: 'testing',
    label: 'Tahanan Elektroda Pembumian / Grounding (Ω)',
    type: 'number',
    required: true,
    mappedPlaceholder: '{tahanan_pembumian}'
  }
];
