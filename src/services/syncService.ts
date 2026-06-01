// src/services/syncService.ts
// FIXED: Semua operasi Drive sekarang lewat serverless api/
// FIXED: pushTemplatesToDrive → POST ke api/sync-templates
// FIXED: pullTemplatesFromDrive → GET dari api/sync-templates
// FIXED: pullInspectionsFromDrive → GET dari api/pull-inspections
// Tidak ada lagi fetch langsung ke googleapis.com dari frontend

import { db, ClientRepository, UnitRepository, SessionRepository } from '../db/db';
import { getApiBaseUrl } from '../config';

// ==========================================
// HELPERS
// ==========================================

export function isOwner(email: string | undefined | null): boolean {
  const owner = import.meta.env.VITE_OWNER_EMAIL || '';
  if (!email) return false;
  return email === owner;
}

function apiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}

// ==========================================
// TEMPLATES — PUSH
// FIXED: Kirim ke api/sync-templates (POST) bukan langsung ke Drive
// ==========================================

export async function pushTemplatesToDrive(): Promise<void> {
  try {
    const clients = await ClientRepository.getAll();
    const clientsWithUnits = await Promise.all(
      clients.map(async (c) => {
        const units = await UnitRepository.getByClient(c.id);
        return { ...c, units };
      })
    );

    const payload = {
      version: Date.now(),
      exportedAt: new Date().toISOString(),
      clients: clientsWithUnits,
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

    console.info('[syncService] pushTemplatesToDrive sukses:', clients.length, 'klien');
  } catch (err) {
    console.error('[syncService] pushTemplatesToDrive error:', err);
    throw err;
  }
}

// ==========================================
// TEMPLATES — PULL
// FIXED: Ambil dari api/sync-templates (GET) bukan langsung dari Drive
// ==========================================

export async function pullTemplatesFromDrive(): Promise<void> {
  try {
    const res = await fetch(apiUrl('/api/sync-templates'), { method: 'GET' });

    if (!res.ok) {
      console.warn('[syncService] pullTemplatesFromDrive: HTTP', res.status);
      return;
    }

    const payload = await res.json();

    if (!payload?.clients?.length) {
      console.info('[syncService] pullTemplatesFromDrive: tidak ada data di Drive');
      return;
    }

    // Merge ke IndexedDB — upsert berdasarkan id
    for (const client of payload.clients) {
      const { units, ...clientData } = client;

      const existing = await db.client_templates.get(clientData.id);
      if (!existing) {
        await db.client_templates.add(clientData);
      } else if (
        (clientData.updatedAt ?? clientData.createdAt) >
        (existing.updatedAt ?? existing.createdAt)
      ) {
        await db.client_templates.put(clientData);
      }

      for (const unit of units) {
        const existingUnit = await db.unit_templates.get(unit.id);
        if (!existingUnit) {
          await db.unit_templates.add(unit);
        } else if (
          (unit.updatedAt ?? unit.createdAt) >
          (existingUnit.updatedAt ?? existingUnit.createdAt)
        ) {
          await db.unit_templates.put(unit);
        }
      }
    }

    console.info('[syncService] pullTemplatesFromDrive sukses:', payload.clients.length, 'klien');
  } catch (err) {
    console.error('[syncService] pullTemplatesFromDrive error:', err);
    // Tidak throw — pull gagal tidak boleh crash app
  }
}

// ==========================================
// INSPECTIONS — PULL
// FIXED: Ambil dari api/pull-inspections (GET) bukan langsung dari Drive
// ==========================================

export async function pullInspectionsFromDrive(): Promise<{
  pulled: number;
  skipped: number;
}> {
  let pulled = 0;
  let skipped = 0;

  try {
    const res = await fetch(apiUrl('/api/pull-inspections'), { method: 'GET' });

    if (!res.ok) {
      console.warn('[syncService] pullInspectionsFromDrive: HTTP', res.status);
      return { pulled: 0, skipped: 0 };
    }

    const data = await res.json();
    const inspections: any[] = data.inspections ?? [];

    console.info(`[syncService] Diterima ${inspections.length} inspeksi dari server`);
    // ========================================================
    // 🧹 SELF-CLEANING TRIGGER (GARBAGE COLLECTION)
    // ========================================================
    try {
      // 1. Catat semua ID yang valid dan masih hidup di Google Drive
      const driveSessionIds = inspections.map((r: any) => r.id);
      
      // 2. Ambil riwayat lokal di HP (yang statusnya udah 'synced')
      const localHistory = await SessionRepository.getHistory();

      // 3. Bandingkan. Kalau ada di HP tapi udah musnah di Drive, hapus!
      for (const localSession of localHistory) {
        if (!driveSessionIds.includes(localSession.id)) {
          console.info(`[Pembersihan Otomatis] Menghapus zombie lokal: ${localSession.id}`);
          await SessionRepository.delete(localSession.id);
        }
      }
    } catch (cleanErr) {
      console.warn('[syncService] Gagal menjalankan pembersihan otomatis:', cleanErr);
    }
    // ========================================================

    for (const driveData of inspections) {
      try {
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
          // Drive lebih baru — update
          await db.inspection_sessions.update(driveData.id, {
            clientName: driveData.clientName,
            objectType: driveData.objectType,
            unitData: driveData.unitData,
            updatedAt: driveUpdatedAt,
            inspectorEmail: driveData.inspectorEmail,
            status: 'synced',
          });
          pulled++;
        } else {
          // Belum ada di lokal — insert
          await db.inspection_sessions.add({
            id: driveData.id,
            clientName: driveData.clientName,
            objectType: driveData.objectType,
            unitData: driveData.unitData,
            status: 'synced',
            createdAt: driveCreatedAt,
            updatedAt: driveUpdatedAt,
            inspectorEmail: driveData.inspectorEmail,
          });
          pulled++;
        }
      } catch (itemErr) {
        console.warn('[syncService] Skip inspection:', itemErr);
        skipped++;
      }
    }

    console.info(`[syncService] pullInspectionsFromDrive selesai: pulled=${pulled}, skipped=${skipped}`);
  } catch (err) {
    console.error('[syncService] pullInspectionsFromDrive error:', err);
    // Tidak throw — pull gagal tidak boleh crash app
  }

  return { pulled, skipped };
}

export default {
  isOwner,
  pushTemplatesToDrive,
  pullTemplatesFromDrive,
  pullInspectionsFromDrive,
};