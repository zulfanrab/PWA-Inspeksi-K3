// src/db/db.ts
import Dexie, { Table } from 'dexie';

export type UploadStatus =
  | 'pending_upload'
  | 'uploading_meta'
  | 'uploading_photos'
  | 'fully_synced'
  | 'partial_failed';

export interface InspectionSession {
  id: string;
  clientName: string;
  objectType: string;
  unitData: any;
  status: 'draft' | 'synced';
  createdAt: number;
  updatedAt?: number;
  templateClientId?: string;
  templateUnitId?: string;
  inspectorEmail?: string;
  driveFolderId?: string;
  drivePhotoIds?: string[];
  uploadStatus?: UploadStatus;
  photosUploaded?: number;
}

export interface InspectionPhoto {
  id: string;
  sessionId: string;
  dataUrl: string;
  driveFileId?: string;
  fileName?: string;
  createdAt: number;
}

export interface ClientTemplate {
  id: string;
  name: string;
  address?: string;
  contact?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  createdBy: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface UnitTemplate {
  id: string;
  clientId: string;
  objectType: string;
  unitData: Record<string, string>;
  label: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  createdBy: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface UnitWithMeta extends UnitTemplate {
  clientName: string;
  client?: ClientTemplate;
  hasPhotos: boolean;
  photoCount: number;
  sessionCount: number;
}

export interface UserRole {
  id: string;
  role: 'admin' | 'ahli';
  name: string;
  addedBy: string;
  createdAt: number;
}

export interface InspectorProfile {
  id: string;
  name: string;
  field: string;
  regNumber: string;
  skpImageDataUrl?: string;
  skpDriveFileId?: string;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
}

export interface CompanySetting {
  id: string;
  value: string;
  updatedAt: number;
}

export class MyDatabase extends Dexie {
  inspection_sessions!: Table<InspectionSession>;
  inspection_photos!: Table<InspectionPhoto>;
  client_templates!: Table<ClientTemplate>;
  unit_templates!: Table<UnitTemplate>;
  user_roles!: Table<UserRole>;
  inspectors!: Table<InspectorProfile>;
  company_settings!: Table<CompanySetting>;
  reports!: Table<any>;
  templateConfigs!: Table<any>;
  masterComponents!: Table<any>;
  auditLogs!: Table<any>;
  sequenceCounters!: Table<any>;
  reportJobs!: Table<any>;

  constructor() {
    super('AksaraDB');
    this.version(4).stores({
      inspection_sessions: 'id, clientName, status, createdAt',
      inspection_photos: 'id, sessionId, createdAt',
    });
    this.version(5).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail',
      inspection_photos: 'id, sessionId, createdAt',
      client_templates: 'id, name, createdAt, createdBy',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy',
      user_roles: 'id, role, createdAt',
    });
    this.version(6).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId',
      inspection_photos: 'id, sessionId, createdAt',
      client_templates: 'id, name, createdAt, createdBy',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy',
      user_roles: 'id, role, createdAt',
    });
    this.version(7).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId, uploadStatus',
      inspection_photos: 'id, sessionId, createdAt',
      client_templates: 'id, name, createdAt, createdBy, deleted',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy, deleted',
      user_roles: 'id, role, createdAt',
    });
    this.version(8).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId, uploadStatus',
      inspection_photos: 'id, sessionId, createdAt',
      client_templates: 'id, name, createdAt, createdBy, deleted',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy, deleted',
      user_roles: 'id, role, createdAt',
    });
    this.version(9).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId, uploadStatus',
      inspection_photos: 'id, sessionId, createdAt, driveFileId, fileName',
      client_templates: 'id, name, createdAt, createdBy, deleted',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy, deleted',
      user_roles: 'id, role, createdAt',
    });
    this.version(10).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId, uploadStatus',
      inspection_photos: 'id, sessionId, createdAt, driveFileId, fileName',
      client_templates: 'id, name, createdAt, createdBy, deleted',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy, deleted',
      user_roles: 'id, role, createdAt',
      reports: '++id, inspectionId, reportNumber, inspectionTypeCode, status, createdAt',
      templateConfigs: '++id, inspectionTypeCode, version, isActive',
      masterComponents: '++id, componentId, inspectionTypeCode, categoryId, isActive',
      auditLogs: '++id, entityType, entityId, action, timestamp, syncedToDrive',
      sequenceCounters: '++id, inspectionTypeCode, year, month',
      reportJobs: '++id, jobId, reportId, status, createdAt',
    });
    this.version(11).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId, uploadStatus',
      inspection_photos: 'id, sessionId, createdAt, driveFileId, fileName',
      client_templates: 'id, name, createdAt, createdBy, deleted',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy, deleted',
      user_roles: 'id, role, createdAt',
      inspectors: 'id, name, regNumber, createdAt, deleted',
      reports: '++id, inspectionId, reportNumber, inspectionTypeCode, status, createdAt',
      templateConfigs: '++id, inspectionTypeCode, version, isActive',
      masterComponents: '++id, componentId, inspectionTypeCode, categoryId, isActive',
      auditLogs: '++id, entityType, entityId, action, timestamp, syncedToDrive',
      sequenceCounters: '++id, inspectionTypeCode, year, month',
      reportJobs: '++id, jobId, reportId, status, createdAt',
    });
    this.version(12).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId, uploadStatus',
      inspection_photos: 'id, sessionId, createdAt, driveFileId, fileName',
      client_templates: 'id, name, createdAt, createdBy, deleted',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy, deleted',
      user_roles: 'id, role, createdAt',
      inspectors: 'id, name, regNumber, createdAt, deleted',
      company_settings: 'id, updatedAt',
      reports: '++id, inspectionId, reportNumber, inspectionTypeCode, status, createdAt',
      templateConfigs: '++id, inspectionTypeCode, version, isActive',
      masterComponents: '++id, componentId, inspectionTypeCode, categoryId, isActive',
      auditLogs: '++id, entityType, entityId, action, timestamp, syncedToDrive',
      sequenceCounters: '++id, inspectionTypeCode, year, month',
      reportJobs: '++id, jobId, reportId, status, createdAt',
    });
  }
}

