// src/services/syncService.ts
import { hasValidToken, getValidToken } from './driveService';

// Minimal sync service for templates.
// Exports: pushTemplatesToDrive, pullTemplatesFromDrive, isOwner

export function isOwner(email: string | undefined | null): boolean {
  const owner = import.meta.env.VITE_OWNER_EMAIL || '';
  if (!email) return false;
  if (owner) return email === owner;
  // fallback: treat first logged-in user as owner (not persisted here)
  return false;
}

export async function pushTemplatesToDrive(): Promise<void> {
  if (!hasValidToken()) {
    console.warn('[syncService] no valid token, skipping pushTemplatesToDrive');
    return;
  }

  const token = getValidToken();
  // Placeholder: implement actual template push logic here.
  // For now, just log to console so caller can observe behavior.
  console.info('[syncService] pushTemplatesToDrive called (token present)', { token: !!token });
}

export async function pullTemplatesFromDrive(): Promise<void> {
  if (!hasValidToken()) {
    console.warn('[syncService] no valid token, skipping pullTemplatesFromDrive');
    return;
  }

  const token = getValidToken();
  // Placeholder: implement actual template pull logic here.
  console.info('[syncService] pullTemplatesFromDrive called (token present)', { token: !!token });
}

export default {
  isOwner,
  pushTemplatesToDrive,
  pullTemplatesFromDrive,
};
