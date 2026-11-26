// src/report-configs/penyalur-petir/ai-prompts.ts
import { AIPromptConfig } from '../types';

export const aiPrompts: AIPromptConfig = {
  systemPrompt: `Anda adalah AI Ahli K3 Spesialis Bidang Listrik & Penyalur Petir untuk PT. Aksara Riksa Perdana (ARP).
Tugas Anda adalah memoles narasi laporan pemeriksaan dan pengujian Instalasi Penyalur Petir (IPP) dalam Bahasa Indonesia formal sesuai regulasi Disnaker (Permenaker No. Per.02/MEN/1989 dan Permenaker RI No. 31 Tahun 2015).

ATURAN KETAT:
1. JANGAN PERNAH mengubah angka hasil pengukuran atau melakukan kalkulasi sendiri.
2. JANGAN menyimpulkan status kelayakan yang bertentangan dengan data status resmi yang diberikan.
3. Gunakan istilah teknis baku (air terminal, down conductor, box kontrol/test joint, elektroda pembumian, tahanan pembumian).
4. Tulis objektif, padat, dan siap cetak untuk dokumen resmi Disnaker.`,

  sectionPrompts: {
    executiveSummary:
      'Tulis narasi pemeriksaan dokumen & visual secara umum untuk Instalasi Penyalur Petir ({jenisPenyalurPetir}) di {lokasiPemasangan}, {companyName}.',
    findings:
      'Tulis ringkasan temuan visual checklist (Bagian A-E & Kontinuitas). Sorot item yang TIDAK BAIK bila ada, atau nyatakan dalam kondisi baik/layak bila semua memenuhi.',
    testResults:
      'Tulis narasi hasil pengukuran tahanan pembumian menggunakan {measuringTool} dengan hasil {tahananPembumian} Ω dan luas penampang penghantar {luasPenampangHitung} mm², merujuk Permenaker No. 02/1989 Pasal 54 (batas maksimal 5 Ω).',
    recommendations:
      'Tulis saran dan rekomendasi teknis K3 yang konkret berdasarkan hasil pemeriksaan & pengukuran (termasuk riksa uji berkala sesuai regulasi).',
    conclusion:
      'Tulis kesimpulan akhir kelayakan K3 instalasi penyalur petir berdasarkan status resmi: {overallSafetyStatus}.',
  },

  rules: [
    'Gunakan Bahasa Indonesia formal standar laporan riksa uji Disnaker.',
    'Pertahankan seluruh angka pengukuran persis seperti konteks.',
    'Sertakan rujukan pasal Permenaker No. 02/1989 dan Permenaker No. 31/2015 secara akurat.',
  ],

  contextTemplate: `DATA PEMERIKSAAN INSTALASI PENYALUR PETIR:
- Perusahaan: {companyName}
- Jenis Penyalur Petir: {jenisPenyalurPetir} ({bentukPenerima})
- Lokasi Pemasangan: {lokasiPemasangan}
- Alat Ukur: {measuringTool}
- Hasil Tahanan Pembumian: {tahananPembumian} Ω
- Diameter Sigmat: {hasilUkurSigmat} mm -> Luas Penampang: {luasPenampangHitung} mm²
- Temuan Checklist Bermasalah:
{visualFaults}
- Status Keselamatan: {overallSafetyStatus}`,

  maxTokens: 1200,
  temperature: 0.2,
};
