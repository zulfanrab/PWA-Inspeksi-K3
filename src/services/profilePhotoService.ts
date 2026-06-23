// src/services/profilePhotoService.ts
// Service untuk upload & manage photo profile user
// Menggunakan localStorage - ISOLATED dari Dexie DB dan Google Drive integration
// SAFETY: Tidak mengganggu sistem inspeksi yang sudah berjalan

const STORAGE_KEY_PREFIX = 'profile_photo_';
const MAX_PHOTO_SIZE = 500 * 1024; // 500KB max
const COMPRESSION_QUALITY = 0.7;

export interface ProfilePhoto {
  email: string;
  dataUrl: string;
  uploadedAt: number;
  fileName: string;
}

/**
 * Compress image sebelum disimpan
 * SAFETY: Mengurangi ukuran file agar tidak membebani localStorage
 */
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Limit max dimension ke 400px
        const maxDim = 400;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload photo profile dari file input
 * SAFETY: Isolated operation, tidak menyentuh database lain
 */
export async function uploadProfilePhoto(
  email: string,
  file: File
): Promise<{ success: boolean; message: string; dataUrl?: string }> {
  try {
    // Validasi file type
    if (!file.type.startsWith('image/')) {
      return { success: false, message: 'File harus berupa gambar (JPG, PNG, etc)' };
    }

    // Validasi ukuran file
    if (file.size > MAX_PHOTO_SIZE) {
      return {
        success: false,
        message: `Ukuran file terlalu besar. Max ${MAX_PHOTO_SIZE / 1024}KB`
      };
    }

    // Compress image
    const compressedDataUrl = await compressImage(file);

    // Validasi ukuran setelah compress
    if (compressedDataUrl.length > MAX_PHOTO_SIZE * 2) {
      return {
        success: false,
        message: 'Gambar terlalu kompleks, coba dengan gambar lebih sederhana'
      };
    }

    // Simpan ke localStorage
    const storageKey = `${STORAGE_KEY_PREFIX}${email}`;
    const profilePhoto: ProfilePhoto = {
      email,
      dataUrl: compressedDataUrl,
      uploadedAt: Date.now(),
      fileName: file.name
    };

    localStorage.setItem(storageKey, JSON.stringify(profilePhoto));

    return {
      success: true,
      message: 'Photo profile berhasil diupload',
      dataUrl: compressedDataUrl
    };
  } catch (error) {
    console.error('Error uploading profile photo:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Gagal upload photo'
    };
  }
}

/**
 * Ambil photo profile dari localStorage
 * SAFETY: Read-only operation
 */
export function getProfilePhoto(email: string): ProfilePhoto | null {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${email}`;
    const data = localStorage.getItem(storageKey);
    if (!data) return null;
    return JSON.parse(data) as ProfilePhoto;
  } catch (error) {
    console.error('Error getting profile photo:', error);
    return null;
  }
}

/**
 * Hapus photo profile
 * SAFETY: User dapat menghapus foto mereka sendiri
 */
export function deleteProfilePhoto(email: string): boolean {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${email}`;
    localStorage.removeItem(storageKey);
    return true;
  } catch (error) {
    console.error('Error deleting profile photo:', error);
    return false;
  }
}

/**
 * Update photo profile (replace existing)
 * SAFETY: Same as uploadProfilePhoto
 */
export async function updateProfilePhoto(
  email: string,
  file: File
): Promise<{ success: boolean; message: string; dataUrl?: string }> {
  return uploadProfilePhoto(email, file);
}

/**
 * Get storage usage untuk profile photos
 * SAFETY: Monitor penggunaan localStorage
 */
export function getProfilePhotoStorageUsage(): {
  used: number;
  percentage: number;
} {
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      const value = localStorage.getItem(key);
      if (value) totalSize += value.length;
    }
  }

  // Estimate: localStorage typically 5-10MB, assume 5MB
  const maxSize = 5 * 1024 * 1024;
  const percentage = (totalSize / maxSize) * 100;

  return { used: totalSize, percentage };
}

/**
 * Cleanup old profile photos (optional maintenance)
 * SAFETY: Remove photos older than 6 months
 */
export function cleanupOldProfilePhotos(): number {
  const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
  let removedCount = 0;

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}') as ProfilePhoto;
        if (data.uploadedAt < sixMonthsAgo) {
          localStorage.removeItem(key);
          removedCount++;
        }
      } catch (error) {
        console.error('Error in cleanup:', error);
      }
    }
  }

  return removedCount;
}