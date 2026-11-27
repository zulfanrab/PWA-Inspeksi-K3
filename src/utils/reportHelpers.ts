// src/utils/reportHelpers.ts
import { formatIndonesianDayAndDate } from './reportTemplatePayload';

export async function parseApiJson(res: Response): Promise<any> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    if (res.status === 413 || raw.toLowerCase().includes('entity too large')) {
      throw new Error('Ukuran foto/lampiran terlalu besar untuk dikirim ke server (maks ~4.2 MB). Kurangi jumlah foto atau halaman lampiran.');
    }
    if (res.status === 504 || raw.toLowerCase().includes('timed out')) {
      throw new Error('Server timeout (504). Silakan coba klik ulang beberapa detik lagi.');
    }
    throw new Error(`Respon server bukan JSON (HTTP ${res.status}): ${raw.slice(0, 120)}`);
  }
}

export function formatTanggalHuruf(dateStr?: string): string {
  if (!dateStr) return '-';
  return formatIndonesianDayAndDate(dateStr).formatted || dateStr;
}

/**
 * Mem-parse daftar nilai tahanan pembumian dengan aman:
 * - Mendukung desimal koma tunggal Indonesia (mis. "1,39" -> [1.39])
 * - Mendukung banyak titik dipisah koma (mis. "1.39, 2.10" -> [1.39, 2.10], "1.2, 2.3, 3.4" -> [1.2, 2.3, 3.4])
 */
export function parseGroundingResistanceList(raw: unknown): number[] {
  const str = String(raw || '').trim();
  if (!str) return [];

  // Desimal koma tunggal seperti "1,39" atau "2,5" (tanpa spasi setelah koma dan hanya 1 koma)
  if (/^\d+(?:,\d+)$/.test(str)) {
    const n = Number(str.replace(',', '.'));
    return !isNaN(n) ? [n] : [];
  }

  return str
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part.replace(',', '.')))
    .filter((n) => !isNaN(n));
}

export function estimateJsonPayloadBytes(obj: unknown): number {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return 0;
  }
}
