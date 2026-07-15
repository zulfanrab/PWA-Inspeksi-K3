// src/engines/ImageCompressor.ts

export const ImageCompressor = {
  /**
   * Mengompresi gambar dari data URL base64 ke JPEG dengan max lebar/tinggi 1200px dan kualitas 75%
   */
  compress: async (dataUrl: string, maxDimension = 1200, quality = 0.75): Promise<string> => {
    // Jika bukan base64 image, kembalikan apa adanya
    if (!dataUrl.startsWith('data:image')) {
      return dataUrl;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Hitung rasio dimensi baru jika melebihi batas maksimum
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

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('[ImageCompressor] Gagal mendapatkan context 2D dari canvas.'));
          return;
        }

        // Gambar ulang di canvas dengan dimensi baru
        ctx.drawImage(img, 0, 0, width, height);

        // Ekspor ke JPEG berkualitas rendah
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };

      img.onerror = (err) => {
        reject(new Error(`[ImageCompressor] Gagal memuat gambar: ${err}`));
      };

      img.src = dataUrl;
    });
  }
};
