// src/report-configs/penyalur-petir/checklists.ts
import { ChecklistConfig } from '../types';

export const checklists: ChecklistConfig = {
  version: '1.0.0',
  categories: [
    {
      categoryId: 'penerima_air_terminal',
      categoryName: 'Pemeriksaan Visual Penerima (Air Terminal / Splitzen)',
      components: [
        {
          componentId: 'air_terminal_components',
          componentName: 'Komponen Air Terminal',
          isDefault: true,
          items: [
            { itemId: 'jenis_terminal', description: 'Jenis terminal udara sesuai dengan gambar rencana', standard: 'Permenaker 02/1989' },
            { itemId: 'radius_proteksi', description: 'Tinggi dan radius proteksi memenuhi syarat area bangunan', standard: 'Permenaker 02/1989' },
            { itemId: 'kondisi_terminal', description: 'Ujung runcing terminal udara dalam keadaan tajam dan tidak cacat', standard: 'Permenaker 02/1989' },
            { itemId: 'karat_logam', description: 'Bahan terminal udara bebas dari karat logam aktif', standard: 'Permenaker 02/1989' },
            { itemId: 'tiang_penyangga', description: 'Tiang penyangga terminal terpasang kokoh', standard: 'Permenaker 02/1989' }
          ]
        }
      ]
    },
    {
      categoryId: 'penghantar_down_conductor',
      categoryName: 'Pemeriksaan Visual Penghantar Penurunan (Down Conductor)',
      components: [
        {
          componentId: 'down_conductor_components',
          componentName: 'Kabel Down Conductor',
          isDefault: true,
          items: [
            { itemId: 'jumlah_down_conductor', description: 'Jumlah penghantar penurunan (down conductor) memenuhi standar minimum', standard: 'Permenaker 02/1989' },
            { itemId: 'luas_penampang', description: 'Luas penampang kawat tembaga memenuhi syarat minimum (Ref: >= BC 50mm2)', standard: 'Permenaker 02/1989' },
            { itemId: 'jalur_penurunan', description: 'Penghantar penurunan ditarik lewat rute terpendek dan lurus', standard: 'Permenaker 02/1989' },
            { itemId: 'klem_penyangga', description: 'Jarak klem penyangga teratur dan menahan kawat dengan kencang', standard: 'Permenaker 02/1989' },
            { itemId: 'perlindungan_mekanis', description: 'Terdapat pipa pelindung mekanis setinggi minimum 2 meter dari tanah', standard: 'Permenaker 02/1989' }
          ]
        }
      ]
    },
    {
      categoryId: 'sambungan_box_kontrol',
      categoryName: 'Pemeriksaan Visual Sambungan & Box Kontrol',
      components: [
        {
          componentId: 'box_control_components',
          componentName: 'Sambungan & Bak Kontrol',
          isDefault: true,
          items: [
            { itemId: 'bak_kontrol_kondisi', description: 'Bak kontrol dalam kondisi bersih dan mudah diakses', standard: 'Permenaker 02/1989' },
            { itemId: 'klem_sambungan', description: 'Klem sambungan ukur (test joint) kencang dan tidak korosi', standard: 'Permenaker 02/1989' },
            { itemId: 'penomoran_box', description: 'Setiap bak kontrol memiliki penomoran yang jelas', standard: 'Permenaker 02/1989' }
          ]
        }
      ]
    },
    {
      categoryId: 'elektroda_bumi',
      categoryName: 'Pemeriksaan Elektroda Bumi (Grounding)',
      components: [
        {
          componentId: 'grounding_electrodes',
          componentName: 'Elektroda Grounding',
          isDefault: true,
          items: [
            { itemId: 'material_elektroda', description: 'Material elektroda bumi sesuai spesifikasi standar korosi tanah', standard: 'Permenaker 02/1989' },
            { itemId: 'jenis_elektroda', description: 'Jenis elektroda bumi (pasak/pita/pelat) sesuai kondisi lingkungan', standard: 'Permenaker 02/1989' },
            { itemId: 'jumlah_titik', description: 'Jumlah titik pembumian sesuai standar instalasi', standard: 'Permenaker 02/1989' }
          ]
        }
      ]
    }
  ]
};
