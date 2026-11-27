// src/services/auditService.ts
import { db } from '../db/db';

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
        syncedToDrive: false,
      };
      await db.auditLogs.add(entry);
    } catch (e) {
      console.error('[auditService] Gagal menyimpan log audit lokal:', e);
    }
  },

  syncLogs: async () => {
    try {
      const allLogs = await db.auditLogs.toArray();
      const unsynced = allLogs.filter((l) => !l.syncedToDrive);
      if (unsynced.length === 0) return;

      await Promise.all(
        unsynced.map((log) =>
          db.auditLogs.update(log.id!, { syncedToDrive: true })
        )
      );
    } catch (err) {
      console.warn('[auditService] Gagal memperbarui status log:', err);
    }
  },
};