export const db = new MyDatabase();

function sortPhotosDeterministically(photos: InspectionPhoto[]): InspectionPhoto[] {
  return [...photos].sort((a, b) => {
    if (a.fileName && b.fileName) return a.fileName.localeCompare(b.fileName);
    if (a.fileName) return -1;
    if (b.fileName) return 1;
    return a.createdAt - b.createdAt;
  });
}

export const SessionRepository = {
  getDrafts: async () => {
    const sessions = await db.inspection_sessions.where('status').equals('draft').toArray();
    return Promise.all(sessions.map(async (s) => ({
      ...s,
      photos: sortPhotosDeterministically(await db.inspection_photos.where('sessionId').equals(s.id).toArray()),
    })));
  },
  getHistory: async () => {
    const sessions = await db.inspection_sessions.where('status').equals('synced').toArray();
    return Promise.all(sessions.map(async (s) => ({
      ...s,
      photos: sortPhotosDeterministically(await db.inspection_photos.where('sessionId').equals(s.id).toArray()),
    })));
  },
  getClientNames: async () => {
    const sessions = await db.inspection_sessions.toArray();
    return Array.from(new Set(sessions.map((s) => s.clientName)));
  },
  getById: async (id: string) => {
    const session = await db.inspection_sessions.get(id);
    if (!session) return null;
    const photos = sortPhotosDeterministically(await db.inspection_photos.where('sessionId').equals(id).toArray());
    return { ...session, photos };
  },
  create: async (data: Omit<InspectionSession, 'id' | 'createdAt'>, photos: string[]) => {
    const id = crypto.randomUUID();
    await db.inspection_sessions.add({ ...data, id, createdAt: Date.now(), uploadStatus: 'pending_upload', photosUploaded: 0 });
    for (const dataUrl of photos) {
      await db.inspection_photos.add({ id: crypto.randomUUID(), sessionId: id, dataUrl, createdAt: Date.now() });
    }
    return id;
  },
  update: async (id: string, data: Partial<InspectionSession>, newPhotos: string[], deletedPhotoIds: string[]) => {
    await db.inspection_sessions.update(id, { ...data, updatedAt: Date.now(), uploadStatus: 'pending_upload', photosUploaded: 0 });
    for (const photoId of deletedPhotoIds) { await db.inspection_photos.delete(photoId); }
    for (const dataUrl of newPhotos) {
      await db.inspection_photos.add({ id: crypto.randomUUID(), sessionId: id, dataUrl, createdAt: Date.now() });
    }
  },
  markSynced: async (id: string, driveFolderId?: string) => {
    await db.inspection_sessions.update(id, { status: 'synced', uploadStatus: 'fully_synced', updatedAt: Date.now(), ...(driveFolderId ? { driveFolderId } : {}) });
  },
  delete: async (id: string) => {
    await db.inspection_sessions.delete(id);
    await db.inspection_photos.where('sessionId').equals(id).delete();
  },
};

