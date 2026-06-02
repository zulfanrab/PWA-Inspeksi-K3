// src/db/db.ts
// Schema v7: inspection_sessions, inspection_photos, client_templates, unit_templates, user_roles
// Penambahan: uploadStatus & photosUploaded (untuk Smart Append), deleted & deletedAt (untuk Tombstone)

import Dexie, { Table } from 'dexie';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export type UploadStatus =
  | 'pending_upload'    // Belum pernah dikirim
  | 'uploading_meta'    // Sedang upload JSON ke Drive
  | 'uploading_photos'  // Sedang upload foto satu per satu
  | 'fully_synced'      // Semua berhasil
  | 'partial_failed';   // Gagal di tengah jalan, bisa di-retry

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
  // NEW: untuk Smart Append & Antrean (Masalah 1)
  uploadStatus?: UploadStatus;
  photosUploaded?: number;
}

export interface InspectionPhoto {
  id: string;
  sessionId: string;
  dataUrl: string;
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
  // NEW: untuk Tombstone / Hapus tanpa jejak (Masalah 2)
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
  // NEW: untuk Tombstone / Hapus tanpa jejak (Masalah 2)
  deleted?: boolean;
  deletedAt?: string;
}

export interface UserRole {
  id: string;       // email user (primary key)
  role: 'admin' | 'ahli';
  name: string;
  addedBy: string;
  createdAt: number;
}

// ==========================================
// DATABASE CLASS
// ==========================================

export class MyDatabase extends Dexie {
  inspection_sessions!: Table<InspectionSession>;
  inspection_photos!: Table<InspectionPhoto>;
  client_templates!: Table<ClientTemplate>;
  unit_templates!: Table<UnitTemplate>;
  user_roles!: Table<UserRole>;

  constructor() {
    super('AksaraDB');

    // v4 = schema lama
    this.version(4).stores({
      inspection_sessions: 'id, clientName, status, createdAt',
      inspection_photos: 'id, sessionId, createdAt',
    });

    // v5 = tambah tabel template
    this.version(5).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail',
      inspection_photos: 'id, sessionId, createdAt',
      client_templates: 'id, name, createdAt, createdBy',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy',
      user_roles: 'id, role, createdAt',
    });

    // v6 = tambah driveFolderId
    this.version(6).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId',
      inspection_photos: 'id, sessionId, createdAt',
      client_templates: 'id, name, createdAt, createdBy',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy',
      user_roles: 'id, role, createdAt',
    });

    // v7 = NEW: tambah index uploadStatus & deleted (Tombstone)
    this.version(7).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail, driveFolderId, uploadStatus',
      inspection_photos: 'id, sessionId, createdAt',
      client_templates: 'id, name, createdAt, createdBy, deleted',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy, deleted',
      user_roles: 'id, role, createdAt',
    }).upgrade(async (_trans) => {
      console.log('[DB] Migrating to v7: adding Smart Append & Tombstone support');
    });
  }
}

export const db = new MyDatabase();

// ==========================================
// REPOSITORY — SESSION
// ==========================================

export const SessionRepository = {
  getDrafts: async () => {
    const sessions = await db.inspection_sessions
      .where('status').equals('draft').toArray();
    return Promise.all(
      sessions.map(async (s) => ({
        ...s,
        photos: await db.inspection_photos
          .where('sessionId').equals(s.id).toArray(),
      }))
    );
  },

  getHistory: async () => {
    const sessions = await db.inspection_sessions
      .where('status').equals('synced').toArray();
    return Promise.all(
      sessions.map(async (s) => ({
        ...s,
        photos: await db.inspection_photos
          .where('sessionId').equals(s.id).toArray(),
      }))
    );
  },

  getClientNames: async () => {
    const sessions = await db.inspection_sessions.toArray();
    return Array.from(new Set(sessions.map((s) => s.clientName)));
  },

  getById: async (id: string) => {
    const session = await db.inspection_sessions.get(id);
    if (!session) return null;
    const photos = await db.inspection_photos
      .where('sessionId').equals(id).toArray();
    return { ...session, photos };
  },

  create: async (
    data: Omit<InspectionSession, 'id' | 'createdAt'>,
    photos: string[]
  ) => {
    const id = crypto.randomUUID();
    // Default uploadStatus saat baru dibuat adalah 'pending_upload'
    await db.inspection_sessions.add({ 
      ...data, 
      id, 
      createdAt: Date.now(),
      uploadStatus: 'pending_upload',
      photosUploaded: 0 
    });
    for (const dataUrl of photos) {
      await db.inspection_photos.add({
        id: crypto.randomUUID(),
        sessionId: id,
        dataUrl,
        createdAt: Date.now(),
      });
    }
    return id;
  },

  update: async (
    id: string,
    data: Partial<InspectionSession>,
    newPhotos: string[],
    deletedPhotoIds: string[]
  ) => {
    // Kalau ada editan, status upload kita reset biar di-sync ulang dengan benar
    await db.inspection_sessions.update(id, { 
      ...data, 
      updatedAt: Date.now(),
      uploadStatus: 'pending_upload',
      photosUploaded: 0 
    });
    for (const photoId of deletedPhotoIds) {
      await db.inspection_photos.delete(photoId);
    }
    for (const dataUrl of newPhotos) {
      await db.inspection_photos.add({
        id: crypto.randomUUID(),
        sessionId: id,
        dataUrl,
        createdAt: Date.now(),
      });
    }
  },

  markSynced: async (id: string, driveFolderId?: string) => {
    await db.inspection_sessions.update(id, {
      status: 'synced',
      uploadStatus: 'fully_synced',
      updatedAt: Date.now(),
      ...(driveFolderId ? { driveFolderId } : {}),
    });
  },

  delete: async (id: string) => {
    await db.inspection_sessions.delete(id);
    await db.inspection_photos.where('sessionId').equals(id).delete();
  },
};

