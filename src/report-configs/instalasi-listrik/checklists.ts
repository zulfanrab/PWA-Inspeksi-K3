// src/report-configs/instalasi-listrik/checklists.ts
import { ChecklistConfig } from '../types';

export const checklists: ChecklistConfig = {
  version: '2.0.0',
  categories: [
    {
      categoryId: 'visual_luar_phb',
      categoryName: '1. Pemeriksaan Visual Tampak Luar PHB',
      components: [
        {
          componentId: 'luar_phb',
          componentName: 'Pemeriksaan Visual Tampak Luar PHB',
          isDefault: true,
          items: [
            {
              itemId: '1.1',
              description: 'Lampu indikator pada Panel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '1.2',
              description: 'Alat ukur atau metering (Ampere Meter, Volt Meter, dll.)',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '1.3',
              description: 'Nama/label dan nama perusahaan instalatir pada pintu panel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '1.4',
              description: 'Tanda bahaya pada pintu panel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '1.5',
              description: 'Selector Switch dan kunci pintu panel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
          ],
        },
      ],
    },
    {
      categoryId: 'visual_dalam_phb',
      categoryName: '2. Pemeriksaan Visual Tampak Dalam PHB',
      components: [
        {
          componentId: 'dalam_phb',
          componentName: 'Pemeriksaan Visual Tampak Dalam PHB',
          isDefault: true,
          items: [
            {
              itemId: '2.1',
              description: 'Cover pelindung tegangan sentuh langsung',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '2.2',
              description: 'Gambar single line diagram dan kartu riwayat perawatan',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '2.3',
              description: 'Kabel bonding untuk pengaman sentuh tidak langsung',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '2.4',
              description: 'Labeling',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '2.5',
              description: 'Kode warna kabel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '2.6',
              description: 'Kebersihan Panel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '2.7',
              description: 'Kerapian Instalasi',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
          ],
        },
      ],
    },
    {
      categoryId: 'sistem_terminasi',
      categoryName: '3. Pemeriksaan Visual Pada Sistem Terminasi',
      components: [
        {
          componentId: 'terminasi',
          componentName: 'Pemeriksaan Visual Pada Sistem Terminasi',
          isDefault: true,
          items: [
            {
              itemId: '3.1',
              description: 'Busbar / penghantar',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '3.2',
              description: 'Pengaman (CB, FUSE)',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '3.3',
              description: 'Sepatu kabel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '3.4',
              description: 'Sistem pembumian',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
            {
              itemId: '3.5',
              description: 'Jarak busbar to busbar',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
          ],
        },
      ],
    },
    {
      categoryId: 'daerah_kerja',
      categoryName: '4. Pemeriksaan Visual Daerah Kerja',
      components: [
        {
          componentId: 'daerah_kerja_comp',
          componentName: 'Pemeriksaan Visual Daerah Kerja',
          isDefault: true,
          items: [
            {
              itemId: '4.1',
              description: 'Jarak bagian depan',
              standard: 'SNI : 75 cm',
              method: 'Pengukuran',
            },
            {
              itemId: '4.2',
              description: 'Jarak bagian samping',
              standard: 'SNI : 150 cm',
              method: 'Pengukuran',
            },
            {
              itemId: '4.3',
              description: 'Jarak bagian belakang',
              standard: '-',
              method: 'Pengukuran',
            },
            {
              itemId: '4.4',
              description: 'Bebas buka pintu panel',
              standard: '-',
              method: 'Pengukuran',
            },
            {
              itemId: '4.5',
              description: 'Pencahayaan',
              standard: '100 Lux',
              method: 'Pengukuran',
            },
            {
              itemId: '4.6',
              description: 'Barang-barang yang tidak terpakai',
              standard: 'SNI',
              method: 'Penilaian',
            },
            {
              itemId: '4.7',
              description: 'Ventilasi',
              standard: 'SNI',
              method: 'Penilaian',
            },
            {
              itemId: '4.8',
              description: 'Tanda bahaya pintu ruang panel',
              standard: 'Manufacture Std.',
              method: 'Penilaian',
            },
          ],
        },
      ],
    },
    {
      categoryId: 'pengujian',
      categoryName: '5. Pengujian',
      components: [
        {
          componentId: 'pengujian_comp',
          componentName: 'Pengujian',
          isDefault: true,
          items: [
            {
              itemId: '5.1',
              description: 'Tegangan Phasa R S T',
              standard: '-',
              method: 'Pengukuran',
            },
            {
              itemId: '5.2',
              description: 'Arus Phasa R, S, T, Netral, PE',
              standard: '-',
              method: 'Pengukuran',
            },
            {
              itemId: '5.3',
              description: 'Sistem pembumian',
              standard: '-',
              method: 'Penilaian',
            },
            {
              itemId: '5.4',
              description: 'Susut tegangan',
              standard: 'Beban Daya : 3 %, Beban Penerangan : 1,5%',
              method: 'Pengukuran dan perhitungan',
            },
            {
              itemId: '5.5',
              description: 'Panas penghantar/Terminasi R, S, T',
              standard: 'Penghantar : 70 °C, Terminasi : 51 °C',
              method: 'Pengukuran',
            },
            {
              itemId: '5.6',
              description: 'Pentanahan',
              standard: 'SNI : 5 Ω',
              method: 'Pengukuran',
            },
            {
              itemId: '5.7',
              description: 'KHA penghantar utama',
              standard: '125 % x In',
              method: 'Perhitungan',
            },
            {
              itemId: '5.8',
              description: 'Rating Proteksi utama',
              standard: '115 % x In',
              method: 'Perhitungan',
            },
            {
              itemId: '5.9',
              description: 'Daya untuk penerangan',
              standard: '-',
              method: 'Pengukuran',
            },
            {
              itemId: '5.10',
              description: 'Daya untuk AC',
              standard: '-',
              method: 'Pengukuran',
            },
            {
              itemId: '5.11',
              description: 'Daya untuk mesin',
              standard: '-',
              method: 'Pengukuran',
            },
          ],
        },
      ],
    },
  ],
};