export const ClientRepository = {
  getAll: async (sortBy: 'alpha' | 'recent' = 'alpha'): Promise<ClientTemplate[]> => {
    // FIX: Ambil semua dulu, baru filter manual. Data lama yang gak punya field 'deleted' bakal aman dan muncul!
    const all = await db.client_templates.toArray();
    const valid = all.filter(c => c.deleted !== true);
    if (sortBy === 'recent') {
      return valid.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    }
    return valid.sort((a, b) => a.name.localeCompare(b.name));
  },
  search: async (query: string, sortBy: 'alpha' | 'recent' = 'alpha'): Promise<ClientTemplate[]> => {
    const q = query.toLowerCase().trim();
    const all = await ClientRepository.getAll(sortBy);
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q) || (c.address && c.address.toLowerCase().includes(q)));
  },
  getById: async (id: string): Promise<ClientTemplate | undefined> => {
    const client = await db.client_templates.get(id);
    if (client && client.deleted === true) return undefined;
    return client;
  },
  create: async (data: Omit<ClientTemplate, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    await db.client_templates.add({ ...data, id, createdAt: Date.now(), deleted: false });
    return id;
  },
  update: async (id: string, data: Partial<ClientTemplate>) => {
    await db.client_templates.update(id, { ...data, updatedAt: Date.now() });
  },
  delete: async (id: string) => {
    await db.client_templates.update(id, { deleted: true, deletedAt: new Date().toISOString(), updatedAt: Date.now() });
    const units = await db.unit_templates.where('clientId').equals(id).toArray();
    await Promise.all(units.map(u => db.unit_templates.update(u.id, { deleted: true, deletedAt: new Date().toISOString(), updatedAt: Date.now() })));
  },
  getWithUnits: async (id: string) => {
    const client = await ClientRepository.getById(id);
    if (!client) return null;
    const allUnits = await db.unit_templates.where('clientId').equals(id).toArray();
    const units = allUnits.filter(u => u.deleted !== true);
    return { ...client, units };
  },
};

export const UnitRepository = {
  getByClient: async (clientId: string): Promise<UnitTemplate[]> => {
    const all = await db.unit_templates.where('clientId').equals(clientId).toArray();
    return all.filter(u => u.deleted !== true).sort((a, b) => a.label.localeCompare(b.label));
  },
  searchByClient: async (clientId: string, query: string): Promise<UnitTemplate[]> => {
    const units = await UnitRepository.getByClient(clientId);
    const q = query.toLowerCase().trim();
    if (!q) return units;
    return units.filter((u) => u.label.toLowerCase().includes(q) || u.objectType.toLowerCase().includes(q) || (u.unitData?.nomorSeri || '').toLowerCase().includes(q));
  },
  getAllRecentWithMeta: async (): Promise<UnitWithMeta[]> => {
    const [allUnits, allClients, allSessions, allPhotos] = await Promise.all([
      db.unit_templates.toArray(),
      db.client_templates.toArray(),
      db.inspection_sessions.toArray(),
      db.inspection_photos.toArray(),
    ]);

    const validClients = new Map(allClients.filter(c => c.deleted !== true).map(c => [c.id, c]));

    // Map photo count by sessionId
    const photoCountBySession = new Map<string, number>();
    for (const p of allPhotos) {
      photoCountBySession.set(p.sessionId, (photoCountBySession.get(p.sessionId) || 0) + 1);
    }

    // Map sessions to templateUnitId
    const unitSessionMap = new Map<string, { sessionCount: number; totalPhotos: number }>();
    for (const s of allSessions) {
      const photos = Math.max(photoCountBySession.get(s.id) || 0, s.drivePhotoIds?.length || 0, s.photosUploaded || 0);
      if (s.templateUnitId) {
        const prev = unitSessionMap.get(s.templateUnitId) || { sessionCount: 0, totalPhotos: 0 };
        unitSessionMap.set(s.templateUnitId, {
          sessionCount: prev.sessionCount + 1,
          totalPhotos: prev.totalPhotos + photos,
        });
      }
    }

    const validUnits: UnitWithMeta[] = allUnits
      .filter(u => u.deleted !== true && validClients.has(u.clientId))
      .map(u => {
        const client = validClients.get(u.clientId);
        let stats = unitSessionMap.get(u.id);

        if (!stats) {
          const matchingSessions = allSessions.filter(s =>
            !s.templateUnitId &&
            s.clientName?.toLowerCase().trim() === client?.name?.toLowerCase().trim() &&
            (s.unitData?.namaUnit?.toLowerCase().trim() === u.label?.toLowerCase().trim() ||
             (u.unitData?.nomorSeri && s.unitData?.nomorSeri === u.unitData?.nomorSeri))
          );
          if (matchingSessions.length > 0) {
            let totalP = 0;
            for (const ms of matchingSessions) {
              totalP += Math.max(photoCountBySession.get(ms.id) || 0, ms.drivePhotoIds?.length || 0, ms.photosUploaded || 0);
            }
            stats = { sessionCount: matchingSessions.length, totalPhotos: totalP };
          }
        }

        const totalPhotos = stats?.totalPhotos || 0;
        const sessionCount = stats?.sessionCount || 0;

        return {
          ...u,
          client,
          clientName: client?.name || 'Klien Tanpa Nama',
          hasPhotos: totalPhotos > 0,
          photoCount: totalPhotos,
          sessionCount,
        };
      })
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    return validUnits;
  },
  getById: async (id: string): Promise<UnitTemplate | undefined> => {
    const unit = await db.unit_templates.get(id);
    if (unit && unit.deleted === true) return undefined;
    return unit;
  },
  create: async (data: Omit<UnitTemplate, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    await db.unit_templates.add({ ...data, id, createdAt: Date.now(), deleted: false });
    return id;
  },
  update: async (id: string, data: Partial<UnitTemplate>) => {
    await db.unit_templates.update(id, { ...data, updatedAt: Date.now() });
  },
  delete: async (id: string) => {
    await db.unit_templates.update(id, { deleted: true, deletedAt: new Date().toISOString(), updatedAt: Date.now() });
  },
};

