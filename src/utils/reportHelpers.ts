// src/utils/reportHelpers.ts

export async function parseApiJson(res: Response): Promise<any> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    if (res.status === 504 || raw.toLowerCase().includes('timed out')) {
      throw new Error('Server timeout (504). Silakan coba klik ulang beberapa detik lagi.');
    }
    throw new Error(`Respon server bukan JSON (HTTP ${res.status}): ${raw.slice(0, 120)}`);
  }
}

export function formatTanggalHuruf(dateStr?: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00+07:00`);
  if (isNaN(parsed.getTime())) return dateStr;
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
}
