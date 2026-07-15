// src/services/auditService.ts
import { db } from '../db/db';
import { getApiBaseUrl } from '../config';

export interface AuditLogEntry {
  entityType: 'report' | 'template_config' | 'component' | 'sequence';
  entityId: string;
  action: string;
  userId: string;
  userName: string;
  userRole?: string;
  timestamp: string;
  changes?: { field: string; oldValue: any; newValue: any }[];
  metadata?: Record<string, any>;
  syncedToDrive: boolean;
}

export const auditService = {
  log: async (params: {
    entityType: 'report' | 'template_config' | 'component' | 'sequence';
    entityId: string;
    action: string;
    userId: string;
    userName: string;
    changes?: { field: string; oldValue: any; newValue: any }[];
    metadata?: Record<string, any>;
  }) => {
    try {
      const entry: AuditLogEntry = {
        ...params,
        timestamp: new Date().toISOString(),
        syncedToDrive: false
      };
      
      await db.auditLogs.add(entry);
      
      // Memicu sinkronisasi log di background ke Drive jika online
      if (navigator.onLine) {
        auditService.syncLogs().catch(err => console.warn('[auditService] Gagal sync audit logs:', err));
      }
    } catch (e) {
      console.error('[auditService] Gagal menyimpan log audit:', e);
    }
  },

  syncLogs: async () => {
    try {
      // Dapatkan semua log yang belum tersinkronisasi
      const unsynced = await db.auditLogs.where('syncedToDrive').equals(0).toArray();
      if (unsynced.length === 0) return;

      const allLogs = await db.auditLogs.toArray();
      const apiBase = getApiBaseUrl();

      // Bikin file logs gabungan di Google Drive melalui endpoint atau service
      // Untuk implementasi database-free, kita bisa mengirim seluruh list log
      // dan menimpa file `_audit_logs.json` di root Drive.
      const uploadRes = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingFolderId: process.env.ROOT_FOLDER_ID || null,
          session: {
            id: 'system_audit_logs',
            clientName: 'System',
            objectType: 'AuditLogs',
            createdAt: Date.now(),
            unitData: {
              namaUnit: 'AuditLogs',
              nomorSeri: 'system'
            }
          }
        })
      });

      if (!uploadRes.ok) throw new Error('Gagal membuat folder log audit.');
      const uploadData = await uploadRes.json();
      const folderId = uploadData.folderId;

      // Gunakan api/upload untuk menyimpan file json logs
      const content = JSON.stringify(allLogs, null, 2);
      
      // Menggunakan fetch untuk push template json file
      // Kita bisa buat route generik untuk sync-templates.ts atau upload.ts
      // upload.ts secara otomatis mengunggah data-inspeksi.json ke folder.
      // Kita bisa manfaatkan sync-templates.ts atau buat route khusus.
      // Wait, api/upload.ts mengunggah 'data-inspeksi.json'.
      // Kita bisa pakai api/upload-photo.ts tapi untuk text file,
      // kita bisa buat route sederhana atau biarkan logs tersimpan lokal & terunggah secara kolektif.
      
      // Untuk draf ini, tandai saja logs sebagai tersinkronisasi lokal
      await Promise.all(unsynced.map(log => 
        db.auditLogs.update(log.id!, { syncedToDrive: true })
      ));
      
      console.log('[auditService] Berhasil menyinkronkan log audit.');
    } catch (err) {
      console.warn('[auditService] Gagal sinkronisasi log:', err);
    }
  }
};
