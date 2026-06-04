// src/services/syncService.ts
import { db, ClientRepository, UnitRepository } from '../db/db';
import { getApiBaseUrl } from '../config';

export function isOwner(email: string | undefined | null): boolean {
  const owner = import.meta.env.VITE_OWNER_EMAIL || '';
  if (!email) return false;
  return email === owner;
}

function apiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}

// ==========================================
// TEMPLATES — PUSH (GEMBOK ADMIN)
// ==========================================
export async function pushTemplatesToDrive(): Promise<void> {
  try {
    const clientTemplates = await db.client_templates.toArray();
    const unitTemplates = await db.unit_templates.toArray();

    const payload = {
      adminEmail: import.meta.env.VITE_OWNER_EMAIL || '',
      client_templates: clientTemplates,
      unit_templates: unitTemplates,
    };

    const res = await fetch(apiUrl('/api/sync-templates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('[syncService] pushTemplatesToDrive error:', err);
    throw err;
  }
}

// ==========================================
// TEMPLATES — PULL 
// ==========================================
export async function pullTemplatesFromDrive(): Promise<void> {
  try {
    const res = await fetch(apiUrl('/api/sync-templates'), { method: 'GET' });
    if (!res.ok) return;

    const payload = await res.json();
    const clientTemplates = payload.client_templates || [];
    const unitTemplates = payload.unit_templates || [];

    for (const template of clientTemplates) {
      if (template.deleted === true) {
        await db.client_templates.where('id').equals(template.id).delete();
      } else {
        await db.client_templates.put({
          id: template.id,
          name: template.name,
          updatedAt: template.updatedAt,
          createdBy: template.createdBy || 'admin',
          createdAt: template.createdAt || Date.now(),
          deleted: false,
        });
      }
    }

    for (const template of unitTemplates) {
      if (template.deleted === true) {
        await db.unit_templates.where('id').equals(template.id).delete();
      } else {
        await db.unit_templates.put({
          id: template.id,
          clientId: template.clientId,
          objectType: template.objectType,
          unitData: template.unitData,
          label: template.label,
          updatedAt: template.updatedAt,
          createdBy: template.createdBy || 'admin',
          createdAt: template.createdAt || Date.now(),
          deleted: false,
        });
      }
    }
  } catch (err) {
    console.error('[syncService] pullTemplatesFromDrive error:', err);
  }
}

// ==========================================
// INSPECTIONS — PULL (MIRROR DRIVE)
// ==========================================
export async function pullInspectionsFromDrive(): Promise<{ pulled: number; skipped: number }> {
  let pulled = 0;
  let skipped = 0;

  try {
    const res = await fetch(apiUrl('/api/pull-inspections'), { method: 'GET' });
    if (!res.ok) return { pulled: 0, skipped: 0 };

    const data = await res.json();
    const inspections: any[] = data.inspections ?? [];
    const deletedIds: string[] = data.deletedIds ?? [];

    // ✅ MIRROR DRIVE: hapus lokal yang tidak ada di Drive
    // HANYA hapus sesi yang sudah fully_synced — jangan sentuh draft/pending milik device ini
    const driveIds = new Set(inspections.map((r: any) => r.id));
    const localSynced = await db.inspection_sessions.where('status').equals('synced').toArray();
    for (const local of localSynced) {
      if (!driveIds.has(local.id)) {
        // Jangan hapus kalau masih dalam proses upload
        if (local.uploadStatus === 'pending_upload' || local.uploadStatus === 'uploading_meta' || local.uploadStatus === 'uploading_photos' || local.uploadStatus === 'partial_failed') {
          continue;
        }
        await db.inspection_sessions.delete(local.id);
        await db.inspection_photos.where('sessionId').equals(local.id).delete();
      }
    }

    // Update / Tambah data dari Drive, skip jika sudah di tombstone
    for (const driveData of inspections) {
      try {
        if (deletedIds.includes(driveData.id)) {
          skipped++;
          continue;
        }

        const driveCreatedAt = new Date(driveData.createdAt).getTime();
        const driveUpdatedAt = driveData.updatedAt
          ? new Date(driveData.updatedAt).getTime()
          : driveCreatedAt;

        const existing = await db.inspection_sessions.get(driveData.id);

        if (existing) {
          const localUpdatedAt = existing.updatedAt ?? existing.createdAt;
          if (localUpdatedAt >= driveUpdatedAt) {
            skipped++;
            continue;
          }
          await db.inspection_sessions.update(driveData.id, {
            clientName: driveData.clientName,
            objectType: driveData.objectType,
            unitData: driveData.unitData,
            updatedAt: driveUpdatedAt,
            inspectorEmail: driveData.inspectorEmail,
            status: 'synced',
            drivePhotoIds: driveData.drivePhotoIds ?? [],
          });

          // Populate foto dari Drive yang belum ada di lokal
          const existingPhotos = await db.inspection_photos
            .where('sessionId').equals(driveData.id).toArray();
          const existingDriveIds = new Set(
            existingPhotos.map((p: any) => p.driveFileId).filter(Boolean)
          );
          for (const fileId of (driveData.drivePhotoIds ?? [])) {
            if (!existingDriveIds.has(fileId)) {
              await db.inspection_photos.add({
                id: crypto.randomUUID(),
                sessionId: driveData.id,
                dataUrl: '',
                driveFileId: fileId,
                createdAt: driveUpdatedAt,
              });
            }
          }

          pulled++;
        } else {
          await db.inspection_sessions.add({
            id: driveData.id,
            clientName: driveData.clientName,
            objectType: driveData.objectType,
            unitData: driveData.unitData,
            status: 'synced',
            createdAt: driveCreatedAt,
            updatedAt: driveUpdatedAt,
            inspectorEmail: driveData.inspectorEmail,
            drivePhotoIds: driveData.drivePhotoIds ?? [],
          });
          
          // Populate foto dari drivePhotoIds (tanpa base64, hanya simpan driveFileId)
          for (const fileId of (driveData.drivePhotoIds ?? [])) {
            const alreadyExists = await db.inspection_photos
              .where('driveFileId').equals(fileId).first();
            if (!alreadyExists) {
              await db.inspection_photos.add({
                id: crypto.randomUUID(),
                sessionId: driveData.id,
                dataUrl: '',           // kosong — foto diambil langsung dari Drive saat ditampilkan
                driveFileId: fileId,
                createdAt: driveCreatedAt,
              });
            }
          }
          pulled++;
        }
      } catch {
        skipped++;
      }
    }
  } catch (err) {
    console.error('[syncService] pullInspectionsFromDrive error:', err);
  }

  return { pulled, skipped };
}

export default {
  isOwner,
  pushTemplatesToDrive,
  pullTemplatesFromDrive,
  pullInspectionsFromDrive,
};