// ==========================================
// REPOSITORY — CLIENT TEMPLATES
// ==========================================

export const ClientRepository = {
  getAll: async (): Promise<ClientTemplate[]> => {
    // Jangan tampilkan yang sudah di-soft-delete (tombstone)
    return db.client_templates
      .where('deleted').notEqual('true') // Dexie workaround untuk boolean
      .and(c => !c.deleted)
      .toArray()
      .then(res => res.sort((a, b) => a.name.localeCompare(b.name)));
  },

  search: async (query: string): Promise<ClientTemplate[]> => {
    const q = query.toLowerCase().trim();
    if (!q) return ClientRepository.getAll();
    const all = await ClientRepository.getAll();
    return all.filter((c) => c.name.toLowerCase().includes(q));
  },

  getById: async (id: string): Promise<ClientTemplate | undefined> => {
    const client = await db.client_templates.get(id);
    if (client && client.deleted) return undefined;
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
    // Sekarang cuma soft-delete, bukan delete permanen
    await db.client_templates.update(id, { 
      deleted: true, 
      deletedAt: new Date().toISOString(),
      updatedAt: Date.now()
    });
    // Cascade soft-delete unit
    const units = await db.unit_templates.where('clientId').equals(id).toArray();
    await Promise.all(units.map(u => 
      db.unit_templates.update(u.id, { 
        deleted: true, 
        deletedAt: new Date().toISOString(),
        updatedAt: Date.now()
      })
    ));
  },

  getWithUnits: async (id: string) => {
    const client = await ClientRepository.getById(id);
    if (!client) return null;
    const units = await db.unit_templates
      .where('clientId').equals(id)
      .and(u => !u.deleted)
      .toArray();
    return { ...client, units };
  },
};

// ==========================================
// REPOSITORY — UNIT TEMPLATES
// ==========================================

export const UnitRepository = {
  getByClient: async (clientId: string): Promise<UnitTemplate[]> => {
    return db.unit_templates
      .where('clientId').equals(clientId)
      .and(u => !u.deleted)
      .toArray()
      .then((units) => units.sort((a, b) => a.label.localeCompare(b.label)));
  },

  searchByClient: async (
    clientId: string,
    query: string
  ): Promise<UnitTemplate[]> => {
    const units = await UnitRepository.getByClient(clientId);
    const q = query.toLowerCase().trim();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.label.toLowerCase().includes(q) ||
        u.objectType.toLowerCase().includes(q) ||
        (u.unitData?.nomorSeri || '').toLowerCase().includes(q)
    );
  },

  getById: async (id: string): Promise<UnitTemplate | undefined> => {
    const unit = await db.unit_templates.get(id);
    if (unit && unit.deleted) return undefined;
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
    // Soft-delete
    await db.unit_templates.update(id, { 
      deleted: true, 
      deletedAt: new Date().toISOString(),
      updatedAt: Date.now()
    });
  },
};

// ==========================================
// REPOSITORY — USER ROLES
// ==========================================

export const RoleRepository = {
  getAll: async (): Promise<UserRole[]> => {
    return db.user_roles.toArray();
  },

  getByEmail: async (email: string): Promise<UserRole | undefined> => {
    return db.user_roles.get(email);
  },

  isAdmin: async (email: string): Promise<boolean> => {
    const role = await db.user_roles.get(email);
    return role?.role === 'admin';
  },

  upsert: async (
    email: string,
    role: 'admin' | 'ahli',
    name: string,
    addedBy: string
  ) => {
    const existing = await db.user_roles.get(email);
    if (existing) {
      await db.user_roles.update(email, { role, name });
    } else {
      await db.user_roles.add({
        id: email,
        role,
        name,
        addedBy,
        createdAt: Date.now(),
      });
    }
  },

  delete: async (email: string) => {
    await db.user_roles.delete(email);
  },

  seedIfEmpty: async (ownerEmail: string, ownerName: string) => {
    const count = await db.user_roles.count();
    if (count === 0 && ownerEmail) {
      await db.user_roles.add({
        id: ownerEmail,
        role: 'admin',
        name: ownerName || 'Owner',
        addedBy: 'system',
        createdAt: Date.now(),
      });
    }
  },
};