// src/config.ts
export const GOOGLE_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '595024932466-v01dd7n525plvlh0j05pqu1o3u4aekf2.apps.googleusercontent.com',
  scope: 'https://www.googleapis.com/auth/drive.file', // Biar aplikasi cuma punya izin ke file yang dibikin dia sendiri (aman!)
  redirectUri: import.meta.env.VITE_GOOGLE_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin : ''),
};