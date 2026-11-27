// src/utils/docxTemplateCache.ts

const CACHE_NAME = 'aksara-docx-templates-v1';
const memoryTemplates = new Map<string, ArrayBuffer>();
const inFlightFetches = new Map<string, Promise<TemplateLoadResult>>();
const checkedModifiedThisSession = new Set<string>();

export interface TemplateLoadResult {
  buffer: ArrayBuffer | null;
  source: 'memory' | 'cache' | 'network' | 'unavailable';
  error?: string;
}

function cacheRequestKey(typeCode: string): string {
  return `${window.location.origin}/__aksara_template_cache/Template_${typeCode}.docx`;
}

function mtimeStorageKey(typeCode: string): string {
  return `aksara_tpl_mtime_${typeCode}`;
}

async function readFromCacheApi(typeCode: string): Promise<ArrayBuffer | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(cacheRequestKey(typeCode));
    if (!match) return null;
    return await match.arrayBuffer();
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

  try {
    const url = `${apiBase}/api/report?action=template&typeCode=${encodeURIComponent(cleanCode)}&download=1`;
    const res = await fetch(url);
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

    const modified = res.headers.get('X-Template-Modified');
    memoryTemplates.set(cleanCode, buf);
    await writeToCacheApi(cleanCode, buf, modified);
    return { buffer: buf, source: 'network' };
  } catch (err: any) {
    return {
      buffer: null,
      source: 'unavailable',
      error: err?.message || 'Gagal mengunduh template .docx dari server.',
    };
  }
}

/**
 * Mengambil Master .docx cukup 1x per sesi (memori + Cache API fallback offline).
 * Bila sudah ada di Cache API, langsung mengembalikan salinan lokal dan cek pembaruan di background 1x.
 */
export async function loadCachedDocxTemplate(
  typeCode: string,
  apiBase: string,
  forceRefresh = false
): Promise<TemplateLoadResult> {
  const cleanCode = String(typeCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  if (!cleanCode) {
    return { buffer: null, source: 'unavailable', error: 'Kode jenis laporan kosong.' };
  }

  if (!forceRefresh) {
    const mem = memoryTemplates.get(cleanCode);
    if (mem) {
      return { buffer: mem, source: 'memory' };
    }

    const cached = await readFromCacheApi(cleanCode);
    if (cached && cached.byteLength > 0) {
      memoryTemplates.set(cleanCode, cached);
      // Cek pembaruan template di background maks 1x per sesi saat online
      if (navigator.onLine && !checkedModifiedThisSession.has(cleanCode)) {
        checkedModifiedThisSession.add(cleanCode);
        void refreshTemplateIfModified(cleanCode, apiBase);
      }
      return { buffer: cached, source: 'cache' };
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
    const res = await fetch(`${apiBase}/api/report?action=template`);
    if (!res.ok) return;
    const data = await res.json();
    const targetName = `Template_${cleanCode}.docx`;
    const match = Array.isArray(data?.templates)
      ? data.templates.find((t: any) => String(t?.name || '').toLowerCase() === targetName.toLowerCase())
      : null;
    if (!match?.modifiedTime) return;
    const localMtime = localStorage.getItem(mtimeStorageKey(cleanCode));
    if (localMtime !== match.modifiedTime) {
      await fetchTemplateFromNetwork(cleanCode, apiBase);
    }
  } catch {
    // ignore background check error
  }
}
