// src/config.ts
const rawRedirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI?.trim() || '';
const normalizeRedirectUri = (uri: string) => uri.replace(/\/+$|\s+$/g, '');

export const GOOGLE_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '595024932466-v01dd7n525plvlh0j05pqu1o3u4aekf2.apps.googleusercontent.com',
  scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly', // Biar aplikasi cuma punya izin ke file yang dibikin dia sendiri (aman!)
  redirectUri: normalizeRedirectUri(rawRedirectUri),
};

export function getGoogleRedirectUri() {
  if (GOOGLE_CONFIG.redirectUri) {
    return GOOGLE_CONFIG.redirectUri;
  }
  if (typeof window !== 'undefined') {
    return normalizeRedirectUri(window.location.origin);
  }
  return '';
}
