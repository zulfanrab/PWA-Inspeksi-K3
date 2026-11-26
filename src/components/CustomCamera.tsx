// src/components/CustomCamera.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { registerBackInterceptor } from '../utils/navigationGuard';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface CustomCameraProps {
  onCapture: (dataUrls: string[]) => void;
  onClose: () => void;
  unitLabel?: string;
  clientName?: string;
}

interface GpsData {
  lat: number;
  lng: number;
  acc: number;
}

interface LocationDetail {
  poiName: string | null;   // nama POI/gedung/tempat spesifik
  areaName: string | null;  // kota / kecamatan / provinsi
}

// ─── REVERSE GEOCODING (OSM Nominatim — detail POI) ──────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<LocationDetail> {
  const result: LocationDetail = { poiName: null, areaName: null };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=id`,
      {
        headers: { 'User-Agent': 'AksaraInspect/1.0 (survey-field-app)' },
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await res.json();

    if (!data?.address) return result;

    const addr = data.address;

    // ── Cari nama POI paling spesifik (urutan prioritas)
    const poiCandidate =
      addr.amenity ||  // restoran, kantor, dll
      addr.office ||  // kantor perusahaan
      addr.building ||  // nama gedung
      addr.shop ||  // toko
      addr.tourism ||  // tempat wisata
      addr.leisure ||  // area rekreasi
      addr.historic ||  // bangunan bersejarah
      addr.industrial ||  // kawasan industri
      addr.man_made ||  // struktur buatan
      data.name ||  // nama langsung dari OSM node
      addr.road ||  // nama jalan sebagai fallback terakhir
      null;

    result.poiName = poiCandidate || null;

    // ── Area: kota / kecamatan / provinsi
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.suburb ||
      addr.municipality ||
      addr.county ||
      addr.district ||
      '';
    const province = addr.state || '';
    const parts = [city, province].filter(Boolean);
    result.areaName = parts.length > 0 ? parts.join(', ') : null;
  } catch {
    // silent — GPS coordinates remain as fallback
  }
  return result;
}

// ─── GPS & GEOCODING CACHE (Persistent across unit captures & sessions) ──────
interface StoredGpsCache {
  gps: GpsData;
  location: LocationDetail;
  timestamp: number;
}

let memoryGpsCache: StoredGpsCache | null = null;

function getStoredGpsCache(): StoredGpsCache | null {
  if (memoryGpsCache) return memoryGpsCache;
  try {
    const raw = sessionStorage.getItem('aksara_gps_cache') || localStorage.getItem('aksara_last_gps_cache');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.gps?.lat && parsed?.gps?.lng) {
        memoryGpsCache = parsed;
        return parsed;
      }
    }
  } catch {
    // silent
  }
  return null;
}

function saveGpsCache(gps: GpsData, location: LocationDetail) {
  const item: StoredGpsCache = { gps, location, timestamp: Date.now() };
  memoryGpsCache = item;
  try {
    sessionStorage.setItem('aksara_gps_cache', JSON.stringify(item));
    localStorage.setItem('aksara_last_gps_cache', JSON.stringify(item));
  } catch {
    // silent
  }
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── WATERMARK RENDERER ───────────────────────────────────────────────────────
// Posisi: pojok kiri bawah. Style: profesional survey lapangan.
// Semua ukuran relatif terhadap H canvas → proporsional portrait & landscape.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

// ─── WATERMARK RENDERER (Option 1: Compact Corner Badge) ──────────────────────
// Posisi: pojok kiri bawah.
// Sangat ringkas, tidak menutupi objek inspeksi (~5-8% luas foto vs sebelumnya ~30%).

let cachedLogoImg: HTMLImageElement | null = null;
let logoLoadAttempted = false;

function loadWatermarkLogo(): Promise<HTMLImageElement | null> {
  if (cachedLogoImg) return Promise.resolve(cachedLogoImg);
  if (logoLoadAttempted && !cachedLogoImg) return Promise.resolve(null);

  logoLoadAttempted = true;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedLogoImg = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = '/icons/icon-512.png';
    setTimeout(() => resolve(null), 500);
  });
}

async function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gps: GpsData | null,
  loc: LocationDetail
) {
  const isPortrait = H > W;
  const refDim = isPortrait ? W : H;
  // Baseline unit proporsional (~2% dari dimensi referensi)
  // Menghasilkan ukuran font yang jelas dibaca di layar HP/laporan tanpa menutupi objek
  const unit = Math.max(1, refDim / 50);

  // Typography & Layout tokens
  const F_HEADER = Math.round(unit * 1.05);
  const F_TEXT = Math.round(unit * 0.92);
  const LOGO_SZ = Math.round(unit * 1.4);
  const PAD_X = Math.round(unit * 1.25);
  const PAD_Y = Math.round(unit * 1.0);
  const MARGIN = Math.round(unit * 1.2);
  const STRIPE_W = Math.max(3, Math.round(unit * 0.28));
  const RADIUS = Math.round(unit * 0.75);
  const ICON_COL_W = Math.round(unit * 1.35);
  const LINE_H = Math.round(F_TEXT * 1.4);
  const ROW_GAP = Math.round(unit * 0.32);
  const GAP_HEADER = Math.round(unit * 0.55);

  const FONT = (size: number, bold = false) => {
    ctx.font = `${bold ? '700 ' : '500 '}${size}px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif`;
  };

  // ── 1. Siapkan Data Ringkas & Padat
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  interface CompactRow {
    icon: string;
    text: string;
    color: string;
  }

  const rawRows: CompactRow[] = [
    {
      icon: '📅',
      text: `${dateStr} • ${timeStr}`,
      color: '#F8FAFC',
    },
  ];

  if (gps) {
    const acc = Math.round(gps.acc);
    rawRows.push({
      icon: '📍',
      text: `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} (±${acc}m)`,
      color: '#34D399',
    });
  } else {
    rawRows.push({
      icon: '📍',
      text: 'GPS tidak tersedia',
      color: '#F59E0B',
    });
  }

  // Lokasi POI & Wilayah (jika ada)
  if (loc.poiName || loc.areaName) {
    const parts = [loc.poiName, loc.areaName].filter(Boolean);
    rawRows.push({
      icon: '🏢',
      text: parts.join(' · '),
      color: '#93C5FD',
    });
  }

  // ── 2. Hitung Ukuran Box secara Dinamis & Adaptif
  const maxBoxW = Math.round(isPortrait ? W * 0.58 : W * 0.40);
  const minBoxW = Math.round(isPortrait ? W * 0.38 : W * 0.25);
  const maxTextW = maxBoxW - STRIPE_W - (PAD_X * 2) - ICON_COL_W;

  // Wrap text baris jika melebihi batas (khususnya lokasi panjang)
  interface ProcessedRow {
    icon: string;
    lines: string[];
    color: string;
  }
  const rows: ProcessedRow[] = [];

  for (const r of rawRows) {
    FONT(F_TEXT, false);
    const lines = wrapText(ctx, r.text, maxTextW);
    // Batasi baris lokasi maksimal 2 baris agar badge tetap compact
    rows.push({
      icon: r.icon,
      lines: lines.slice(0, 2),
      color: r.color,
    });
  }

  // Ukur lebar maksimum yang dibutuhkan
  FONT(F_HEADER, true);
  const aksaraW = ctx.measureText('AKSARA').width;
  const inspectW = ctx.measureText(' INSPECT').width;
  const headerTextW = LOGO_SZ + Math.round(unit * 0.6) + aksaraW + inspectW;

  let maxContentW = headerTextW;
  FONT(F_TEXT, false);
  for (const r of rows) {
    for (const line of r.lines) {
      const lineW = ICON_COL_W + ctx.measureText(line).width;
      if (lineW > maxContentW) maxContentW = lineW;
    }
  }

  const calculatedW = maxContentW + STRIPE_W + (PAD_X * 2) + Math.round(unit * 0.5);
  const boxW = Math.max(minBoxW, Math.min(maxBoxW, Math.round(calculatedW)));

  let rowsHeight = 0;
  for (let i = 0; i < rows.length; i++) {
    rowsHeight += rows[i].lines.length * LINE_H;
    if (i < rows.length - 1) rowsHeight += ROW_GAP;
  }

  const boxH = Math.round((PAD_Y * 2) + LOGO_SZ + GAP_HEADER + rowsHeight);

  // Posisi: pojok kiri bawah dengan margin
  const bx = MARGIN;
  const by = H - MARGIN - boxH;

  // ── 3. Render Background Pill
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.round(unit * 1.2);
  ctx.shadowOffsetY = Math.round(unit * 0.4);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.74)'; // Sleek modern slate-900 glass
  rrect(ctx, bx, by, boxW, boxH, RADIUS);
  ctx.fill();

  // Halus border glassmorphism
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = Math.max(1, Math.round(unit * 0.08));
  rrect(ctx, bx, by, boxW, boxH, RADIUS);
  ctx.stroke();

  // Stripe hijau emerald di sisi kiri
  ctx.fillStyle = '#10B981';
  rrect(ctx, bx, by, STRIPE_W, boxH, { tl: RADIUS, bl: RADIUS, tr: 0, br: 0 });
  ctx.fill();
  ctx.restore();

  // ── 4. Render Konten
  const cx = bx + STRIPE_W + PAD_X;
  let cy = by + PAD_Y;

  // Render Logo
  const logoImg = await loadWatermarkLogo();
  if (logoImg) {
    ctx.drawImage(logoImg, cx, cy, LOGO_SZ, LOGO_SZ);
  } else {
    // Fallback badge huruf A
    ctx.fillStyle = '#10B981';
    rrect(ctx, cx, cy, LOGO_SZ, LOGO_SZ, Math.round(unit * 0.3));
    ctx.fill();
    FONT(Math.round(LOGO_SZ * 0.62), true);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('A', cx + Math.round(LOGO_SZ * 0.24), cy + Math.round(LOGO_SZ * 0.74));
  }

  // Header Brand: AKSARA INSPECT
  const tx = cx + LOGO_SZ + Math.round(unit * 0.6);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = Math.round(unit * 0.25);
  ctx.shadowOffsetY = 1;

  FONT(F_HEADER, true);
  ctx.fillStyle = '#10B981';
  ctx.fillText('AKSARA', tx, cy + Math.round(F_HEADER * 0.9));
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(' INSPECT', tx + aksaraW, cy + Math.round(F_HEADER * 0.9));

  cy += LOGO_SZ + GAP_HEADER;

  // Render Baris Data
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowY = cy;

    // Emoji Icon
    FONT(Math.round(F_TEXT * 1.05));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillText(row.icon, cx, rowY + Math.round(F_TEXT * 0.9));

    // Value Text
    FONT(F_TEXT, false);
    ctx.fillStyle = row.color;
    for (let li = 0; li < row.lines.length; li++) {
      ctx.fillText(row.lines[li], cx + ICON_COL_W, rowY + Math.round(F_TEXT * 0.9) + (li * LINE_H));
    }

    cy += (row.lines.length * LINE_H) + (i < rows.length - 1 ? ROW_GAP : 0);
  }
  ctx.restore();
}

// ── Helper roundRect cross-browser
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | { tl: number; tr: number; bl: number; br: number }
) {
  const { tl, tr, br, bl } = typeof r === 'number'
    ? { tl: r, tr: r, br: r, bl: r }
    : r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

// ─── PHOTO GALLERY MODAL ──────────────────────────────────────────────────────
interface GalleryProps {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
  onDeleteOne: (index: number) => void;
  onDeleteAll: () => void;
}

function PhotoGallery({ photos, initialIndex, onClose, onDeleteOne, onDeleteAll }: GalleryProps) {
  const [idx, setIdx] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const lastOffset = useRef({ x: 0, y: 0 });

  // Pinch zoom refs
  const lastDist = useRef<number | null>(null);
  const lastScale = useRef(1);

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const goTo = (newIdx: number) => {
    resetView();
    setIdx(Math.max(0, Math.min(photos.length - 1, newIdx)));
  };

  // Touch gestures
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastOffset.current = offset;
      setDragging(true);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
      lastScale.current = scale;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(1, Math.min(5, lastScale.current * (dist / lastDist.current)));
      setScale(newScale);
    } else if (e.touches.length === 1 && dragStart.current) {
      if (scale > 1) {
        setOffset({
          x: lastOffset.current.x + (e.touches[0].clientX - dragStart.current.x),
          y: lastOffset.current.y + (e.touches[0].clientY - dragStart.current.y),
        });
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    setDragging(false);
    lastDist.current = null;

    // Logic Swipe Kiri/Kanan buat ganti foto (hanya jalan kalau foto lagi gak di-zoom)
    if (scale <= 1 && dragStart.current && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - dragStart.current.x;
      if (Math.abs(dx) > 50) {
        dx < 0 ? goTo(idx + 1) : goTo(idx - 1);
      }
    }

    // Jangan reset memori jari kalau masih ada jari yang nempel di layar
    if (e.touches.length === 0) {
      dragStart.current = null;
    }
  };

  // Double tap to zoom
  const lastTap = useRef(0);
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      scale > 1 ? resetView() : setScale(2.5);
    }
    lastTap.current = now;
  };

  const handleShare = async () => {
    try {
      const blob = await (await fetch(photos[idx])).blob();
      const file = new File([blob], `aksara-inspect-${idx + 1}.jpg`, { type: 'image/jpeg' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Aksara Inspect Photo' });
      } else {
        const a = document.createElement('a');
        a.href = photos[idx];
        a.download = `aksara-inspect-${idx + 1}.jpg`;
        a.click();
      }
    } catch { /* user cancelled */ }
  };

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(idx + 1);
      if (e.key === 'ArrowLeft') goTo(idx - 1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, photos.length]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10010,
      background: 'rgba(0,0,0,0.97)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar galeri */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', paddingTop: 'max(14px, calc(12px + env(safe-area-inset-top, 0px)))',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        <button onClick={onClose} style={btnStyle('#475569')}>✕ Tutup</button>
        <span style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 600 }}>
          {idx + 1} / {photos.length}
        </span>
        <button onClick={handleShare} style={btnStyle('#1D4ED8', '#93C5FD')}>⬆ Bagikan</button>
      </div>

      {/* Area foto */}
      <div
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none' /* 🔥 INI OBAT MUJARABNYA: MATIIN SCROLL BAWAAN BROWSER 🔥 */
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onTap}
      >
        <img
          src={photos[idx]}
          alt={`Foto ${idx + 1}`}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'contain',
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transformOrigin: 'center',
            transition: dragging ? 'none' : 'transform 0.2s ease',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          draggable={false}
        />

        {/* Panah navigasi (desktop) */}
        {idx > 0 && (
          <button onClick={(e) => { e.stopPropagation(); goTo(idx - 1); }}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', ...navBtnStyle }}>
            ‹
          </button>
        )}
        {idx < photos.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); goTo(idx + 1); }}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', ...navBtnStyle }}>
            ›
          </button>
        )}

        {/* Hint zoom */}
        {scale > 1 && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.55)', color: '#94A3B8',
            borderRadius: 20, padding: '3px 12px', fontSize: 11, pointerEvents: 'none',
          }}>
            {Math.round(scale * 100)}% · Ketuk dua kali untuk reset
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto',
          background: 'rgba(0,0,0,0.7)', flexShrink: 0, scrollbarWidth: 'none',
        }}>
          {photos.map((p, i) => (
            <img
              key={i} src={p} onClick={() => goTo(i)}
              style={{
                width: 52, height: 52, objectFit: 'cover', borderRadius: 6,
                border: i === idx ? '2px solid #10B981' : '2px solid transparent',
                cursor: 'pointer', flexShrink: 0, opacity: i === idx ? 1 : 0.55,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
            />
          ))}
        </div>
      )}

      {/* Bottom bar aksi */}
      <div style={{
        padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.85)', borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', gap: 10, justifyContent: 'center', flexShrink: 0,
      }}>
        {/* Tutup Galeri */}
        <button
          onClick={onClose}
          style={btnStyle('rgba(255,255,255,0.15)', '#fff', '1px solid rgba(255,255,255,0.25)')}
        >
          ✕ Tutup
        </button>

        {/* Hapus foto ini */}
        <button
          onClick={() => {
            onDeleteOne(idx);
            if (photos.length === 1) { onClose(); return; }
            goTo(Math.max(0, idx - 1));
          }}
          style={btnStyle('rgba(239,68,68,0.15)', '#F87171', '1px solid rgba(239,68,68,0.35)')}
        >
          🗑 Hapus Foto Ini
        </button>

        {/* Hapus semua */}
        {!confirmAll ? (
          <button onClick={() => setConfirmAll(true)}
            style={btnStyle('rgba(239,68,68,0.08)', '#F87171', '1px solid rgba(239,68,68,0.2)')}>
            🗑 Hapus Semua
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#FCA5A5', fontSize: 12 }}>Yakin hapus semua?</span>
            <button onClick={() => { onDeleteAll(); onClose(); }} style={btnStyle('#DC2626', '#fff')}>Ya, Hapus</button>
            <button onClick={() => setConfirmAll(false)} style={btnStyle('rgba(255,255,255,0.1)', '#94A3B8')}>Batal</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Style helpers
const btnStyle = (bg: string, color = '#E2E8F0', border = 'none'): React.CSSProperties => ({
  background: bg, color, border, borderRadius: 10,
  padding: '8px 14px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
});

const navBtnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.5)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '50%', width: 44, height: 44,
  fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', backdropFilter: 'blur(4px)',
};

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────
export function CustomCamera({ onCapture, onClose, unitLabel, clientName }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Watermark HARUS SELALU OFF secara default (opsional, hanya aktif jika dicentang manual oleh user)
  const [watermark, setWatermark] = useState(false);
  const [gps, setGps] = useState<GpsData | null>(() => getStoredGpsCache()?.gps ?? null);
  const [location, setLocation] = useState<LocationDetail>(() => getStoredGpsCache()?.location ?? { poiName: null, areaName: null });
  const [locationLoading, setLocationLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [photos, setPhotos] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('aksara_camera_backup_photos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [gallery, setGallery] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // States untuk Flash/Torch, Lensa 0.5x, & Smooth Tap Zoom
  const [zoom, setZoom] = useState(1);
  const [cssZoom, setCssZoom] = useState(1);
  const [hwZoomEnabled, setHwZoomEnabled] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [ultraWideMode, setUltraWideMode] = useState<'none' | 'hardware_zoom' | 'multi_lens'>('none');
  const [ultraWideValue, setUltraWideValue] = useState(0.5);
  const [ultraWideLabel, setUltraWideLabel] = useState('0.5x');
  const [activeLens, setActiveLens] = useState<'main' | 'ultrawide'>('main');
  const [switchingLens, setSwitchingLens] = useState(false);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Refs anti-race condition untuk smooth zoom & lens switching
  const mountedRef = useRef(true);
  const zoomRef = useRef(1);
  const currentAnimatedZoomRef = useRef(1);
  const cssZoomRef = useRef(1);
  const minZoomRef = useRef(1);
  const maxZoomRef = useRef(1);
  const zoomSupportedRef = useRef(false);
  const hardwareZoomFailedRef = useRef(false);
  const applyingZoomRef = useRef(false);
  const zoomAnimIdRef = useRef(0);
  const zoomAnimStateRef = useRef<{
    startZoom: number;
    targetZoom: number;
    startTime: number;
    durationMs: number;
  } | null>(null);
  const isSwitchingLensRef = useRef(false);
  const mainRearDeviceIdRef = useRef<string | null>(null);
  const ultraWideCandidatesRef = useRef<string[]>([]);
  const verifiedUltraWideIdRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // States untuk Pinch Zoom & Tap to Focus
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; show: boolean } | null>(null);

  const showCameraNotice = useCallback((msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setCameraNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setCameraNotice(null);
    }, 2800);
  }, []);

  const updateCssZoomState = useCallback((nextCss: number) => {
    const safeCss = Number(Math.max(1, nextCss).toFixed(3));
    if (Math.abs(cssZoomRef.current - safeCss) < 0.002) return;
    cssZoomRef.current = safeCss;
    setCssZoom(safeCss);
  }, []);

  const runHardwareZoomLoop = useCallback(async (videoTrack: MediaStreamTrack) => {
    if (applyingZoomRef.current) return;
    applyingZoomRef.current = true;
    try {
      while (zoomAnimStateRef.current && mountedRef.current && videoTrack.readyState === 'live') {
        const anim = zoomAnimStateRef.current;
        const loopAnimId = zoomAnimIdRef.current;
        const elapsed = performance.now() - anim.startTime;
        const progress = anim.durationMs <= 0 ? 1 : Math.min(1, elapsed / anim.durationMs);
        // easeOutCubic agar transisi tap zoom cepat di awal lalu mulus melambat ke titik target
        const eased = 1 - Math.pow(1 - progress, 3);
        const stepZoom = anim.startZoom + (anim.targetZoom - anim.startZoom) * eased;
        currentAnimatedZoomRef.current = stepZoom;

        const hwMax = maxZoomRef.current;
        const hwMin = minZoomRef.current;
        const hwTarget = Math.min(hwMax, Math.max(hwMin, Number(stepZoom.toFixed(2))));
        const cssTarget = stepZoom > hwMax ? stepZoom / hwMax : 1;

        updateCssZoomState(cssTarget);

        try {
          await videoTrack.applyConstraints({
            advanced: [{ zoom: hwTarget } as any],
          });
        } catch {
          // Driver gagal menerapkan zoom hardware -> handoff mulus ke digital CSS zoom
          hardwareZoomFailedRef.current = true;
          if (mountedRef.current) {
            setHwZoomEnabled(false);
            updateCssZoomState(anim.targetZoom <= 1 ? 1 : anim.targetZoom);
          }
          zoomAnimStateRef.current = null;
          break;
        }

        if (progress >= 1 && zoomAnimIdRef.current === loopAnimId) {
          currentAnimatedZoomRef.current = anim.targetZoom;
          updateCssZoomState(anim.targetZoom > hwMax ? anim.targetZoom / hwMax : 1);
          zoomAnimStateRef.current = null;
          break;
        }

        // Beri jeda maksimal 1 frame render agar pipeline browser sinkron & tetap responsif
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    } finally {
      applyingZoomRef.current = false;
      // Jika ada animasi baru yang masuk tepat saat loop berakhir, lanjutkan segera
      if (zoomAnimStateRef.current && mountedRef.current && videoTrack.readyState === 'live' && !hardwareZoomFailedRef.current) {
        void runHardwareZoomLoop(videoTrack);
      }
    }
  }, [updateCssZoomState]);

  const applyZoomSafely = useCallback((rawZoom: number, immediate = false) => {
    const minAllowed = activeLens === 'main' && ultraWideMode === 'hardware_zoom' ? minZoomRef.current : 1;
    const clamped = Math.max(minAllowed, Math.min(5, Number(rawZoom.toFixed(2))));
    zoomRef.current = clamped;
    setZoom(clamped);

    if (activeLens === 'ultrawide' && ultraWideMode === 'multi_lens') {
      currentAnimatedZoomRef.current = 0.5;
      zoomAnimStateRef.current = null;
      updateCssZoomState(1);
      return;
    }

    const videoTrack = streamRef.current?.getVideoTracks()[0];
    const canUseHw = Boolean(videoTrack && videoTrack.readyState === 'live' && zoomSupportedRef.current && !hardwareZoomFailedRef.current);

    if (!canUseHw || !videoTrack) {
      zoomAnimStateRef.current = null;
      currentAnimatedZoomRef.current = clamped;
      updateCssZoomState(clamped <= 1 ? 1 : clamped);
      return;
    }

    const startFrom = currentAnimatedZoomRef.current;
    const durationMs = immediate || Math.abs(clamped - startFrom) < 0.05 ? 0 : 220;
    zoomAnimIdRef.current += 1;
    zoomAnimStateRef.current = {
      startZoom: startFrom,
      targetZoom: clamped,
      startTime: performance.now(),
      durationMs,
    };

    void runHardwareZoomLoop(videoTrack);
  }, [activeLens, ultraWideMode, runHardwareZoomLoop, updateCssZoomState]);

  const attachStreamToVideo = useCallback(async (stream: MediaStream, initialZoom = 1) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      const p = videoRef.current.play();
      p?.catch(e => { if (e.name !== 'AbortError') console.error(e); });
    }

    const videoTrack = stream.getVideoTracks()[0];
    setTorch(false);
    zoomAnimIdRef.current += 1;
    zoomAnimStateRef.current = null;
    hardwareZoomFailedRef.current = false;
    updateCssZoomState(1);

    if (!videoTrack) {
      setTorchSupported(false);
      setHwZoomEnabled(false);
      zoomSupportedRef.current = false;
      minZoomRef.current = 1;
      maxZoomRef.current = 1;
      currentAnimatedZoomRef.current = 1;
      return null;
    }

    const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
    setTorchSupported('torch' in capabilities);

    if ('zoom' in capabilities) {
      const zoomCap = (capabilities as any).zoom;
      const zMin = typeof zoomCap?.min === 'number' && zoomCap.min > 0 ? zoomCap.min : 1;
      const zMax = typeof zoomCap?.max === 'number' && zoomCap.max >= zMin ? zoomCap.max : 1;
      const hasHwZoom = zMax > zMin || zMin < 0.96;
      zoomSupportedRef.current = hasHwZoom;
      setHwZoomEnabled(hasHwZoom);
      minZoomRef.current = zMin;
      maxZoomRef.current = zMax;

      const clampedInit = Math.max(zMin, Math.min(5, initialZoom));
      zoomRef.current = clampedInit;
      currentAnimatedZoomRef.current = clampedInit;
      setZoom(clampedInit);

      if (hasHwZoom) {
        const safeHw = Math.min(zMax, Math.max(zMin, clampedInit));
        try {
          await videoTrack.applyConstraints({
            advanced: [{ zoom: safeHw } as any],
          });
          updateCssZoomState(clampedInit > zMax ? clampedInit / zMax : 1);
        } catch {
          hardwareZoomFailedRef.current = true;
          setHwZoomEnabled(false);
          updateCssZoomState(clampedInit <= 1 ? 1 : clampedInit);
        }
      }
    } else {
      zoomSupportedRef.current = false;
      setHwZoomEnabled(false);
      minZoomRef.current = 1;
      maxZoomRef.current = 1;
      const clampedInit = Math.max(1, Math.min(5, initialZoom));
      zoomRef.current = clampedInit;
      currentAnimatedZoomRef.current = clampedInit;
      setZoom(clampedInit);
      updateCssZoomState(clampedInit <= 1 ? 1 : clampedInit);
    }

    return capabilities;
  }, [updateCssZoomState]);

  const discoverRearUltraWide = useCallback(async (track: MediaStreamTrack, caps: any) => {
    const zMin = caps?.zoom?.min;
    if (typeof zMin === 'number' && zMin > 0 && zMin < 0.96) {
      const exactMin = Number(zMin.toFixed(2));
      const displayLabel = exactMin <= 0.65 ? '0.5x' : `${Number(exactMin.toFixed(1))}x`;
      setUltraWideValue(exactMin);
      setUltraWideLabel(displayLabel);
      setUltraWideMode('hardware_zoom');
      ultraWideCandidatesRef.current = [];
      return;
    }

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setUltraWideMode('none');
        return;
      }
      const settings = track.getSettings ? track.getSettings() : {};
      if (settings.deviceId) {
        mainRearDeviceIdRef.current = settings.deviceId;
      }

      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoInputs = devices.filter(d => d.kind === 'videoinput' && d.deviceId);

      // Beberapa browser/WebView terlambat mengisi label kamera tepat setelah izin diberikan
      if (videoInputs.length > 0 && videoInputs.every(d => !d.label)) {
        await new Promise(resolve => setTimeout(resolve, 180));
        if (!mountedRef.current) return;
        devices = await navigator.mediaDevices.enumerateDevices();
        videoInputs = devices.filter(d => d.kind === 'videoinput' && d.deviceId);
      }

      const isFrontOrVirtual = (label: string) =>
        /\b(front|user|selfie|depan|truedepth|continuity|obs|virtual)\b|facing\s+front|desk\s*view|tampilan\s*meja/i.test(label);
      const isExcludedAuxiliary = (label: string) =>
        /\b(macro|makro|depth|kedalaman|bokeh|ir|infrared|mono|monochrome|tof|tele|telephoto|telefoto|periscope|portrait|potret|lidar)\b/i.test(label);
      const isExplicitUltraWide = (label: string) =>
        /(ultra[\s-]*(wide|lebar)|lebar\s+ultra|ultrawide|0\.5|0\.6|\buw\b)/i.test(label);
      const isVirtualMultiRear = (label: string) =>
        /\b(dual|triple|quad|ganda|tiga)\b/i.test(label);

      const secondaryRear = videoInputs.filter(d => {
        if (d.deviceId === settings.deviceId) return false;
        const label = d.label || '';
        if (isFrontOrVirtual(label)) return false;
        if (isExcludedAuxiliary(label)) return false;
        return true;
      });

      secondaryRear.sort((a, b) => {
        const aLabel = a.label || '';
        const bLabel = b.label || '';
        const aScore = isExplicitUltraWide(aLabel) ? 0 : isVirtualMultiRear(aLabel) ? 1 : 2;
        const bScore = isExplicitUltraWide(bLabel) ? 0 : isVirtualMultiRear(bLabel) ? 1 : 2;
        return aScore - bScore;
      });

      if (secondaryRear.length > 0) {
        ultraWideCandidatesRef.current = secondaryRear.map(d => d.deviceId);
        setUltraWideValue(0.5);
        setUltraWideLabel('0.5x');
        setUltraWideMode('multi_lens');
      } else {
        ultraWideCandidatesRef.current = [];
        setUltraWideMode('none');
      }
    } catch {
      ultraWideCandidatesRef.current = [];
      setUltraWideMode('none');
    }
  }, []);

  // ─── KAMERA ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const initStream = async () => {
      try {
        setLoading(true); setError(null);
        setActiveLens('main');
        setUltraWideMode('none');
        verifiedUltraWideIdRef.current = null;
        mainRearDeviceIdRef.current = null;

        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        const caps = await attachStreamToVideo(stream, 1);
        const videoTrack = stream.getVideoTracks()[0];
        if (facing === 'environment' && videoTrack) {
          await discoverRearUltraWide(videoTrack, caps);
        }
        if (!cancelled) setLoading(false);
      } catch (e: any) {
        if (!cancelled) { setError(e.message || 'Gagal mengakses kamera'); setLoading(false); }
      }
    };
    void initStream();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      zoomAnimIdRef.current += 1;
      zoomAnimStateRef.current = null;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facing, retryKey, attachStreamToVideo, discoverRearUltraWide]);

  const openStreamWithReleaseRetry = useCallback(async (constraints: MediaTrackConstraints): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    } catch {
      await new Promise(resolve => setTimeout(resolve, 140));
      return await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    }
  }, []);

  const handleSelectZoomPreset = useCallback(async (preset: { value: number; isUltraWide?: boolean }) => {
    if (loading || !!error || isSwitchingLensRef.current) return;

    if (preset.isUltraWide) {
      if (ultraWideMode === 'hardware_zoom') {
        setActiveLens('main');
        applyZoomSafely(preset.value);
        return;
      }
      if (ultraWideMode === 'multi_lens' && activeLens !== 'ultrawide') {
        isSwitchingLensRef.current = true;
        setSwitchingLens(true);
        try {
          const candidates = verifiedUltraWideIdRef.current
            ? [verifiedUltraWideIdRef.current]
            : [...ultraWideCandidatesRef.current];

          streamRef.current?.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          // Beri jeda singkat agar driver kamera Android/iOS selesai melepas sensor sebelumnya
          await new Promise(resolve => setTimeout(resolve, 60));

          let openedStream: MediaStream | null = null;
          let fallbackCandidateStream: MediaStream | null = null;
          let fallbackCandidateId: string | null = null;

          for (const candidateId of candidates) {
            try {
              const s = await openStreamWithReleaseRetry({
                deviceId: { exact: candidateId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              });
              const track = s.getVideoTracks()[0];
              const caps: any = track?.getCapabilities ? track.getCapabilities() : {};
              const maxW = caps?.width?.max;
              const zMin = caps?.zoom?.min;
              const hasMinZoomWide = typeof zMin === 'number' && zMin > 0 && zMin < 0.96;

              if (typeof maxW === 'number' && maxW > 0 && maxW < 1280 && !hasMinZoomWide) {
                s.getTracks().forEach(t => t.stop());
                continue;
              }

              // Hindari lensa macro/depth 2MP (1600px) jika masih ada kandidat FullHD/UltraWide asli (>=1920px)
              if (typeof maxW === 'number' && maxW > 0 && maxW < 1920 && !hasMinZoomWide && candidates.length > 1) {
                if (!fallbackCandidateStream) {
                  fallbackCandidateStream = s;
                  fallbackCandidateId = candidateId;
                } else {
                  s.getTracks().forEach(t => t.stop());
                }
                continue;
              }

              if (fallbackCandidateStream) {
                fallbackCandidateStream.getTracks().forEach(t => t.stop());
                fallbackCandidateStream = null;
              }
              verifiedUltraWideIdRef.current = candidateId;
              openedStream = s;
              break;
            } catch {
              // Coba kandidat lensa berikutnya
            }
          }

          if (!openedStream && fallbackCandidateStream) {
            openedStream = fallbackCandidateStream;
            verifiedUltraWideIdRef.current = fallbackCandidateId;
          }

          if (openedStream && mountedRef.current) {
            setActiveLens('ultrawide');
            const uwTrack = openedStream.getVideoTracks()[0];
            const uwCaps: any = uwTrack?.getCapabilities ? uwTrack.getCapabilities() : {};
            const uwInitZoom =
              typeof uwCaps?.zoom?.min === 'number' && uwCaps.zoom.min > 0 && uwCaps.zoom.min < 0.96
                ? Math.max(0.5, Number(uwCaps.zoom.min.toFixed(2)))
                : 1;
            await attachStreamToVideo(openedStream, uwInitZoom);
            zoomRef.current = 0.5;
            currentAnimatedZoomRef.current = 0.5;
            setZoom(0.5);
          } else if (mountedRef.current) {
            const fallbackConstraints: MediaTrackConstraints = mainRearDeviceIdRef.current
              ? { deviceId: { exact: mainRearDeviceIdRef.current }, width: { ideal: 1920 }, height: { ideal: 1080 } }
              : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };
            const fallbackStream = await openStreamWithReleaseRetry(fallbackConstraints).catch(() => null);
            if (fallbackStream && mountedRef.current) {
              await attachStreamToVideo(fallbackStream, 1);
            }
            setActiveLens('main');
            setUltraWideMode('none');
            showCameraNotice('Lensa 0.5x tidak didukung browser di perangkat ini');
          }
        } finally {
          isSwitchingLensRef.current = false;
          if (mountedRef.current) setSwitchingLens(false);
        }
      }
      return;
    }

    if (activeLens === 'ultrawide' && ultraWideMode === 'multi_lens') {
      isSwitchingLensRef.current = true;
      setSwitchingLens(true);
      try {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        await new Promise(resolve => setTimeout(resolve, 60));

        const mainConstraints: MediaTrackConstraints = mainRearDeviceIdRef.current
          ? { deviceId: { exact: mainRearDeviceIdRef.current }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };
        const mainStream = await openStreamWithReleaseRetry(mainConstraints).catch(() =>
          openStreamWithReleaseRetry({ facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } })
        );
        if (mountedRef.current) {
          setActiveLens('main');
          await attachStreamToVideo(mainStream, preset.value);
        } else {
          mainStream.getTracks().forEach(t => t.stop());
        }
      } catch {
        showCameraNotice('Gagal kembali ke lensa utama');
      } finally {
        isSwitchingLensRef.current = false;
        if (mountedRef.current) setSwitchingLens(false);
      }
      return;
    }

    applyZoomSafely(preset.value);
  }, [loading, error, ultraWideMode, activeLens, applyZoomSafely, attachStreamToVideo, openStreamWithReleaseRetry, showCameraNotice]);

  const handleTorchToggle = async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && torchSupported) {
      try {
        const nextTorch = !torch;
        await videoTrack.applyConstraints({
          advanced: [{ torch: nextTorch } as any]
        });
        setTorch(nextTorch);
      } catch (e) {
        console.error('Gagal menerapkan torch:', e);
      }
    }
  };

  const triggerFocus = async (clientX: number, clientY: number) => {
    const stream = streamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') return;

    const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
    const constraints: any = { advanced: [] };

    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const currentHwZoom = Math.min(maxZoomRef.current, Math.max(minZoomRef.current, currentAnimatedZoomRef.current));
    let applied = false;
    if ('focusMode' in capabilities) {
      const modes = (capabilities as any).focusMode || [];
      if (modes.includes('manual') || modes.includes('single-shot')) {
        const mode = modes.includes('single-shot') ? 'single-shot' : 'manual';
        const focusPoint: any = { focusMode: mode };
        if ('pointsOfInterest' in capabilities) {
          focusPoint.pointsOfInterest = [{ x, y }];
        }
        if (zoomSupportedRef.current && !hardwareZoomFailedRef.current && currentHwZoom !== 1) {
          focusPoint.zoom = currentHwZoom;
        }
        constraints.advanced.push(focusPoint);
        applied = true;
      }
    }

    if (applied) {
      try {
        await videoTrack.applyConstraints(constraints);

        // Kembalikan ke continuous autofocus setelah 3 detik jika disupport (tanpa mereset zoom)
        setTimeout(async () => {
          if (!mountedRef.current || videoTrack.readyState !== 'live') return;
          const currentCapabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
          if (currentCapabilities.focusMode?.includes('continuous')) {
            const restoreConstraint: any = { focusMode: 'continuous' };
            const liveHwZoom = Math.min(maxZoomRef.current, Math.max(minZoomRef.current, currentAnimatedZoomRef.current));
            if (zoomSupportedRef.current && !hardwareZoomFailedRef.current && liveHwZoom !== 1) {
              restoreConstraint.zoom = liveHwZoom;
            }
            await videoTrack.applyConstraints({
              advanced: [restoreConstraint]
            }).catch(() => {});
          }
        }, 3000);
      } catch (e) {
        console.warn("Failed to apply focus constraints:", e);
      }
    }
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Hanya trigger focus jika klik di container utama/video, bukan di tombol overlays
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== 'VIDEO') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setFocusRing({ x, y, show: true });
    void triggerFocus(e.clientX, e.clientY);
  };

  const handleVideoTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && !(activeLens === 'ultrawide' && ultraWideMode === 'multi_lens')) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoomRef.current;
      setIsPinching(true);
    }
  };

  const handleVideoTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinchStartDistRef.current;
      applyZoomSafely(pinchStartZoomRef.current * factor, true);
    }
  };

  const handleVideoTouchEnd = () => {
    pinchStartDistRef.current = null;
    setIsPinching(false);
  };


  // ─── GPS + GEOCODING (Smart Cache & Zero-Nag) ──────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    let isMounted = true;
    const cache = getStoredGpsCache();
    const now = Date.now();
    // Cache valid 15 menit untuk inspeksi di satu area/fasilitas
    const isCacheVeryFresh = cache && (now - cache.timestamp < 15 * 60 * 1000);

    // Jika cache masih sangat baru (< 15 menit), jangan query hardware sensor lagi!
    // Ini menghentikan pop-up izin browser & notifikasi indikator lokasi yang berulang kali muncul
    if (isCacheVeryFresh) {
      if (!gps && cache.gps) setGps(cache.gps);
      if (!location.poiName && cache.location) setLocation(cache.location);
      return;
    }

    const requestPosition = () => {
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          if (!isMounted) return;
          const pos: GpsData = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
          setGps(pos);

          const prev = getStoredGpsCache();
          // Jika lokasi bergerak < 50m, gunakan kembali nama tempat sebelumnya (hemat kuota & anti-rate-limit)
          if (prev?.location?.poiName && calculateDistanceMeters(prev.gps.lat, prev.gps.lng, pos.lat, pos.lng) < 50) {
            setLocation(prev.location);
            saveGpsCache(pos, prev.location);
          } else {
            setLocationLoading(true);
            const locResult = await reverseGeocode(pos.lat, pos.lng);
            if (!isMounted) return;
            setLocation(locResult);
            setLocationLoading(false);
            saveGpsCache(pos, locResult);
          }
        },
        (err) => {
          if (!isMounted) return;
          console.warn('[GPS] Gagal ambil koordinat GPS:', err.message);
          setLocationLoading(false);
        },
        // maximumAge 5 menit: browser memakai posisi ter-cache OS tanpa memicu dialog izin ulang
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
      );
    };

    // Cek permission status tanpa memicu popup jika browser mendukung Permissions API
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then((perm) => {
          if (!isMounted) return;
          if (perm.state === 'denied') {
            console.log('[GPS] Izin lokasi ditolak user sebelumnya. Menggunakan fallback offline.');
            return;
          }
          requestPosition();
        })
        .catch(() => {
          if (isMounted) requestPosition();
        });
    } else {
      requestPosition();
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // ─── CAPTURE ─────────────────────────────────────────────────────────────
  const capture = async () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || capturing) return;
    setCapturing(true);
    try {
      const W = v.videoWidth || 1280, H = v.videoHeight || 720;
      c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      
      // Hitung CSS Zoom yang benar-benar aktif (selalu identik dengan preview)
      const activeCssZoom = cssZoomRef.current;

      if (activeCssZoom > 1) {
        // Crop area tengah sesuai level zoom
        const cropW = W / activeCssZoom;
        const cropH = H / activeCssZoom;
        const startX = (W - cropW) / 2;
        const startY = (H - cropH) / 2;
        ctx.drawImage(v, startX, startY, cropW, cropH, 0, 0, W, H);
      } else {
        ctx.drawImage(v, 0, 0, W, H);
      }
      
      if (watermark) await drawWatermark(ctx, W, H, gps, location);
      const dataUrl = c.toDataURL('image/jpeg', 0.82);
      setPhotos(prev => [...prev, dataUrl]);
    } catch (e) { console.error('Capture error:', e); }
    finally { setTimeout(() => setCapturing(false), 180); }
  };

  // Backup foto ke sessionStorage agar aman dari crash / reload tak terduga
  useEffect(() => {
    try {
      if (photos.length > 0) {
        sessionStorage.setItem('aksara_camera_backup_photos', JSON.stringify(photos));
      } else {
        sessionStorage.removeItem('aksara_camera_backup_photos');
      }
    } catch (e) {
      console.warn('Gagal backup foto ke sessionStorage:', e);
    }
  }, [photos]);

  // Cegah gesture swipe-back native browser (swipe kiri/kanan dari tepi layar)
  useEffect(() => {
    const blockEdgeSwipe = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        const x = e.touches[0].clientX;
        // Area tepi layar (40px kiri atau kanan)
        if (x < 40 || x > window.innerWidth - 40) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('touchstart', blockEdgeSwipe, { passive: false });
    window.addEventListener('touchmove', blockEdgeSwipe, { passive: false });

    return () => {
      window.removeEventListener('touchstart', blockEdgeSwipe);
      window.removeEventListener('touchmove', blockEdgeSwipe);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (gallery.open) {
      setGallery({ open: false, index: 0 });
      return;
    }
    if (photos.length > 0) {
      setShowExitConfirm(true);
      return;
    }
    try {
      sessionStorage.removeItem('aksara_camera_backup_photos');
    } catch {}
    onClose();
  }, [gallery.open, photos.length, onClose]);

  // Intercept tombol back browser / gesture swipe back
  useEffect(() => {
    const unregister = registerBackInterceptor(() => {
      if (showExitConfirm) {
        return true;
      }
      requestClose();
      return true; // Cegah browser melakukan back/undo yang melenyapkan foto
    });
    return unregister;
  }, [requestClose, showExitConfirm]);

  const handleSave = () => {
    if (photos.length > 0) {
      try {
        sessionStorage.removeItem('aksara_camera_backup_photos');
      } catch {}
      onCapture(photos);
      onClose();
    }
  };

  const openGallery = (index = 0) => setGallery({ open: true, index });

  const deleteOne = (i: number) => {
    setPhotos(prev => prev.filter((_, j) => j !== i));
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  const cameraContent = (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 10000,
        display: 'flex', flexDirection: 'column', userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        overscrollBehavior: 'none',
        overscrollBehaviorX: 'none',
        overscrollBehaviorY: 'none',
      }}>
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* ── TOP BAR ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px',
          paddingTop: 'max(12px, calc(10px + env(safe-area-inset-top, 0px)))',
          background: 'rgba(0,0,0,0.86)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)', gap: 8, flexShrink: 0,
          position: 'relative', zIndex: 25,
        }}>
          <button onClick={requestClose} style={{
            background: 'rgba(255,255,255,0.08)', color: '#E2E8F0',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
            padding: '7px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Tutup
          </button>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            padding: '6px 12px',
            background: watermark ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${watermark ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8, transition: 'all 0.2s',
          }}>
            <input type="checkbox" checked={watermark}
              onChange={e => setWatermark(e.target.checked)}
              style={{ accentColor: '#10B981', width: 14, height: 14 }} />
            <span style={{ color: watermark ? '#10B981' : '#94A3B8', fontSize: 12, fontWeight: 600 }}>
              Watermark
            </span>
          </label>

          {torchSupported && (
            <button
              onClick={handleTorchToggle}
              style={{
                background: torch ? 'rgba(250,204,21,0.18)' : 'rgba(255,255,255,0.08)',
                color: torch ? '#FACC15' : '#94A3B8',
                border: torch ? '1px solid rgba(250,204,21,0.35)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.25s ease',
                boxShadow: torch ? '0 0 14px rgba(250,204,21,0.25)' : 'none',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={torch ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              {torch ? 'ON' : 'OFF'}
            </button>
          )}

          <button
            onClick={() => {
              setFacing(f => f === 'environment' ? 'user' : 'environment');
            }}
            style={{
              background: 'rgba(255,255,255,0.08)', color: '#E2E8F0',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
              padding: '7px 12px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Balik
          </button>
        </div>

        {/* ── VIDEO AREA ───────────────────────────────────────────────── */}
        <div 
          onTouchStart={handleVideoTouchStart}
          onTouchMove={handleVideoTouchMove}
          onTouchEnd={handleVideoTouchEnd}
          onClick={handleVideoClick}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a', touchAction: 'none' }}
        >
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: '#0d0d0d',
              color: '#94A3B8', gap: 12,
            }}>
              <div style={{ fontSize: 32 }}>📷</div>
              <div style={{ fontSize: 14 }}>Memuat kamera...</div>
            </div>
          )}

          {error && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: '#0d0d0d',
              color: '#EF4444', padding: 24, gap: 14, textAlign: 'center',
            }}>
              <div style={{ fontSize: 40 }}>⚠️</div>
              <div style={{ fontSize: 14, color: '#FCA5A5', maxWidth: 260 }}>{error}</div>
              <button onClick={() => setRetryKey(k => k + 1)} style={btnStyle('#3B82F6', '#fff')}>
                Coba Lagi
              </button>
            </div>
          )}

          {/* Preview Video dengan Smooth Hardware/CSS Zoom */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => {
              const track = streamRef.current?.getVideoTracks()[0];
              if (track && facing === 'environment' && ultraWideMode === 'none') {
                const caps = track.getCapabilities ? track.getCapabilities() : {};
                void discoverRearUltraWide(track, caps);
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: loading || error ? 'none' : 'block',
              opacity: switchingLens ? 0.55 : 1,
              transform: `scale(${cssZoom})`,
              transition: (hwZoomEnabled || isPinching)
                ? 'opacity 0.16s ease'
                : 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease',
              willChange: 'transform, opacity',
              transformOrigin: 'center center',
            }}
          />

          {/* Target Unit Badge (Jika dibuka via Quick Photo) */}
          {unitLabel && (
            <div style={{
              position: 'absolute', top: photos.length > 0 ? 50 : 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(16, 185, 129, 0.45)', borderRadius: 24,
              padding: '6px 16px', zIndex: 30, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: 7, maxWidth: '85%',
              boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
            }}>
              <span style={{ fontSize: 13 }}>⚡</span>
              <span style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {unitLabel}
              </span>
              {clientName && (
                <span style={{ color: '#34D399', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  • {clientName}
                </span>
              )}
            </div>
          )}

          {/* Flash */}
          {capturing && (
            <div style={{
              position: 'absolute', inset: 0, background: '#fff', opacity: 0.45,
              pointerEvents: 'none', animation: 'camflash 0.18s ease-out forwards',
            }} />
          )}

          {/* Focus Ring Indicator */}
          {focusRing && focusRing.show && (
            <div 
              style={{
                position: 'absolute',
                left: focusRing.x - 30,
                top: focusRing.y - 30,
                width: 60,
                height: 60,
                border: '2px solid #FACC15',
                borderRadius: '8px',
                pointerEvents: 'none',
                zIndex: 100,
                animation: 'focus-bounce 0.3s ease-out, focus-fade 1.2s ease-out forwards',
              }} 
              onAnimationEnd={() => setFocusRing(null)}
            />
          )}

          {/* Badge foto — klik buka galeri */}
          {photos.length > 0 && (
            <button
              onClick={() => openGallery(photos.length - 1)}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: '#10B981', color: '#fff',
                border: 'none', borderRadius: 20,
                padding: '5px 13px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                boxShadow: '0 2px 10px rgba(16,185,129,0.5)',
              }}
            >
              📸 {photos.length}
            </button>
          )}

          {/* Grid rule of thirds */}
          {!loading && !error && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
              `,
              backgroundSize: '33.33% 33.33%',
            }} />
          )}

          {/* Notice singkat (misal jika browser blokir lensa 0.5x) */}
          {cameraNotice && (
            <div style={{
              position: 'absolute', bottom: 68, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.9)', color: '#FDE68A',
              border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 12,
              padding: '6px 12px', fontSize: 11, fontWeight: 600, zIndex: 35,
              whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              {cameraNotice}
            </div>
          )}

          {/* Tap Zoom Presets (0.5x jika didukung, 1x, 2x, 3x, 5x) */}
          {!loading && !error && (() => {
            const presets: { label: string; value: number; isUltraWide?: boolean }[] = [
              ...(facing === 'environment' && ultraWideMode !== 'none'
                ? [{ label: ultraWideLabel, value: ultraWideValue, isUltraWide: true }]
                : []),
              { label: '1x', value: 1 },
              { label: '2x', value: 2 },
              { label: '3x', value: 3 },
              { label: '5x', value: 5 },
            ];
            const isCustomZoom = !presets.some(p =>
              p.isUltraWide
                ? (activeLens === 'ultrawide' || Math.abs(zoom - p.value) < 0.08)
                : (activeLens === 'main' && Math.abs(zoom - p.value) < 0.08)
            );
            return (
              <div
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 999, padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.45)', zIndex: 25, touchAction: 'manipulation',
                }}
              >
                {presets.map((preset) => {
                  const active = preset.isUltraWide
                    ? (activeLens === 'ultrawide' || Math.abs(zoom - preset.value) < 0.08)
                    : (activeLens === 'main' && Math.abs(zoom - preset.value) < 0.08);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={switchingLens}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleSelectZoomPreset(preset);
                      }}
                      style={{
                        minWidth: 38, height: 32, padding: '0 9px', borderRadius: 999,
                        border: 'none', cursor: switchingLens ? 'wait' : 'pointer',
                        background: active ? '#10B981' : 'rgba(255,255,255,0.06)',
                        color: active ? '#FFFFFF' : '#E2E8F0',
                        fontSize: 11.5, fontWeight: active ? 800 : 600,
                        transition: 'all 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
                        transform: active ? 'scale(1.05)' : 'scale(1)',
                        WebkitTapHighlightColor: 'transparent',
                        WebkitTouchCallout: 'none',
                        touchAction: 'manipulation',
                      }}
                    >
                      {active && switchingLens ? '...' : preset.label}
                    </button>
                  );
                })}
                {isCustomZoom && (
                  <span style={{
                    height: 32, padding: '0 9px', borderRadius: 999,
                    background: 'rgba(16,185,129,0.22)', color: '#34D399',
                    fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center',
                  }}>
                    {zoom.toFixed(1)}x
                  </span>
                )}
              </div>
            );
          })()}

        </div>

        {/* ── GPS STATUS BAR ───────────────────────────────────────────── */}
        <div style={{
          padding: '5px 14px', background: 'rgba(0,0,0,0.72)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
          flexShrink: 0, minHeight: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: gps ? '#10B981' : '#F59E0B',
              boxShadow: gps ? '0 0 5px #10B981' : '0 0 5px #F59E0B',
            }} />
            <span style={{ color: gps ? '#34D399' : '#FCD34D', fontSize: 11, fontWeight: 600 }}>
              {gps ? 'GPS' : 'GPS...'}
            </span>
          </div>

          {gps && <span style={{ color: '#475569', fontSize: 10 }}>±{Math.round(gps.acc)}m</span>}

          {locationLoading && <span style={{ color: '#F59E0B', fontSize: 10 }}>· Mencari lokasi...</span>}

          {location.poiName && !locationLoading && (
            <span style={{
              color: '#93C5FD', fontSize: 10, fontWeight: 600,
              maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              · {location.poiName}
            </span>
          )}
          {location.areaName && !locationLoading && (
            <span style={{
              color: '#34D399', fontSize: 10,
              maxWidth: '35%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              · {location.areaName}
            </span>
          )}
          {gps && !location.poiName && !location.areaName && !locationLoading && (
            <span style={{ color: '#475569', fontSize: 10 }}>
              · {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
            </span>
          )}
        </div>

        {/* ── BOTTOM BAR ───────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 20px',
          paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
          background: 'rgba(0,0,0,0.9)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, flexShrink: 0,
        }}>
          {/* Kiri: Simpan atau Batal */}
          <div style={{ width: 120, display: 'flex', justifyContent: 'flex-start' }}>
            {photos.length > 0 ? (
              <button onClick={handleSave} style={{
                background: 'linear-gradient(135deg, #1D4ED8, #3B82F6)',
                border: 'none', borderRadius: 12,
                padding: '11px 16px', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
              }}>
                💾 Simpan ({photos.length})
              </button>
            ) : (
              <button onClick={requestClose} style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none', borderRadius: 12,
                padding: '11px 16px', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                ✕ Batal
              </button>
            )}
          </div>

          {/* Tengah: Capture */}
          <button
            onClick={capture}
            disabled={capturing || !!error || loading || switchingLens}
            aria-label="Ambil foto"
            style={{
              width: 72, height: 72, borderRadius: '50%',
              border: `4px solid ${capturing || switchingLens ? '#374151' : '#fff'}`,
              background: 'transparent',
              cursor: capturing || !!error || loading || switchingLens ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transform: capturing ? 'scale(0.91)' : 'scale(1)',
              transition: 'transform 0.12s, border-color 0.15s',
            }}
          >
            <div style={{
              width: 54, height: 54, borderRadius: '50%',
              background: capturing ? '#374151' : 'linear-gradient(135deg, #10B981, #059669)',
              boxShadow: capturing ? 'none' : '0 0 18px rgba(16,185,129,0.55)',
              transition: 'all 0.15s',
            }} />
          </button>

          {/* Kanan: Buka Galeri */}
          <div style={{ width: 120, display: 'flex', justifyContent: 'flex-start' }}>
            {photos.length > 0 && (
              <button onClick={() => openGallery(photos.length - 1)} style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12, padding: '11px 14px',
                color: '#E2E8F0', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                🖼 Galeri
              </button>
            )}
          </div>
        </div>

        <style>{`
          @keyframes camflash {
            0%   { opacity: 0.45; }
            100% { opacity: 0; }
          }
          @keyframes focus-bounce {
            0% { transform: scale(1.4); opacity: 0.4; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes focus-fade {
            0% { opacity: 1; }
            70% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>

      {/* ── GALLERY MODAL ─────────────────────────────────────────────── */}
      {gallery.open && (
        <PhotoGallery
          photos={photos}
          initialIndex={gallery.index}
          onClose={() => setGallery({ open: false, index: 0 })}
          onDeleteOne={deleteOne}
          onDeleteAll={() => { setPhotos([]); }}
        />
      )}

      {/* ── MODAL KONFIRMASI KELUAR KAMERA ─────────────────────────────── */}
      {showExitConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10020,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '380px',
              background: '#0F172A',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '24px',
              padding: '24px 20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            {/* Warning Icon Badge */}
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1.5px solid rgba(239, 68, 68, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                margin: '0 auto',
              }}
            >
              ⚠️
            </div>

            {/* Title & Description */}
            <div>
              <h3 style={{ color: '#F8FAFC', fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0' }}>
                Foto Belum Disimpan!
              </h3>
              <p style={{ color: '#94A3B8', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                Ada <strong style={{ color: '#10B981', fontSize: '14px' }}>{photos.length} foto survey</strong> yang telah Anda ambil. Jika Anda keluar sekarang tanpa menyimpan, semua foto ini akan <strong style={{ color: '#EF4444' }}>hilang permanen</strong>.
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
              {/* Opsi 1: Simpan & Tutup */}
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  handleSave();
                }}
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                }}
              >
                💾 Simpan ({photos.length} Foto) & Keluar
              </button>

              {/* Opsi 2: Lanjut Memotret */}
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#E2E8F0',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                📸 Lanjut Memotret
              </button>

              {/* Opsi 3: Buang Foto & Keluar */}
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem('aksara_camera_backup_photos');
                  } catch {}
                  setPhotos([]);
                  setShowExitConfirm(false);
                  onClose();
                }}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '14px',
                  background: 'transparent',
                  color: '#EF4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  opacity: 0.85,
                  transition: 'opacity 0.15s',
                }}
              >
                🗑️ Buang Foto & Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return typeof document !== 'undefined'
    ? createPortal(cameraContent, document.body)
    : cameraContent;
}