// src/report-configs/penyalur-petir/checklists.ts
import { ChecklistConfig } from '../types';

export const checklists: ChecklistConfig = {
  version: '2.0.0',
  categories: [
    {
      categoryId: 'penerima_air_terminal',
      categoryName: 'A. Penerima (Air Terminal)',
      components: [
        {
          componentId: 'air_terminal_components',
          componentName: 'Penerima (Air Terminal)',
          isDefault: true,
          items: [
            { itemId: 'A.1', description: 'Jenis Air Terminal', standard: 'Permenaker 02/1989' },
            { itemId: 'A.2', description: 'Jarak / Radius Proteksi', standard: 'Permenaker 02/1989' },
            { itemId: 'A.3', description: 'Tinggi air terminal', standard: 'Permenaker 02/1989' },
            { itemId: 'A.4', description: 'Jumlah dan Jarak', standard: 'Permenaker 02/1989' },
            { itemId: 'A.5', description: 'Kondisi fisik ujung penerima, bebas karat & terpasang kokoh', standard: 'Permenaker 02/1989' },
          ],
        },
      ],
    },
    {
      categoryId: 'penghantar_down_conductor',
      categoryName: 'B. Penghantar (Down Conductor)',
      components: [
        {
          componentId: 'down_conductor_components',
          componentName: 'Penghantar (Down Conductor)',
          isDefault: true,
          items: [
            { itemId: 'B.1', description: 'Jumlah Down Conductor', standard: 'Permenaker 02/1989' },
            { itemId: 'B.2', description: 'Jalur penghantar penurunan ditarik lurus & rute terpendek', standard: 'Permenaker 02/1989' },
            { itemId: 'B.3', description: 'Luas Penampang (>= 50 mm2)', standard: 'Permenaker 02/1989' },
            { itemId: 'B.4', description: 'Tebal / Diameter Penampang (Hasil Ukur Sigmat)', standard: 'Permenaker 02/1989' },
            { itemId: 'B.5', description: 'Klem penyangga terpasang kuat dan jarak teratur', standard: 'Permenaker 02/1989' },
            { itemId: 'B.6', description: 'Tinggi Bangunan', standard: 'Permenaker 02/1989' },
            { itemId: 'B.7', description: 'Luas Bangunan', standard: 'Permenaker 02/1989' },
          ],
        },
      ],
    },
    {
      categoryId: 'pelindung_mekanis',
      categoryName: 'C. Perlengkapan & Pelindung Mekanis',
      components: [
        {
          componentId: 'mechanical_protection_components',
          componentName: 'Pelindung Mekanis',
          isDefault: true,
          items: [
            { itemId: 'C.1', description: 'Terdapat pipa pelindung mekanis setinggi min. 2 meter dari tanah', standard: 'Permenaker 02/1989' },
            { itemId: 'C.2', description: 'Isolasi / penyekat tiang penerima terhadap struktur logam sekitar', standard: 'Permenaker 02/1989' },
          ],
        },
      ],
    },
    {
      categoryId: 'sambungan_box_kontrol',
      categoryName: 'D. Sambungan & Box Kontrol (Test Joint)',
      components: [
        {
          componentId: 'box_control_components',
          componentName: 'Sambungan & Bak Kontrol',
          isDefault: true,
          items: [
            { itemId: 'D.1', description: 'Bak kontrol bersih, tidak tergenang, dan mudah diakses', standard: 'Permenaker 02/1989' },
            { itemId: 'D.2', description: 'Klem sambungan ukur (test joint) kencang dan bebas korosi', standard: 'Permenaker 02/1989' },
            { itemId: 'D.3', description: 'Jumlah Box Control', standard: 'Permenaker 02/1989' },
          ],
        },
      ],
    },
    {
      categoryId: 'elektroda_bumi',
      categoryName: 'E. Elektroda Bumi (Grounding)',
      components: [
        {
          componentId: 'grounding_electrodes',
          componentName: 'Elektroda Bumi',
          isDefault: true,
          items: [
            { itemId: 'E.1', description: 'Material elektroda bumi sesuai standar tahan korosi tanah', standard: 'Permenaker 02/1989' },
            { itemId: 'E.2', description: 'Jenis elektroda bumi (pasak/pita/pelat) sesuai kondisi tanah', standard: 'Permenaker 02/1989' },
            { itemId: 'E.3', description: 'Nilai tahanan pembumian <= 5 Ohm (Permenaker 02/1989 Pasal 54)', standard: 'Permenaker 02/1989' },
            { itemId: 'E.4', description: 'Jumlah Elektroda Bumi', standard: 'Permenaker 02/1989' },
          ],
        },
      ],
    },
    {
      categoryId: 'hubungan_antar_bagian',
      categoryName: 'Hubungan Antar Bagian Penyalur Petir (Kontinuitas)',
      components: [
        {
          componentId: 'kontinuitas_sistem',
          componentName: 'Hubungan Antar Bagian / Kontinuitas',
          isDefault: true,
          items: [
            { itemId: '1', description: 'Antara Penerima dengan Penerima', standard: 'Permenaker 02/1989' },
            { itemId: '2', description: 'Antara Penerima dengan Penghantar Penurunan', standard: 'Permenaker 02/1989' },
            { itemId: '3', description: 'Antara Ujung-ujung Penghantar Penurunan', standard: 'Permenaker 02/1989' },
            { itemId: '4', description: 'Antara Penghantar Penurunan dengan Elektroda Bumi', standard: 'Permenaker 02/1989' },
          ],
        },
      ],
    },
  ],
};
