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
      addr.amenity        ||  // restoran, kantor, dll
      addr.office         ||  // kantor perusahaan
      addr.building       ||  // nama gedung
      addr.shop           ||  // toko
      addr.tourism        ||  // tempat wisata
      addr.leisure        ||  // area rekreasi
      addr.historic       ||  // bangunan bersejarah
      addr.industrial     ||  // kawasan industri
      addr.man_made       ||  // struktur buatan
      data.name           ||  // nama langsung dari OSM node
      addr.road           ||  // nama jalan sebagai fallback terakhir
      null;

    result.poiName = poiCandidate || null;

    // ── Area: kota / kecamatan / provinsi
    const city =
      addr.city           ||
      addr.town           ||
      addr.village        ||
      addr.suburb         ||
      addr.municipality   ||
      addr.county         ||
      addr.district       ||
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
// Semua ukuran relatif terhadap resolusi canvas → proporsional di semua device.
// Posisi: pojok kiri bawah. Style: profesional survey lapangan.
async function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gps: GpsData | null,
  loc: LocationDetail
) {
  // ── Sistem unit: berbasis tinggi canvas agar proporsional portrait & landscape
  const unit     = Math.max(1, H / 80);   // ~1.35% tinggi foto
  const FONT_XS  = unit * 1.05;
  const FONT_SM  = unit * 1.25;
  const FONT_MD  = unit * 1.55;
  const FONT_LG  = unit * 2.0;
  const PAD_X    = unit * 2.0;
  const PAD_Y    = unit * 1.8;
  const ROW_H    = FONT_MD * 1.75;
  const LOGO_SZ  = FONT_LG * 1.6;
  const MARGIN   = unit * 2.0;
  const STRIPE_W = unit * 0.7;

  const sf = (size: number, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px 'SF Pro Text','Segoe UI',system-ui,sans-serif`;
  };

  // ── Timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const coordStr = gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : null;
  const accStr   = gps ? `±${Math.round(gps.acc)} m` : null;

  // ── Hitung lebar baris terpanjang untuk menentukan boxW
  const textLines = [
    `${dateStr}  ${timeStr}`,
    coordStr || 'GPS tidak tersedia',
    loc.poiName || '',
    loc.areaName || '',
    accStr || '',
  ].filter(Boolean);

  sf(FONT_MD);
  const maxTxtW = Math.max(...textLines.map(t => ctx.measureText(t).width));

  sf(FONT_LG, true);
  const titleW = ctx.measureText('AKSARA INSPECT').width;

  const ICON_OFFSET = FONT_MD * 1.6; // lebar kolom emoji
  const boxW = Math.min(
    W * 0.65,          // max 65% lebar foto
    Math.max(maxTxtW + ICON_OFFSET, titleW + LOGO_SZ + PAD_X) + PAD_X * 2 + STRIPE_W
  );

  // ── Hitung tinggi box
  // Baris: header (logo+title), divider, datetime, coord/gps, poi?, area?, akurasi
  let nRows = 3; // datetime + coord + akurasi
  if (loc.poiName)  nRows++;
  if (loc.areaName) nRows++;

  const HEADER_H  = LOGO_SZ + PAD_Y * 0.5;
  const DIVIDER_H = unit * 1.4;
  const boxH = PAD_Y * 2 + HEADER_H + DIVIDER_H + nRows * ROW_H;

  // ── Posisi: kiri bawah
  const bx = MARGIN;
  const by = H - MARGIN - boxH;

  // ── Shadow
  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur    = unit * 4;
  ctx.shadowOffsetY = unit * 1.5;

  // Background — opacity rendah, lebih transparan
  ctx.fillStyle = 'rgba(8, 14, 24, 0.62)';
  rrect(ctx, bx, by, boxW, boxH, unit * 1.0);
  ctx.fill();
  ctx.restore();

  // Stripe hijau kiri
  ctx.fillStyle = '#10B981';
  rrect(ctx, bx, by, STRIPE_W, boxH, { tl: unit, bl: unit, tr: 0, br: 0 });
  ctx.fill();

  // Border tipis
  ctx.strokeStyle = 'rgba(16,185,129,0.28)';
  ctx.lineWidth   = Math.max(0.5, unit * 0.1);
  rrect(ctx, bx, by, boxW, boxH, unit * 1.0);
  ctx.stroke();

  // ── Gambar isi
  const cx = bx + STRIPE_W + PAD_X;  // X awal konten (setelah stripe)
  let cy = by + PAD_Y;

  // — Header: Logo + Nama App
  // Logo
  let logoOk = false;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = fail;
      img.src = '/icons/icon-192.png';
      setTimeout(fail, 700);
    });
    ctx.drawImage(img, cx, cy, LOGO_SZ, LOGO_SZ);
    logoOk = true;
  } catch {
    ctx.fillStyle = '#10B981';
    rrect(ctx, cx, cy, LOGO_SZ, LOGO_SZ, unit * 0.5);
    ctx.fill();
    sf(LOGO_SZ * 0.55, true);
    ctx.fillStyle = '#fff';
    ctx.fillText('A', cx + LOGO_SZ * 0.28, cy + LOGO_SZ * 0.72);
  }

  // Teks di samping logo
  const tx = cx + LOGO_SZ + PAD_X * 0.7;
  sf(FONT_LG, true);
  ctx.fillStyle = '#10B981';
  ctx.fillText('AKSARA', tx, cy + FONT_LG);
  const aksaraW = ctx.measureText('AKSARA').width;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(' INSPECT', tx + aksaraW, cy + FONT_LG);

  sf(FONT_XS);
  ctx.fillStyle = 'rgba(148,163,184,0.75)';
  ctx.fillText('Survey Field Documentation  v1.0', tx, cy + FONT_LG + FONT_XS * 1.5);

  cy += HEADER_H;

  // — Divider
  cy += DIVIDER_H * 0.3;
  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth   = Math.max(0.4, unit * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(bx + boxW - PAD_X, cy);
  ctx.stroke();
  cy += DIVIDER_H * 0.7;

  // ── Helper untuk baris isi
  const drawRow = (
    emoji: string,
    value: string,
    valColor: string,
    subVal?: string,
    subColor?: string
  ) => {
    // Emoji
    sf(FONT_MD);
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.fillText(emoji, cx, cy + FONT_MD);

    // Value
    sf(FONT_MD, true);
    ctx.fillStyle = valColor;
    ctx.fillText(value, cx + ICON_OFFSET, cy + FONT_MD);

    // Sub-value (inline kanan)
    if (subVal) {
      sf(FONT_SM);
      ctx.fillStyle = subColor || 'rgba(148,163,184,0.7)';
      const mainW = ctx.measureText(value).width;
      sf(FONT_SM);
      ctx.fillText('  ' + subVal, cx + ICON_OFFSET + mainW, cy + FONT_MD);
    }

    cy += ROW_H;
  };

  // — Baris datetime
  drawRow('🕐', `${dateStr}`, '#E2E8F0', timeStr, 'rgba(148,163,184,0.7)');

  // — Baris koordinat GPS atau no-GPS
  if (gps && coordStr) {
    drawRow('📍', coordStr, '#34D399', accStr || '', 'rgba(148,163,184,0.6)');
  } else {
    drawRow('📍', 'GPS tidak tersedia', '#F59E0B');
  }

  // — Nama POI (gedung / tempat spesifik)
  if (loc.poiName) {
    drawRow('🏢', loc.poiName, '#93C5FD');
  }

  // — Nama area (kota, provinsi)
  if (loc.areaName) {
    drawRow('🗺', loc.areaName, '#6EE7B7');
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
  const [idx, setIdx]           = useState(initialIndex);
  const [scale, setScale]       = useState(1);
  const [offset, setOffset]     = useState({ x: 0, y: 0 });
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
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
      lastScale.current = scale;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
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
    lastDist.current = null;
    if (scale <= 1 && dragStart.current && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - dragStart.current.x;
      if (Math.abs(dx) > 50) {
        dx < 0 ? goTo(idx + 1) : goTo(idx - 1);
      }
    }
    dragStart.current = null;
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
        // Fallback: download
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
      if (e.key === 'ArrowLeft')  goTo(idx - 1);
      if (e.key === 'Escape')     onClose();
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
        padding: '12px 16px',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <button onClick={onClose} style={btnStyle('#475569')}>✕ Tutup</button>
        <span style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 600 }}>
          {idx + 1} / {photos.length}
        </span>
        <button onClick={handleShare} style={btnStyle('#1D4ED8', '#93C5FD')}>⬆ Bagikan</button>
      </div>

      {/* Area foto */}
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: dragging ? 'grabbing' : 'grab' }}
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
          background: 'rgba(0,0,0,0.7)', flexShrink: 0,
          scrollbarWidth: 'none',
        }}>
          {photos.map((p, i) => (
            <img
              key={i}
              src={p}
              onClick={() => goTo(i)}
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
        padding: '12px 16px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.85)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', gap: 10, justifyContent: 'center',
        flexShrink: 0,
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
            <button onClick={() => { onDeleteAll(); onClose(); }}
              style={btnStyle('#DC2626', '#fff')}>Ya, Hapus</button>
            <button onClick={() => setConfirmAll(false)}
              style={btnStyle('rgba(255,255,255,0.1)', '#94A3B8')}>Batal</button>
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
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading,         setLoading        ] = useState(true);
  const [error,           setError          ] = useState<string | null>(null);
  const [watermark,       setWatermark      ] = useState(true);
  const [gps,             setGps            ] = useState<GpsData | null>(null);
  const [location,        setLocation       ] = useState<LocationDetail>({ poiName: null, areaName: null });
  const [locationLoading, setLocationLoading] = useState(false);
  const [capturing,       setCapturing      ] = useState(false);
  const [facing,          setFacing         ] = useState<'environment' | 'user'>('environment');
  const [photos,          setPhotos         ] = useState<string[]>([]);
  const [gallery,         setGallery        ] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });

  // ─── KAMERA ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const initStream = async () => {
      try {
        setLoading(true); setError(null);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const p = videoRef.current.play();
          p?.catch(e => { if (e.name !== 'AbortError') console.error(e); });
        }
        setLoading(false);
      } catch (e: any) {
        if (mounted) { setError(e.message || 'Gagal mengakses kamera'); setLoading(false); }
      }
    };
    initStream();
    return () => { mounted = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [facing]);

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
      () => {},
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
          <button onClick={onClose} style={btnStyle('rgba(255,255,255,0.1)')}>✕ Tutup</button>

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

          <button
            onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
            style={btnStyle('rgba(255,255,255,0.1)')}>
            🔄 Balik
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
            <span style={{ color: '#93C5FD', fontSize: 10, fontWeight: 600,
              maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              · {location.poiName}
            </span>
          )}
          {location.areaName && !locationLoading && (
            <span style={{ color: '#34D399', fontSize: 10,
              maxWidth: '35%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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