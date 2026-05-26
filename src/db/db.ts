// src/db/db.ts
// CHANGED: Tambah tabel clients, units, dan user_roles untuk fitur Template Unit

import Dexie, { Table } from 'dexie';

// ==========================================
// EXISTING INTERFACES (tidak berubah)
// ==========================================

export interface InspectionSession {
  id: string;
  clientName: string;
  objectType: string;
  unitData: any;
  status: 'draft' | 'synced';
  createdAt: number;
  updatedAt?: number;
  // NEW: referensi ke template unit (optional, backward-compatible)
  templateClientId?: string;
  templateUnitId?: string;
  inspectorEmail?: string; // email user yang melakukan inspeksi
}

export interface InspectionPhoto {
  id: string;
  sessionId: string;
  dataUrl: string;
  createdAt: number;
}

// NEW: Interface untuk data Klien (template)
export interface ClientTemplate {
  id: string;
  name: string;           // Nama perusahaan klien
  address?: string;       // Alamat
  contact?: string;       // Kontak PIC
  notes?: string;         // Catatan
  createdAt: number;
  updatedAt?: number;
  createdBy: string;      // email admin yang membuat
}

// NEW: Interface untuk Unit template per klien
export interface UnitTemplate {
  id: string;
  clientId: string;       // FK ke ClientTemplate
  objectType: string;     // salah satu dari 8 jenis K3
  unitData: Record<string, string>; // pre-filled field values
  label: string;          // nama tampilan, biasanya namaUnit
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  createdBy: string;
}

// NEW: Interface untuk role management
export interface UserRole {
  id: string;             // email user (primary key)
  role: 'admin' | 'ahli';
  name: string;           // nama display
  addedBy: string;        // email admin yang menambahkan
  createdAt: number;
}

// ==========================================
// DATABASE CLASS
// ==========================================

export class MyDatabase extends Dexie {
  inspection_sessions!: Table<InspectionSession>;
  inspection_photos!: Table<InspectionPhoto>;
  // NEW tables
  client_templates!: Table<ClientTemplate>;
  unit_templates!: Table<UnitTemplate>;
  user_roles!: Table<UserRole>;

  constructor() {
    super('AksaraDB');

    // version 4 = schema lama (tidak dihapus agar migration aman)
    this.version(4).stores({
      inspection_sessions: 'id, clientName, status, createdAt',
      inspection_photos: 'id, sessionId, createdAt'
    });

    // CHANGED: version 5 = tambah tabel baru, schema lama tetap ada
    this.version(5).stores({
      inspection_sessions: 'id, clientName, status, createdAt, templateClientId, inspectorEmail',
      inspection_photos: 'id, sessionId, createdAt',
      // NEW tables
      client_templates: 'id, name, createdAt, createdBy',
      unit_templates: 'id, clientId, objectType, createdAt, createdBy',
      user_roles: 'id, role, createdAt',
    }).upgrade(async (_trans) => {
      // Migration: data lama tetap aman, tabel baru kosong
      console.log('[DB] Migrating to v5: adding client_templates, unit_templates, user_roles');
    });
  }
}

export const db = new MyDatabase();

// ==========================================
// REPOSITORY PATTERN - SESSION (tidak berubah)
// ==========================================

export const SessionRepository = {
  getDrafts: async () => {
    const sessions = await db.inspection_sessions.where('status').equals('draft').toArray();
    return Promise.all(sessions.map(async s => ({
      ...s,
      photos: await db.inspection_photos.where('sessionId').equals(s.id).toArray()
    })));
  },

  getHistory: async () => {
    const sessions = await db.inspection_sessions.where('status').equals('synced').toArray();
    return Promise.all(sessions.map(async s => ({
      ...s,
      photos: await db.inspection_photos.where('sessionId').equals(s.id).toArray()
    })));
  },

  getClientNames: async () => {
    const sessions = await db.inspection_sessions.toArray();
    return Array.from(new Set(sessions.map(s => s.clientName)));
  },

  getById: async (id: string) => {
    const session = await db.inspection_sessions.get(id);
    if (!session) return null;
    const photos = await db.inspection_photos.where('sessionId').equals(id).toArray();
    return { ...session, photos };
  },

  create: async (data: Omit<InspectionSession, 'id' | 'createdAt'>, photos: string[]) => {
    const id = crypto.randomUUID();
    await db.inspection_sessions.add({ ...data, id, createdAt: Date.now() });
    for (const dataUrl of photos) {
      await db.inspection_photos.add({
        id: crypto.randomUUID(), sessionId: id, dataUrl, createdAt: Date.now()
      });
    }
  },

  update: async (id: string, data: Partial<InspectionSession>, newPhotos: string[], deletedPhotoIds: string[]) => {
    await db.inspection_sessions.update(id, { ...data, updatedAt: Date.now() });
    for (const photoId of deletedPhotoIds) {
      await db.inspection_photos.delete(photoId);
    }
    for (const dataUrl of newPhotos) {
      await db.inspection_photos.add({
        id: crypto.randomUUID(), sessionId: id, dataUrl, createdAt: Date.now()
      });
    }
  },

  markSynced: async (id: string) => {
    await db.inspection_sessions.update(id, { status: 'synced', updatedAt: Date.now() });
  },

  delete: async (id: string) => {
    await db.inspection_sessions.delete(id);
    await db.inspection_photos.where('sessionId').equals(id).delete();
  }
};

