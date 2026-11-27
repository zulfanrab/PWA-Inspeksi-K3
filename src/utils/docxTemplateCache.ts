// src/utils/docxTemplateCache.ts

const CACHE_NAME = 'aksara-docx-templates-v1';
const memoryTemplates = new Map<string, ArrayBuffer>();
const inFlightFetches = new Map<string, Promise<TemplateLoadResult>>();
const invalidationEpochs = new Map<string, number>();
let globalEpoch = 0;
const updateListeners = new Map<string, Set<(result: TemplateLoadResult) => void>>();

export interface TemplateLoadResult {
  buffer: ArrayBuffer | null;
  source: 'memory' | 'cache' | 'network' | 'unavailable';
  modifiedTime?: string | null;
  error?: string;
}

function normalizeCode(typeCode: string): string {
  return String(typeCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function cacheRequestKey(typeCode: string): string {
  return `${window.location.origin}/__aksara_template_cache/Template_${typeCode}.docx`;
}

function mtimeStorageKey(typeCode: string): string {
  return `aksara_tpl_mtime_${typeCode}`;
}

function notifyTemplateUpdated(cleanCode: string, result: TemplateLoadResult): void {
  const listeners = updateListeners.get(cleanCode);
  if (!listeners || listeners.size === 0) return;
  listeners.forEach((cb) => {
    try {
      cb(result);
    } catch {
      // ignore listener errors
    }
  });
}

/** Berlangganan pembaruan otomatis jika background sync menemukan file .docx lebih baru di Drive. */
export function subscribeDocxTemplateUpdate(
  typeCode: string,
  listener: (result: TemplateLoadResult) => void
): () => void {
  const cleanCode = normalizeCode(typeCode);
  if (!cleanCode) return () => {};
  let set = updateListeners.get(cleanCode);
  if (!set) {
    set = new Set();
    updateListeners.set(cleanCode, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      updateListeners.delete(cleanCode);
    }
  };
}

/** Hapus cache template di memori, Cache API, & timestamp lokal setelah Admin upload template baru. */
export async function invalidateDocxTemplateCache(typeCode?: string): Promise<void> {
  if (typeCode) {
    const cleanCode = normalizeCode(typeCode);
    if (!cleanCode) return;
    invalidationEpochs.set(cleanCode, (invalidationEpochs.get(cleanCode) || 0) + 1);
    memoryTemplates.delete(cleanCode);
    inFlightFetches.delete(`${cleanCode}:force`);
    inFlightFetches.delete(`${cleanCode}:normal`);
    try {
      localStorage.removeItem(mtimeStorageKey(cleanCode));
    } catch {
      // ignore
    }
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(cacheRequestKey(cleanCode));
      } catch {
        // ignore
      }
    }
    return;
  }

  globalEpoch++;
  memoryTemplates.clear();
  inFlightFetches.clear();
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      // ignore
    }
  }
}

async function readFromCacheApi(typeCode: string): Promise<{ buffer: ArrayBuffer; modifiedTime: string | null } | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(cacheRequestKey(typeCode));
    if (!match) return null;
    const buffer = await match.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return null;
    const modifiedTime = match.headers.get('X-Template-Modified') || localStorage.getItem(mtimeStorageKey(typeCode));
    return { buffer, modifiedTime };
  } catch {
    return null;
  }
}

async function writeToCacheApi(typeCode: string, buffer: ArrayBuffer, modifiedTime?: string | null): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const headers: Record<string, string> = {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    if (modifiedTime) {
      headers['X-Template-Modified'] = modifiedTime;
      try {
        localStorage.setItem(mtimeStorageKey(typeCode), modifiedTime);
      } catch {
        // ignore storage quota errors
      }
    }
    await cache.put(cacheRequestKey(typeCode), new Response(buffer.slice(0), { headers }));
  } catch {
    // ignore Cache API write errors
  }
}

