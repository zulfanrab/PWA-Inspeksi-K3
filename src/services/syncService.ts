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

    // HANYA kirim template yang aktif (bukan yang bertanda deleted: true)
    const activeClients = clientTemplates.filter(c => c.deleted !== true);
    const activeUnits = unitTemplates.filter(u => u.deleted !== true);

    const payload = {
      adminEmail: import.meta.env.VITE_OWNER_EMAIL || '',
      client_templates: activeClients,
      unit_templates: activeUnits,
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
// TEMPLATES — PULL (TRUE DRIVE MIRRORING)
// ==========================================
export async function pullTemplatesFromDrive(): Promise<{ pulledClients: number; pulledUnits: number; purgedClients: number; purgedUnits: number }> {
  try {
    const res = await fetch(apiUrl(`/api/sync-templates?t=${Date.now()}`), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return { pulledClients: 0, pulledUnits: 0, purgedClients: 0, purgedUnits: 0 };

    const payload = await res.json();
    const clientTemplates: any[] = payload.client_templates || [];
    const unitTemplates: any[] = payload.unit_templates || [];

    // 1. Kumpulkan ID aktif dari Drive (yang tidak ditandai deleted)
    const driveActiveClientIds = new Set(
      clientTemplates.filter((c: any) => c.deleted !== true).map((c: any) => c.id)
    );
    const driveActiveUnitIds = new Set(
      unitTemplates.filter((u: any) => u.deleted !== true).map((u: any) => u.id)
    );

    let purgedClients = 0;
    let purgedUnits = 0;

    // 2. TRUE MIRRORING: Bersihkan data lokal yang TIDAK ADA di Drive atau sudah dihapus
    const localClients = await db.client_templates.toArray();
    for (const local of localClients) {
      if (!driveActiveClientIds.has(local.id)) {
        await db.client_templates.delete(local.id);
        purgedClients++;
      }
    }

    const localUnits = await db.unit_templates.toArray();
    for (const local of localUnits) {
      if (!driveActiveUnitIds.has(local.id)) {
        await db.unit_templates.delete(local.id);
        purgedUnits++;
      }
    }

    // 3. Simpan / Perbarui data aktif dari Drive ke IndexedDB lokal
    for (const template of clientTemplates) {
      if (template.deleted !== true) {
        await db.client_templates.put({
          id: template.id,
          name: template.name,
          address: template.address,
          contact: template.contact,
          notes: template.notes,
          updatedAt: template.updatedAt,
          createdBy: template.createdBy || 'admin',
          createdAt: template.createdAt || Date.now(),
          deleted: false,
        });
      }
    }

    for (const template of unitTemplates) {
      if (template.deleted !== true) {
        await db.unit_templates.put({
          id: template.id,
          clientId: template.clientId,
          objectType: template.objectType,
          unitData: template.unitData,
          label: template.label,
          notes: template.notes,
          updatedAt: template.updatedAt,
          createdBy: template.createdBy || 'admin',
          createdAt: template.createdAt || Date.now(),
          deleted: false,
        });
      }
    }

    return {
      pulledClients: driveActiveClientIds.size,
      pulledUnits: driveActiveUnitIds.size,
      purgedClients,
      purgedUnits,
    };
  } catch (err) {
    console.error('[syncService] pullTemplatesFromDrive error:', err);
    return { pulledClients: 0, pulledUnits: 0, purgedClients: 0, purgedUnits: 0 };
  }
}

// ==========================================
// INSPECTIONS — PULL (MIRROR DRIVE)
// ==========================================
export async function pullInspectionsFromDrive(): Promise<{ pulled: number; skipped: number; deletedIds: string[] }> {
  let pulled = 0;
  let skipped = 0;
  let deletedIds: string[] = [];

  try {
    const res = await fetch(apiUrl(`/api/pull-inspections?t=${Date.now()}`), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return { pulled: 0, skipped: 0, deletedIds: [] };

    const data = await res.json();
    const inspections: any[] = data.inspections ?? [];
    deletedIds = data.deletedIds ?? [];

    // ✅ MIRROR DRIVE: hapus lokal yang tidak ada di Drive
    // HANYA hapus sesi yang sudah fully_synced — jangan sentuh draft/pending milik device ini
    const driveIds = new Set(
  inspections
    .filter((r: any) => !deletedIds.includes(r.id))
    .map((r: any) => r.id)
);
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
          // Populate foto dulu — tidak peduli timestamp
          const existingPhotos = await db.inspection_photos
            .where('sessionId').equals(driveData.id).toArray();
          const existingDriveIds = new Set(
            existingPhotos.map((p: any) => p.driveFileId).filter(Boolean)
          );
          const driveFileNames: string[] = driveData.drivePhotoFileNames ?? [];
          for (let fi = 0; fi < (driveData.drivePhotoIds ?? []).length; fi++) {
            const fileId = driveData.drivePhotoIds[fi];
            const fileName = driveFileNames[fi];
            if (!existingDriveIds.has(fileId)) {
              await db.inspection_photos.add({
                id: crypto.randomUUID(),
                sessionId: driveData.id,
                dataUrl: '',
                driveFileId: fileId,
                fileName: fileName, // diisi saat pull-inspections return fileName
                createdAt: driveUpdatedAt,
              });
            }
          }
          // Patch foto lama yang driveFileId kosong
          const photosWithoutId = existingPhotos.filter((p: any) => !p.driveFileId);
          const allDriveIds = driveData.drivePhotoIds ?? [];
          for (let idx = 0; idx < photosWithoutId.length && idx < allDriveIds.length; idx++) {
            await db.inspection_photos.update(photosWithoutId[idx].id, {
              driveFileId: allDriveIds[idx],
              fileName: driveFileNames[idx],
            });
          }

          // Patch fileName ke foto yang sudah ada driveFileId tapi belum punya fileName
          for (const photo of existingPhotos) {
            if (!photo.fileName && photo.driveFileId) {
              const idx = (driveData.drivePhotoIds ?? []).indexOf(photo.driveFileId);
              if (idx !== -1 && driveFileNames[idx]) {
                await db.inspection_photos.update(photo.id, { fileName: driveFileNames[idx] });
              }
            }
          }

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
          
          const driveFileNames: string[] = driveData.drivePhotoFileNames ?? [];
          for (let fi = 0; fi < (driveData.drivePhotoIds ?? []).length; fi++) {
            const fileId = driveData.drivePhotoIds[fi];
            const fileName = driveFileNames[fi];
            const alreadyExists = await db.inspection_photos
              .where('driveFileId').equals(fileId).first();
            if (!alreadyExists) {
              await db.inspection_photos.add({
                id: crypto.randomUUID(),
                sessionId: driveData.id,
                dataUrl: '',
                driveFileId: fileId,
                fileName: fileName,
                createdAt: driveCreatedAt,
              });
            }
          }

          // Patch foto lama yang driveFileId-nya masih kosong
          const allPhotosElse = await db.inspection_photos
            .where('sessionId').equals(driveData.id).toArray();
          const photosWithoutIdElse = allPhotosElse.filter((p: any) => !p.driveFileId);
          const allDriveIdsElse = driveData.drivePhotoIds ?? [];
          for (let idx = 0; idx < photosWithoutIdElse.length && idx < allDriveIdsElse.length; idx++) {
            await db.inspection_photos.update(photosWithoutIdElse[idx].id, {
              driveFileId: allDriveIdsElse[idx],
              fileName: driveFileNames[idx],
            });
          }

          // Patch fileName ke foto yang sudah ada driveFileId tapi belum punya fileName
          for (const photo of allPhotosElse) {
            if (!photo.fileName && photo.driveFileId) {
              const idx = (driveData.drivePhotoIds ?? []).indexOf(photo.driveFileId);
              if (idx !== -1 && driveFileNames[idx]) {
                await db.inspection_photos.update(photo.id, { fileName: driveFileNames[idx] });
              }
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

  return { pulled, skipped, deletedIds };
}

export default {
  isOwner,
  pushTemplatesToDrive,
  pullTemplatesFromDrive,
  pullInspectionsFromDrive,
};