// ==========================================
// NEW: REPOSITORY - CLIENT TEMPLATES
// ==========================================

export const ClientRepository = {
  getAll: async (): Promise<ClientTemplate[]> => {
    return db.client_templates.orderBy('name').toArray();
  },

  search: async (query: string): Promise<ClientTemplate[]> => {
    const q = query.toLowerCase().trim();
    if (!q) return ClientRepository.getAll();
    const all = await db.client_templates.orderBy('name').toArray();
    return all.filter(c => c.name.toLowerCase().includes(q));
  },

  getById: async (id: string): Promise<ClientTemplate | undefined> => {
    return db.client_templates.get(id);
  },

  create: async (data: Omit<ClientTemplate, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    await db.client_templates.add({ ...data, id, createdAt: Date.now() });
    return id;
  },

  update: async (id: string, data: Partial<ClientTemplate>) => {
    await db.client_templates.update(id, { ...data, updatedAt: Date.now() });
  },

  delete: async (id: string) => {
    // Cascade delete: hapus semua unit template milik klien ini
    const units = await db.unit_templates.where('clientId').equals(id).toArray();
    await Promise.all(units.map(u => db.unit_templates.delete(u.id)));
    await db.client_templates.delete(id);
  },

  getWithUnits: async (id: string) => {
    const client = await db.client_templates.get(id);
    if (!client) return null;
    const units = await db.unit_templates.where('clientId').equals(id).toArray();
    return { ...client, units };
  }
};

// ==========================================
// NEW: REPOSITORY - UNIT TEMPLATES
// ==========================================

export const UnitRepository = {
  getByClient: async (clientId: string): Promise<UnitTemplate[]> => {
    return db.unit_templates
      .where('clientId').equals(clientId)
      .toArray()
      .then(units => units.sort((a, b) => a.label.localeCompare(b.label)));
  },

  searchByClient: async (clientId: string, query: string): Promise<UnitTemplate[]> => {
    const units = await UnitRepository.getByClient(clientId);
    const q = query.toLowerCase().trim();
    if (!q) return units;
    return units.filter(u =>
      u.label.toLowerCase().includes(q) ||
      u.objectType.toLowerCase().includes(q) ||
      (u.unitData?.nomorSeri || '').toLowerCase().includes(q)
    );
  },

  getById: async (id: string): Promise<UnitTemplate | undefined> => {
    return db.unit_templates.get(id);
  },

  create: async (data: Omit<UnitTemplate, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    await db.unit_templates.add({ ...data, id, createdAt: Date.now() });
    return id;
  },

  update: async (id: string, data: Partial<UnitTemplate>) => {
    await db.unit_templates.update(id, { ...data, updatedAt: Date.now() });
  },

  delete: async (id: string) => {
    await db.unit_templates.delete(id);
  }
};

// ==========================================
// NEW: REPOSITORY - USER ROLES
// ==========================================

// Daftar email admin & ahli yang hardcoded sebagai seed awal
// Admin bisa tambah/ubah melalui AdminPanel


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

  upsert: async (email: string, role: 'admin' | 'ahli', name: string, addedBy: string) => {
    const existing = await db.user_roles.get(email);
    if (existing) {
      await db.user_roles.update(email, { role, name });
    } else {
      await db.user_roles.add({ id: email, role, name, addedBy, createdAt: Date.now() });
    }
  },

  delete: async (email: string) => {
    await db.user_roles.delete(email);
  },

  // Seed admin awal kalau tabel masih kosong
  seedIfEmpty: async (ownerEmail: string, ownerName: string) => {
    const count = await db.user_roles.count();
    if (count === 0 && ownerEmail) {
      await db.user_roles.add({
        id: ownerEmail,
        role: 'admin',
        name: ownerName || 'Owner',
        addedBy: 'system',
        createdAt: Date.now()
      });
    }
  }
};