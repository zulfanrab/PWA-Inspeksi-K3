// src/utils/photoCompressor.ts
// Utilitas kompresi foto ultra-ringan & hemat memori untuk semua tipe device (HP low-end hingga flagship).
import { convertHeicToJpeg } from './heicConvert';

/**
 * Kompres File gambar langsung tanpa FileReader Base64 raksasa.
 * Menggunakan hardware-accelerated createImageBitmap jika tersedia, dengan fallback URL.createObjectURL.
 */
export async function compressFileToDataUrl(
  rawFile: File,
  maxDimension = 1080,
  quality = 0.65
): Promise<string> {
  // 1. Konversi jika format iPhone HEIC/HEIF
  let file = rawFile;
  try {
    file = await convertHeicToJpeg(rawFile);
  } catch (err) {
    console.warn('Gagal convert HEIC, mencoba memproses file asli:', err);
  }

  // 2. Strategi A: createImageBitmap (Hardware-accelerated, off-main-thread)
  // Menghindari alokasi bitmap full-res di JavaScript Heap.
  if (typeof createImageBitmap !== 'undefined') {
    try {
      // Ambil dimensi asli secara cepat
      const headerBmp = await createImageBitmap(file);
      const { width: origW, height: origH } = headerBmp;
      headerBmp.close(); // Lepas resource seketika

      let targetW = origW;
      let targetH = origH;

      if (origW > maxDimension || origH > maxDimension) {
        if (origW > origH) {
          targetH = Math.round((origH * maxDimension) / origW);
          targetW = maxDimension;
        } else {
          targetW = Math.round((origW * maxDimension) / origH);
          targetH = maxDimension;
        }
      }

      // Resize langsung di level native C++ decoder browser
      const resizedBmp = await createImageBitmap(file, {
        resizeWidth: targetW,
        resizeHeight: targetH,
        resizeQuality: 'medium',
      });

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (ctx) {
        ctx.drawImage(resizedBmp, 0, 0);
        resizedBmp.close(); // Bersihkan GPU memory seketika

        const result = canvas.toDataURL('image/jpeg', quality);
        // Lepas buffer canvas
        canvas.width = 0;
        canvas.height = 0;
        return result;
      }
    } catch {
      // Jika browser tidak support resize options pada createImageBitmap, lanjut ke Fallback B
    }
  }

  // 3. Strategi B: Fallback via Image & URL.createObjectURL (jauh lebih hemat memori daripada FileReader Base64)
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Bebaskan memori blob seketika!

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        resolve('');
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const result = canvas.toDataURL('image/jpeg', quality);

      // Bersihkan canvas buffer
      canvas.width = 0;
      canvas.height = 0;
      resolve(result);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve('');
    };

    img.src = objectUrl;
  });
}

/**
 * Kompres DataURL yang sudah ada di memori (misal dari kamera).
 */
export async function compressDataUrl(
  dataUrl: string,
  maxDimension = 1080,
  quality = 0.65
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const result = canvas.toDataURL('image/jpeg', quality);
      canvas.width = 0;
      canvas.height = 0;
      resolve(result);
    };

    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Memberikan jeda 1 frame agar UI thread dapat me-render progress bar & animasi tanpa lag
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 10);
    }
  });
}