async function fetchTemplateFromNetwork(
  cleanCode: string,
  apiBase: string
): Promise<TemplateLoadResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      buffer: null,
      source: 'unavailable',
      error: 'Perangkat sedang offline dan template .docx belum tersimpan di cache.',
    };
  }

  const startEpoch = invalidationEpochs.get(cleanCode) || 0;
  const startGlobal = globalEpoch;

  try {
    // Selalu bypass HTTP browser cache dengan cache: 'no-store' + cache-buster timestamp
    const url = `${apiBase}/api/report?action=template&typeCode=${encodeURIComponent(cleanCode)}&download=1&t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      let msg = `Template_${cleanCode}.docx belum tersedia di Drive (HTTP ${res.status}).`;
      try {
        const json = await res.json();
        if (json?.error) msg = json.error;
      } catch {
        // ignore non-json
      }
      return { buffer: null, source: 'unavailable', error: msg };
    }

    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength === 0) {
      return { buffer: null, source: 'unavailable', error: 'File template kosong.' };
    }

    // Jika cache baru saja di-invalidate selama fetch berjalan (mis. baru upload template),
    // abaikan hasil fetch lama agar tidak menimpa template terbaru
    if (
      (invalidationEpochs.get(cleanCode) || 0) !== startEpoch ||
      globalEpoch !== startGlobal
    ) {
      return loadCachedDocxTemplate(cleanCode, apiBase, true);
    }

    const modifiedTime = res.headers.get('X-Template-Modified');
    memoryTemplates.set(cleanCode, buf);
    await writeToCacheApi(cleanCode, buf, modifiedTime);

    const result: TemplateLoadResult = {
      buffer: buf,
      source: 'network',
      modifiedTime,
    };
    notifyTemplateUpdated(cleanCode, result);
    return result;
  } catch (err: any) {
    return {
      buffer: null,
      source: 'unavailable',
      error: err?.message || 'Gagal mengunduh template .docx dari server.',
    };
  }
}

/**
 * Mengambil Master .docx secara responsif (memori / Cache API untuk instant load & offline),
 * sekaligus SELALU memeriksa di background apakah ada revisi Template .docx terbaru di Drive
 * setiap kali preview dibuka saat online, lalu otomatis menyegarkan UI jika ada versi baru.
 */
export async function loadCachedDocxTemplate(
  typeCode: string,
  apiBase: string,
  forceRefresh = false
): Promise<TemplateLoadResult> {
  const cleanCode = normalizeCode(typeCode);
  if (!cleanCode) {
    return { buffer: null, source: 'unavailable', error: 'Kode jenis laporan kosong.' };
  }

  if (!forceRefresh) {
    const mem = memoryTemplates.get(cleanCode);
    if (mem) {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void refreshTemplateIfModified(cleanCode, apiBase);
      }
      return {
        buffer: mem,
        source: 'memory',
        modifiedTime: localStorage.getItem(mtimeStorageKey(cleanCode)),
      };
    }

    const cached = await readFromCacheApi(cleanCode);
    if (cached && cached.buffer.byteLength > 0) {
      memoryTemplates.set(cleanCode, cached.buffer);
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void refreshTemplateIfModified(cleanCode, apiBase);
      }
      return {
        buffer: cached.buffer,
        source: 'cache',
        modifiedTime: cached.modifiedTime,
      };
    }
  }

  const inflightKey = `${cleanCode}:${forceRefresh ? 'force' : 'normal'}`;
  const existing = inFlightFetches.get(inflightKey);
  if (existing) return existing;

  const promise = fetchTemplateFromNetwork(cleanCode, apiBase).finally(() => {
    inFlightFetches.delete(inflightKey);
  });
  inFlightFetches.set(inflightKey, promise);
  return promise;
}

async function refreshTemplateIfModified(cleanCode: string, apiBase: string): Promise<void> {
  try {
    const res = await fetch(`${apiBase}/api/report?action=template&t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = await res.json();
    const targetName = `Template_${cleanCode}.docx`;
    const match = Array.isArray(data?.templates)
      ? data.templates.find((t: any) => String(t?.name || '').toLowerCase() === targetName.toLowerCase())
      : null;
    if (!match?.modifiedTime) return;
    const localMtime = localStorage.getItem(mtimeStorageKey(cleanCode));
    if (!localMtime || localMtime !== match.modifiedTime) {
      await fetchTemplateFromNetwork(cleanCode, apiBase);
    }
  } catch {
    // ignore background check error
  }
}
