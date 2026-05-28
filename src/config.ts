// src/config.ts
// FIXED: Scope OAuth dikurangi jadi openid email profile saja
// Tidak perlu Drive scope karena semua upload/pull sudah lewat serverless api/

const rawRedirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI?.trim() || '';
const normalizeRedirectUri = (uri: string) => uri.replace(/\/+$|\s+$/g, '');

export const GOOGLE_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '595024932466-v01dd7n525plvlh0j05pqu1o3u4aekf2.apps.googleusercontent.com',
  // FIXED: Hanya untuk identitas user (nama + email), tidak perlu Drive access
  scope: 'openid email profile',
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

// NEW: Base URL untuk API serverless Vercel
// Di production → otomatis pakai domain Vercel
// Di development → pakai localhost:3000 (vercel dev)
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Kalau bukan localhost, pakai origin yang sama (production Vercel)
    if (!window.location.hostname.includes('localhost')) {
      return window.location.origin;
    }
  }
  // Development: vercel dev jalan di port 3000
  return 'http://localhost:3000';
}