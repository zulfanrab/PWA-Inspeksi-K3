// src/components/CustomCamera.tsx
import { useState, useRef, useEffect, useCallback } from 'react';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface CustomCameraProps {
  onCapture: (dataUrls: string[]) => void;
  onClose: () => void;
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

// ─── WATERMARK RENDERER ───────────────────────────────────────────────────────
// Posisi: pojok kiri bawah. Style: profesional survey lapangan.
// Semua ukuran relatif terhadap H canvas → proporsional portrait & landscape.
async function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gps: GpsData | null,
  loc: LocationDetail
) {
  // ── Token ukuran — satu sumber kebenaran
  const unit = Math.max(1, H / 90);  // baseline: ~1.1% tinggi foto
  const F_LABEL = unit * 1.0;           // label abu kecil (TANGGAL / JAM / dll)
  const F_VALUE = unit * 1.4;           // nilai utama tiap baris
  const F_TITLE = unit * 1.4;           // judul app — SAMA dengan F_VALUE biar tidak norak
  const F_SUB = unit * 0.95;          // sub-label di bawah judul
  const PAD_X = unit * 2.2;
  const PAD_Y = unit * 1.8;
  const LOGO_SZ = F_TITLE * 2.2;
  const MARGIN = unit * 2.2;
  const STRIPE_W = unit * 0.65;
  const ICON_COL = F_VALUE * 1.55;       // lebar kolom emoji (tetap, tidak campur dengan teks)

  const FONT = (size: number, bold = false) => {
    ctx.font = `${bold ? '600 ' : ''}${size}px 'SF Pro Text','Segoe UI',system-ui,sans-serif`;
  };

  // ── Data
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const coordStr = gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : null;
  const accStr = gps ? `±${Math.round(gps.acc)} m` : null;

  // ── Struktur baris: setiap baris punya label kecil di atas + value di bawah (dengan auto wrap)
  type Row = { icon: string; label: string; value: string; valueColor: string };
  const rawRows: Row[] = [];

  rawRows.push({ icon: '📅', label: 'TANGGAL', value: dateStr, valueColor: '#E2E8F0' });
  rawRows.push({ icon: '🕐', label: 'WAKTU', value: timeStr, valueColor: '#E2E8F0' });

  if (gps && coordStr) {
    rawRows.push({ icon: '📍', label: 'KOORDINAT', value: coordStr, valueColor: '#34D399' });
    rawRows.push({ icon: '  ', label: 'AKURASI', value: accStr!, valueColor: '#94A3B8' });
  } else {
    rawRows.push({ icon: '📍', label: 'GPS', value: 'Tidak tersedia', valueColor: '#F59E0B' });
  }

  if (loc.poiName) rawRows.push({ icon: '🏢', label: 'LOKASI', value: loc.poiName, valueColor: '#93C5FD' });
  if (loc.areaName) rawRows.push({ icon: '🗺', label: 'WILAYAH', value: loc.areaName, valueColor: '#6EE7B7' });

  // ── Hitung lebar box (Dinaikkan dari 60% ke 75% W agar teks panjang punya lebih banyak ruang)
  const boxW = Math.round(W * 0.75);
  const maxTextW = boxW - STRIPE_W - PAD_X * 2 - ICON_COL;

  // Proses wrapping untuk setiap baris
  const rows: (Row & { lines: string[] })[] = [];
  for (const r of rawRows) {
    FONT(F_VALUE, true);
    const lines = wrapText(ctx, r.value, maxTextW);
    rows.push({ ...r, lines });
  }

  // Hitung total tinggi yang dibutuhkan secara dinamis
  const HEADER_H = LOGO_SZ + PAD_Y * 0.6;
  const DIVIDER_H = unit * 1.6;

  let rowsHeight = 0;
  for (const r of rows) {
    const lineCount = r.lines.length;
    rowsHeight += F_LABEL + (lineCount * F_VALUE * 1.25) + unit * 1.2;
  }

  const boxH = PAD_Y * 2 + HEADER_H + DIVIDER_H + rowsHeight;

  // ── Posisi kiri bawah
  const bx = MARGIN;
  const by = H - MARGIN - boxH;

  // ── Background
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = unit * 3;
  ctx.shadowOffsetY = unit * 1.0;
  ctx.fillStyle = 'rgba(8, 14, 24, 0.38)';
  rrect(ctx, bx, by, boxW, boxH, unit * 1.0);
  ctx.fill();
  ctx.restore();

  // Stripe hijau kiri
  ctx.fillStyle = '#10B981';
  rrect(ctx, bx, by, STRIPE_W, boxH, { tl: unit, bl: unit, tr: 0, br: 0 });
  ctx.fill();

  // BORDER DIHAPUS (Sesuai request user: "kalo bisa hilangkan border juga boleh yang penting informasi timestampnya lengkap dan bagus")

  // ── Konten
  const cx = bx + STRIPE_W + PAD_X;
  let cy = by + PAD_Y;

  // — Header: logo + nama app (judul sama size dengan value, tidak oversized)
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = fail;
      img.src = '/icons/icon-512.png';
      setTimeout(fail, 700);
    });
    ctx.drawImage(img, cx, cy + (LOGO_SZ - LOGO_SZ) / 2, LOGO_SZ, LOGO_SZ);
  } catch {
    // Fallback kotak hijau dengan huruf A
    ctx.fillStyle = '#10B981';
    rrect(ctx, cx, cy, LOGO_SZ, LOGO_SZ, unit * 0.5);
    ctx.fill();
    FONT(LOGO_SZ * 0.58, true);
    ctx.fillStyle = '#fff';
    ctx.fillText('A', cx + LOGO_SZ * 0.26, cy + LOGO_SZ * 0.73);
  }

  const tx = cx + LOGO_SZ + unit * 1.5;

  // Nama app — bold, tapi ukuran = F_TITLE (sama dengan F_VALUE, tidak besar-besaran)
  FONT(F_TITLE, true);
  ctx.fillStyle = '#10B981';
  ctx.fillText('AKSARA', tx, cy + F_TITLE * 1.0);
  const aksaraW = ctx.measureText('AKSARA').width;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(' INSPECT', tx + aksaraW, cy + F_TITLE * 1.0);

  // Sub-label kecil
  FONT(F_SUB);
  ctx.fillStyle = 'rgba(100,116,139,0.85)';
  ctx.fillText('Survey Field Documentation', tx, cy + F_TITLE * 1.0 + F_SUB * 1.7);

  cy += HEADER_H;

  // — Divider
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.lineWidth = Math.max(0.4, unit * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx, cy + DIVIDER_H * 0.5);
  ctx.lineTo(bx + boxW - PAD_X * 0.5, cy + DIVIDER_H * 0.5);
  ctx.stroke();
  cy += DIVIDER_H;

  // — Baris data: label kecil abu di atas, value bold di bawah (bisa multi-line)
  for (const row of rows) {
    const baseX = cx + ICON_COL;

    // Emoji
    FONT(F_VALUE);
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.fillText(row.icon, cx, cy + F_LABEL + F_VALUE * 0.85);

    // Label kecil
    FONT(F_LABEL);
    ctx.fillStyle = 'rgba(100,116,139,0.8)';
    ctx.fillText(row.label, baseX, cy + F_LABEL);

    // Value
    FONT(F_VALUE, true);
    ctx.fillStyle = row.valueColor;

    for (let li = 0; li < row.lines.length; li++) {
      ctx.fillText(row.lines[li], baseX, cy + F_LABEL + F_VALUE * (1.1 + li * 1.25));
    }

    // Hitung tinggi yang telah dipakai baris ini
    cy += F_LABEL + (row.lines.length * F_VALUE * 1.25) + unit * 1.2;
  }
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
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.97)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar galeri */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top))',
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
export function CustomCamera({ onCapture, onClose }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watermark, setWatermark] = useState(false);
  const [gps, setGps] = useState<GpsData | null>(null);
  const [location, setLocation] = useState<LocationDetail>({ poiName: null, areaName: null });
  const [locationLoading, setLocationLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [photos, setPhotos] = useState<string[]>([]);
  const [gallery, setGallery] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  // States untuk Flash/Torch & Zoom
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // States untuk Lens Switcher (multi-camera)
  type LensDevice = { deviceId: string; label: string };
  const [lensDevices, setLensDevices] = useState<LensDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  // Ref: deviceId kamera utama (1×) yang dideteksi browser saat pertama buka
  const mainDeviceIdRef = useRef<string | null>(null);

  // ─── KAMERA ─────────────────────────────────────────────────────────────
  // Ref supaya enumerate hanya dijalankan SEKALI per facing mode, bukan setiap ganti lensa
  const hasEnumerated = useRef(false);

  // Reset enumerate flag & refs ketika facing berubah
  useEffect(() => {
    hasEnumerated.current = false;
    mainDeviceIdRef.current = null;
  }, [facing]);

  useEffect(() => {
    let mounted = true;
    const initStream = async () => {
      try {
        setLoading(true); setError(null);

        // ★ Skip re-init jika stream sudah menggunakan deviceId yang sama (anti flicker)
        if (activeDeviceId && streamRef.current) {
          const existingTrack = streamRef.current.getVideoTracks()[0];
          if (existingTrack) {
            const existingSettings = existingTrack.getSettings ? existingTrack.getSettings() : {} as any;
            if (existingSettings.deviceId === activeDeviceId) {
              setLoading(false);
              return;
            }
          }
        }

        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

        const videoConstraints: MediaTrackConstraints = activeDeviceId
          ? { deviceId: { exact: activeDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const p = videoRef.current.play();
          p?.catch(e => { if (e.name !== 'AbortError') console.error(e); });
        }

        // Cek capabilities untuk zoom dan torch (flash)
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          // Reset torch state & zoom state
          setTorch(false);
          setZoom(1);

          const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};

          // Flash/Torch
          setTorchSupported('torch' in capabilities);

          // Zoom
          if ('zoom' in capabilities) {
            setZoomSupported(true);
            const zoomCap = (capabilities as any).zoom;
            setMinZoom(zoomCap.min || 1);
            setMaxZoom(zoomCap.max || 1);
            setZoom(zoomCap.min || 1);
          } else {
            setZoomSupported(false);
          }
        }

        // Enumerate devices untuk lens switcher — HANYA SEKALI per facing mode
        if (facing === 'environment' && !hasEnumerated.current) {
          hasEnumerated.current = true;

          // ★ Kunci anti-bug: deviceId dari stream saat ini PASTI kamera utama (1×)
          // karena browser membuka main camera via facingMode: 'environment'
          const currentSettings = videoTrack.getSettings ? videoTrack.getSettings() : {} as any;
          const detectedMainId: string | null = currentSettings.deviceId || null;
          mainDeviceIdRef.current = detectedMainId;

          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput' && d.deviceId && d.label);

            // Filter kamera belakang: exclude yang jelas-jelas kamera depan
            const backCameras = videoInputs.filter(d => {
              const lbl = (d.label || '').toLowerCase();
              const isFront = lbl.includes('front') || lbl.includes('user') || lbl.includes('selfie') ||
                lbl.includes('depan') || lbl.includes('facing front');
              return !isFront;
            });

            // Deduplicate berdasarkan deviceId
            const seen = new Set<string>();
            const uniqueBack = backCameras.filter(c => {
              if (seen.has(c.deviceId)) return false;
              seen.add(c.deviceId);
              return true;
            });

            if (uniqueBack.length > 1 && mounted) {
              const classified = uniqueBack.map((cam) => {
                const lbl = (cam.label || '').toLowerCase();
                let type: 'ultra' | 'main' | 'tele' | 'unknown' = 'unknown';
                let label = '';

                // ★ RULE 1: deviceId cocok dengan stream aktif → PASTI main (1×)
                // Ini 100% akurat karena browser selalu membuka kamera utama via facingMode
                if (detectedMainId && cam.deviceId === detectedMainId) {
                  type = 'main'; label = '1×';
                }
                // RULE 2: Deteksi ultra-wide dari keyword label
                else if (
                  lbl.includes('ultra') || lbl.includes('0.5') || lbl.includes('0.6') ||
                  (lbl.includes('wide') && !lbl.includes('main') && !lbl.includes('utama') && !lbl.includes('primary'))
                ) {
                  type = 'ultra'; label = '0.5×';
                }
                // RULE 3: Deteksi telephoto dari keyword label
                else if (
                  lbl.includes('tele') || lbl.includes('periscope') ||
                  lbl.includes('5x') || lbl.includes('3x') || lbl.includes('2x') ||
                  lbl.includes('zoom')
                ) {
                  type = 'tele';
                  if (lbl.includes('5x') || lbl.includes('periscope')) label = '5×';
                  else if (lbl.includes('3x')) label = '3×';
                  else label = '2×';
                }
                // RULE 4: Deteksi main dari keyword (fallback jika deviceId tidak cocok)
                else if (
                  lbl.includes('main') || lbl.includes('utama') ||
                  lbl.includes('1x') || lbl.includes('primary')
                ) {
                  type = 'main'; label = '1×';
                }

                return { deviceId: cam.deviceId, type, label };
              });

              // ★ SAFETY: Pastikan tepat SATU kamera berlabel main
              const mainCams = classified.filter(c => c.type === 'main');
              if (mainCams.length === 0) {
                // Fallback: kamera pertama = main
                classified[0].type = 'main';
                classified[0].label = '1×';
              } else if (mainCams.length > 1) {
                // Duplikat main → keep yang cocok detectedMainId, demote sisanya
                let kept = false;
                classified.forEach(c => {
                  if (c.type === 'main') {
                    if (!kept && (c.deviceId === detectedMainId || !detectedMainId)) {
                      kept = true;
                    } else {
                      c.type = 'tele'; c.label = '2×';
                    }
                  }
                });
              }

              // Fallback untuk tipe 'unknown' sisanya
              let nextUnknownIsUltra = !classified.some(c => c.type === 'ultra');
              classified.forEach((c) => {
                if (c.type === 'unknown') {
                  if (nextUnknownIsUltra) {
                    c.type = 'ultra';
                    c.label = '0.5×';
                    nextUnknownIsUltra = false;
                  } else {
                    c.type = 'tele';
                    c.label = '2×';
                  }
                }
              });

              // 3. Batasi jumlah tombol yang muncul (Maksimal 1 Ultra, 1 Main, dan maks 2 Tele)
              const finalLenses: typeof classified = [];
              const u = classified.find(c => c.type === 'ultra');
              const m = classified.find(c => c.type === 'main');
              
              // Cari tele (bisa lebih dari satu, misal 2x dan 3x)
              const teles = classified.filter(c => c.type === 'tele');
              
              // Deduplicate tele by label untuk menghindari ada dua tombol "2x"
              const uniqueTeles: typeof classified = [];
              const teleSeen = new Set();
              teles.forEach(t => {
                if (!teleSeen.has(t.label)) {
                   teleSeen.add(t.label);
                   uniqueTeles.push(t);
                }
              });

              if (u) finalLenses.push(u);
              if (m) finalLenses.push(m);
              finalLenses.push(...uniqueTeles.slice(0, 2)); // Maks 2 telephoto

              // 4. Urutkan berdasarkan angka pada label (0.5x -> 1x -> 2x -> 3x)
              const val = (lbl: string) => parseFloat(lbl.replace(/[^0-9.]/g, '')) || 1;
              finalLenses.sort((a, b) => val(a.label) - val(b.label));

              const lensResult = finalLenses.map(c => ({ deviceId: c.deviceId, label: c.label }));
              setLensDevices(lensResult);

              // Set activeDeviceId ke lensa '1x' jika belum ada
              if (!activeDeviceId && lensResult.length > 0) {
                 const mainLens = lensResult.find(l => l.label === '1×') || lensResult[0];
                 setActiveDeviceId(mainLens.deviceId);
              }
            } else {
              setLensDevices([]);
            }
          } catch (_) {
            // enumerateDevices gagal — tidak apa-apa, fitur lens switcher tidak ditampilkan
          }
        }

        setLoading(false);
      } catch (e: any) {
        if (mounted) { setError(e.message || 'Gagal mengakses kamera'); setLoading(false); }
      }
    };
    initStream();
    return () => { mounted = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [facing, activeDeviceId]);

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

  const handleZoomChange = async (value: number) => {
    const stream = streamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && zoomSupported) {
      try {
        await videoTrack.applyConstraints({
          advanced: [{ zoom: value } as any]
        });
        setZoom(value);
      } catch (e) {
        console.error('Gagal menerapkan zoom:', e);
      }
    }
  };

  // ─── GPS + GEOCODING ─────────────────────────────────────────────────────
  const doGeocode = useCallback(async (lat: number, lng: number) => {
    setLocationLoading(true);
    const result = await reverseGeocode(lat, lng);
    setLocation(result);
    setLocationLoading(false);
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setGps(pos);
        doGeocode(pos.lat, pos.lng);
      },
      () => { },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [doGeocode]);

  // ─── CAPTURE ─────────────────────────────────────────────────────────────
  const capture = async () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || capturing) return;
    setCapturing(true);
    try {
      const W = v.videoWidth || 1280, H = v.videoHeight || 720;
      c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, W, H);
      if (watermark) await drawWatermark(ctx, W, H, gps, location);
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      setPhotos(prev => [...prev, dataUrl]);
    } catch (e) { console.error('Capture error:', e); }
    finally { setTimeout(() => setCapturing(false), 180); }
  };

  const handleSave = () => { if (photos.length > 0) { onCapture(photos); onClose(); } };

  const openGallery = (index = 0) => setGallery({ open: true, index });

  const deleteOne = (i: number) => {
    setPhotos(prev => prev.filter((_, j) => j !== i));
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 9999,
        display: 'flex', flexDirection: 'column', userSelect: 'none',
      }}>
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* ── TOP BAR ──────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          paddingTop: 'calc(10px + env(safe-area-inset-top))',
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 10, flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
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
              setActiveDeviceId(null);
              setLensDevices([]);
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
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
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
              <button onClick={() => setFacing(f => f)} style={btnStyle('#3B82F6', '#fff')}>
                Coba Lagi
              </button>
            </div>
          )}

          <video ref={videoRef} autoPlay playsInline muted style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: loading || error ? 'none' : 'block',
          }} />

          {/* Flash */}
          {capturing && (
            <div style={{
              position: 'absolute', inset: 0, background: '#fff', opacity: 0.45,
              pointerEvents: 'none', animation: 'camflash 0.18s ease-out forwards',
            }} />
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

          {/* Zoom overlay control */}
          {zoomSupported && maxZoom > minZoom && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
              borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 15px rgba(0,0,0,0.4)', zIndex: 10,
            }}>
              <button
                type="button"
                onClick={() => handleZoomChange(Math.max(minZoom, zoom - 0.5))}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', padding: '0 6px' }}
              >
                -
              </button>
              <input
                type="range"
                min={minZoom}
                max={maxZoom}
                step={0.1}
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                style={{ accentColor: '#10B981', width: 100, height: 4, cursor: 'pointer' }}
              />
              <button
                type="button"
                onClick={() => handleZoomChange(Math.min(maxZoom, zoom + 0.5))}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', padding: '0 6px' }}
              >
                +
              </button>
              <span style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold', minWidth: 32, textAlign: 'center' }}>
                {zoom.toFixed(1)}x
              </span>
            </div>
          )}

          {/* Lens Switcher — tombol 0.5× / 1× / 2× untuk multi-camera fisik */}
          {lensDevices.length > 1 && (
            <div style={{
              position: 'absolute',
              bottom: zoomSupported && maxZoom > minZoom ? 62 : 16,
              left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 8, zIndex: 11,
            }}>
              {lensDevices.map((lens) => {
                const isActive = activeDeviceId
                  ? activeDeviceId === lens.deviceId
                  : lens.deviceId === mainDeviceIdRef.current;
                return (
                  <button
                    key={lens.deviceId}
                    type="button"
                    onClick={() => setActiveDeviceId(lens.deviceId)}
                    style={{
                      width: 46, height: 46, borderRadius: '50%',
                      background: isActive
                        ? 'rgba(16,185,129,0.85)'
                        : 'rgba(0,0,0,0.6)',
                      backdropFilter: 'blur(6px)',
                      border: isActive
                        ? '2px solid #10B981'
                        : '2px solid rgba(255,255,255,0.2)',
                      color: isActive ? '#fff' : '#CBD5E1',
                      fontSize: lens.label.length > 3 ? 10 : 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isActive
                        ? '0 0 16px rgba(16,185,129,0.5)'
                        : '0 2px 8px rgba(0,0,0,0.5)',
                      transition: 'all 0.2s ease',
                      transform: isActive ? 'scale(1.1)' : 'scale(1)',
                    }}
                  >
                    {lens.label}
                  </button>
                );
              })}
            </div>
          )}
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
          {/* Kiri: Simpan */}
          <div style={{ width: 120, display: 'flex', justifyContent: 'flex-end' }}>
            {photos.length > 0 && (
              <button onClick={handleSave} style={{
                background: 'linear-gradient(135deg, #1D4ED8, #3B82F6)',
                border: 'none', borderRadius: 12,
                padding: '11px 16px', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
              }}>
                💾 Simpan ({photos.length})
              </button>
            )}
          </div>

          {/* Tengah: Capture */}
          <button
            onClick={capture}
            disabled={capturing || !!error || loading}
            aria-label="Ambil foto"
            style={{
              width: 72, height: 72, borderRadius: '50%',
              border: `4px solid ${capturing ? '#374151' : '#fff'}`,
              background: 'transparent',
              cursor: capturing || !!error || loading ? 'not-allowed' : 'pointer',
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
    </>
  );
}