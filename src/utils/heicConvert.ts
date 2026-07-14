// src/utils/heicConvert.ts
// Utilitas konversi HEIC → JPEG untuk support foto iPhone/iPad

/**
 * Cek apakah file adalah HEIC/HEIF
 */
export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type === 'image/heic' ||
    type === 'image/heif'
  );
}

/**
 * Convert file HEIC → JPEG File object.
 * Jika file bukan HEIC, langsung return file aslinya.
 * Jika conversion gagal, throw error.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  try {
    // Dynamic import agar heic2any hanya di-load saat diperlukan (code splitting)
    const heic2any = (await import('heic2any')).default;

    const blob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.85,
    });

    // heic2any bisa return Blob atau Blob[] — kita ambil yang pertama
    const resultBlob = Array.isArray(blob) ? blob[0] : blob;

    // Buat File baru dengan nama yang sama tapi extension .jpg
    const newName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
    return new File([resultBlob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.error('HEIC conversion failed:', err);
    throw new Error(`Gagal mengonversi foto HEIC: ${file.name}. Coba gunakan format JPG/PNG.`);
  }
}
