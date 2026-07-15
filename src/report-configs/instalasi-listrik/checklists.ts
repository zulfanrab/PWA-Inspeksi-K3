// src/report-configs/instalasi-listrik/checklists.ts
import { ChecklistConfig } from '../types';

export const checklists: ChecklistConfig = {
  version: '1.0.0',
  categories: [
    {
      categoryId: 'phb_visual_door',
      categoryName: 'Pemeriksaan Visual Tampak Dalam / Pintu PHB',
      components: [
        {
          componentId: 'door_components',
          componentName: 'Komponen Pintu Panel',
          isDefault: true,
          items: [
            { itemId: 'lampu_indikator', description: 'Lampu indikator phasa (R-S-T) menyala normal', standard: 'PUIL 2011' },
            { itemId: 'alat_ukur', description: 'Alat ukur/metering (Volt, Ampere, Hz) berfungsi baik', standard: 'PUIL 2011' },
            { itemId: 'nama_label', description: 'Nama/label pintu panel terpasang jelas', standard: 'PUIL 2011' },
            { itemId: 'tanda_bahaya_pintu', description: 'Tanda bahaya pada pintu panel luar jelas', standard: 'Permenaker 12/2015' },
            { itemId: 'selector_switch', description: 'Selector switch & kunci pintu panel berfungsi', standard: 'PUIL 2011' }
          ]
        }
      ]
    },
    {
      categoryId: 'phb_termination',
      categoryName: 'Pemeriksaan Visual Pada Sistem Terminasi',
      components: [
        {
          componentId: 'termination_components',
          componentName: 'Koneksi dan Kabel',
          isDefault: true,
          items: [
            { itemId: 'cover_pelindung', description: 'Cover pelindung sentuh langsung terpasang aman', standard: 'PUIL 2011' },
            { itemId: 'single_line_diagram', description: 'Single line diagram terlampir di dalam panel', standard: 'PUIL 2011' },
            { itemId: 'bonding_pintu', description: 'Kabel bonding pengaman pintu panel terpasang', standard: 'PUIL 2011' },
            { itemId: 'labeling_terminasi', description: 'Labeling terminasi kabel jelas dan teratur', standard: 'PUIL 2011' },
            { itemId: 'kode_warna', description: 'Kode warna kabel sesuai standar (R-Merah, S-Kuning, T-Hitam, N-Biru, G-Kuning/Hijau)', standard: 'PUIL 2011' },
            { itemId: 'kebersihan_panel', description: 'Kebersihan bagian dalam panel terjaga bebas debu', standard: 'PUIL 2011' },
            { itemId: 'kerapian_instalasi', description: 'Kerapian instalasi kabel (wiring) tertata rapi', standard: 'PUIL 2011' }
          ]
        }
      ]
    },
    {
      categoryId: 'phb_internal_busbar',
      categoryName: 'Pemeriksaan Visual Daerah Kerja PHB',
      components: [
        {
          componentId: 'internal_components',
          componentName: 'Busbar & Pengaman',
          isDefault: true,
          items: [
            { itemId: 'busbar_conductor', description: 'Kondisi busbar/penghantar utama bersih & kencang', standard: 'PUIL 2011' },
            { itemId: 'breaker_fuse', description: 'Pengaman (Circuit Breaker/Fuse) bekerja baik', standard: 'PUIL 2011' },
            { itemId: 'sepatu_kabel', description: 'Sepatu kabel (cable lug) terpasang presisi & kencang', standard: 'PUIL 2011' },
            { itemId: 'grounding_panel', description: 'Grounding panel terhubung erat ke sistem pembumian', standard: 'PUIL 2011' },
            { itemId: 'jarak_busbar', description: 'Jarak antar busbar phasa memenuhi standar aman', standard: 'PUIL 2011' }
          ]
        }
      ]
    },
    {
      categoryId: 'phb_environment',
      categoryName: 'Penempatan & Lingkungan PHB',
      components: [
        {
          componentId: 'env_components',
          componentName: 'Akses & Ruang Kerja',
          isDefault: true,
          items: [
            { itemId: 'jarak_depan', description: 'Jarak bebas depan panel (Ref: >= 75 cm)', standard: 'PUIL 2011' },
            { itemId: 'jarak_samping', description: 'Jarak bebas samping panel (Ref: >= 150 cm jika ada lorong)', standard: 'PUIL 2011' },
            { itemId: 'jarak_belakang', description: 'Jarak bebas belakang panel (bila akses belakang diperlukan)', standard: 'PUIL 2011' },
            { itemId: 'kebebasan_pintu', description: 'Pintu ruang panel dapat dibuka penuh tanpa hambatan', standard: 'PUIL 2011' },
            { itemId: 'pencahayaan_ruang', description: 'Pencahayaan ruang PHB memadai (Ref: >= 100 Lux)', standard: 'Permenaker 5/2018' },
            { itemId: 'bebas_barang', description: 'Bebas dari barang yang tidak terpakai / mudah terbakar', standard: 'PUIL 2011' },
            { itemId: 'ventilasi_ruang', description: 'Ventilasi ruang panel baik dan suhu terjaga', standard: 'PUIL 2011' },
            { itemId: 'tanda_bahaya_ruang', description: 'Tanda bahaya pintu ruang PHB dipasang jelas', standard: 'Permenaker 12/2015' }
          ]
        }
      ]
    }
  ]
};