export const RoleRepository = {
  getAll: async (): Promise<UserRole[]> => db.user_roles.toArray(),
  getByEmail: async (email: string): Promise<UserRole | undefined> => db.user_roles.get(email),
  isAdmin: async (email: string): Promise<boolean> => {
    const role = await db.user_roles.get(email);
    return role?.role === 'admin';
  },
  upsert: async (email: string, role: 'admin' | 'ahli', name: string, addedBy: string) => {
    const existing = await db.user_roles.get(email);
    if (existing) await db.user_roles.update(email, { role, name });
    else await db.user_roles.add({ id: email, role, name, addedBy, createdAt: Date.now() });
  },
  delete: async (email: string) => db.user_roles.delete(email),
  seedIfEmpty: async (ownerEmail: string, ownerName: string) => {
    const count = await db.user_roles.count();
    if (count === 0 && ownerEmail) await db.user_roles.add({ id: ownerEmail, role: 'admin', name: ownerName || 'Owner', addedBy: 'system', createdAt: Date.now() });
  },
};

export const InspectorRepository = {
  getAll: async (): Promise<InspectorProfile[]> => {
    const all = await db.inspectors.toArray();
    return all.filter(i => i.deleted !== true).sort((a, b) => a.name.localeCompare(b.name));
  },
  getById: async (id: string): Promise<InspectorProfile | undefined> => {
    const item = await db.inspectors.get(id);
    return item && item.deleted !== true ? item : undefined;
  },
  upsert: async (profile: Omit<InspectorProfile, 'id' | 'createdAt'> & { id?: string }): Promise<string> => {
    const id = profile.id || crypto.randomUUID();
    const existing = await db.inspectors.get(id);
    if (existing) {
      await db.inspectors.update(id, {
        ...profile,
        id,
        updatedAt: Date.now(),
        deleted: false,
      });
    } else {
      await db.inspectors.add({
        ...profile,
        id,
        createdAt: Date.now(),
        deleted: false,
      });
    }
    return id;
  },
  delete: async (id: string) => {
    await db.inspectors.update(id, { deleted: true, updatedAt: Date.now() });
  },
  replaceAllFromSync: async (profiles: InspectorProfile[]) => {
    await db.transaction('rw', db.inspectors, async () => {
      await db.inspectors.clear();
      if (profiles.length > 0) {
        await db.inspectors.bulkPut(profiles);
      }
    });
  },
};

export const CompanySkpRepository = {
  getSkpImage: async (): Promise<string> => {
    const row = await db.company_settings.get('skp_perusahaan');
    return row?.value || '';
  },
  saveSkpImage: async (dataUrl: string): Promise<void> => {
    await db.company_settings.put({
      id: 'skp_perusahaan',
      value: dataUrl,
      updatedAt: Date.now(),
    });
  },
  clearSkpImage: async (): Promise<void> => {
    await db.company_settings.delete('skp_perusahaan');
  },
};