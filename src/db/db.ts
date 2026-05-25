// src/db/db.ts
import Dexie, { Table } from 'dexie';

export interface InspectionSession {
  id: string;
  clientName: string;
  objectType: string;
  unitData: any;
  status: 'draft' | 'synced';
  createdAt: number;
  updatedAt?: number;
}

export interface InspectionPhoto {
  id: string;
  sessionId: string;
  dataUrl: string;
  createdAt: number;
}

export class MyDatabase extends Dexie {
  inspection_sessions!: Table<InspectionSession>;
  inspection_photos!: Table<InspectionPhoto>;

  constructor() {
    super('AksaraDB');
    this.version(4).stores({
      inspection_sessions: 'id, clientName, status, createdAt',
      inspection_photos: 'id, sessionId, createdAt'
    });
  }
}

export const db = new MyDatabase();

// REPOSITORY PATTERN (Ini yang bikin App.tsx lu jalan)
export const SessionRepository = {
  getDrafts: async () => {
    const sessions = await db.inspection_sessions.where('status').equals('draft').toArray();
    return Promise.all(sessions.map(async s => ({ ...s, photos: await db.inspection_photos.where('sessionId').equals(s.id).toArray() })));
  },
  
  getHistory: async () => {
    const sessions = await db.inspection_sessions.where('status').equals('synced').toArray();
    return Promise.all(sessions.map(async s => ({ ...s, photos: await db.inspection_photos.where('sessionId').equals(s.id).toArray() })));
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
      await db.inspection_photos.add({ id: crypto.randomUUID(), sessionId: id, dataUrl, createdAt: Date.now() });
    }
  },

  update: async (id: string, data: Partial<InspectionSession>, newPhotos: string[], deletedPhotoIds: string[]) => {
    await db.inspection_sessions.update(id, { ...data, updatedAt: Date.now() });
    for (const photoId of deletedPhotoIds) {
      await db.inspection_photos.delete(photoId);
    }
    for (const dataUrl of newPhotos) {
      await db.inspection_photos.add({ id: crypto.randomUUID(), sessionId: id, dataUrl, createdAt: Date.now() });
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