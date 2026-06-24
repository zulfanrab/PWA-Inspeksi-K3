// src/components/CustomCamera.tsx
import { useState, useRef, useEffect, useCallback } from 'react';

interface CustomCameraProps {
  onCapture: (dataUrls: string[]) => void;
  onClose: () => void;
}

// ─── WATERMARK RENDERER ───────────────────────────────────────────────────────
// Menggambar watermark profesional ala app survey lapangan di pojok kiri bawah.
// Semua ukuran dihitung relatif terhadap resolusi canvas sehingga proporsional
// di berbagai ukuran foto (portrait/landscape, HD/FHD/4K).
async function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  gps: { lat: number; lng: number; acc: number } | null,
  locationName: string | null
) {
  // ── Skala dasar: 1 unit = 1/100 lebar canvas (min 1 px)
  const unit = Math.max(1, canvasW / 100);

  const FONT_SM   = unit * 1.1;    // label kecil / nilai sekunder
  const FONT_MD   = unit * 1.3;    // nilai utama / koordinat
  const FONT_LG   = unit * 1.6;    // nama app
  const PAD_X     = unit * 1.6;    // padding horizontal dalam box
  const PAD_Y     = unit * 1.3;    // padding vertikal dalam box
  const LINE_GAP  = unit * 0.55;   // jarak antar baris
  const MARGIN    = unit * 2;      // jarak box dari tepi foto
  const LOGO_SIZE = unit * 3.2;    // ukuran ikon logo

  // ── Siapkan font helper
  const setFont = (size: number, weight: 'normal' | 'bold' | '600' = 'normal') => {
    ctx.font = `${weight} ${size}px 'SF Pro Display', 'Segoe UI', system-ui, sans-serif`;
  };

  // ── Hitung timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // ── Siapkan baris-baris teks
  const lines: Array<{
    label?: string;
    value: string;
    valueColor: string;
    labelColor?: string;
    bold?: boolean;
  }> = [];

  // Baris 1: Nama aplikasi
  lines.push({
    value: 'AKSARA INSPECT',
    valueColor: '#FFFFFF',
    bold: true,
  });

  // Divider — ditandai khusus
  lines.push({ value: '__DIVIDER__', valueColor: '' });

  // Baris 2: Tanggal & waktu
  lines.push({
    label: '🕐',
    value: `${dateStr}  ${timeStr}`,
    valueColor: '#E2E8F0',
    labelColor: '#94A3B8',
  });

  // Baris 3: Koordinat GPS
  if (gps) {
    const coordStr = `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`;
    lines.push({
      label: '📍',
      value: coordStr,
      valueColor: '#34D399',
      labelColor: '#94A3B8',
    });
    // Baris 4: Nama lokasi atau akurasi
    if (locationName) {
      lines.push({
        label: '   ',           // indent agar rata di bawah koordinat
        value: locationName,
        valueColor: '#6EE7B7',
        labelColor: '#94A3B8',
      });
    }
    lines.push({
      label: '   ',
      value: `Akurasi ±${Math.round(gps.acc)} m`,
      valueColor: '#94A3B8',
      labelColor: '#94A3B8',
    });
  } else {
    lines.push({
      label: '📍',
      value: 'GPS tidak tersedia',
      valueColor: '#F59E0B',
      labelColor: '#94A3B8',
    });
  }

  // ── Ukur lebar maksimum (untuk menentukan lebar box)
  const measureLine = (line: typeof lines[0]): number => {
    if (line.value === '__DIVIDER__') return 0;
    if (line.value === 'AKSARA INSPECT') {
      setFont(FONT_LG, 'bold');
    } else {
      setFont(FONT_MD);
    }
    const emojiWidth = line.label ? FONT_MD * 1.4 : 0;
    return emojiWidth + ctx.measureText(line.value).width;
  };

  const maxLineW = Math.max(...lines.map(measureLine));
  // Logo width + gap juga ikut diperhitungkan
  const logoRowW = LOGO_SIZE + PAD_X * 0.5 + ctx.measureText('AKSARA INSPECT').width;
  setFont(FONT_LG, 'bold');
  const logoRowWActual = LOGO_SIZE + PAD_X * 0.5 + ctx.measureText('AKSARA INSPECT').width;
  const boxW = Math.max(maxLineW, logoRowWActual) + PAD_X * 2.5;

  // ── Hitung tinggi box
  const dividerH = unit * 0.15 + LINE_GAP * 2;
  const rowH = FONT_MD + LINE_GAP;
  const titleH = FONT_LG + LINE_GAP;
  let boxH = PAD_Y * 2;
  for (const line of lines) {
    boxH += line.value === '__DIVIDER__' ? dividerH : line.value === 'AKSARA INSPECT' ? titleH : rowH;
  }

  // ── Posisi box: pojok kiri bawah
  const bx = MARGIN;
  const by = canvasH - MARGIN - boxH;

  // ── Background box dengan blur effect (simulasi glassmorphism)
  // Layer 1: shadow halus
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = unit * 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = unit * 1;

  // Background utama
  ctx.fillStyle = 'rgba(10, 18, 30, 0.88)';
  roundRect(ctx, bx, by, boxW, boxH, unit * 0.8);
  ctx.fill();
  ctx.restore();

  // Border kiri — accent stripe hijau survey
  ctx.fillStyle = '#10B981';
  roundRect(ctx, bx, by, unit * 0.55, boxH, { tl: unit * 0.8, bl: unit * 0.8, tr: 0, br: 0 });
  ctx.fill();

  // Border luar tipis
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
  ctx.lineWidth = Math.max(0.8, unit * 0.12);
  roundRect(ctx, bx, by, boxW, boxH, unit * 0.8);
  ctx.stroke();

  // ── Gambar konten baris demi baris
  let curY = by + PAD_Y;
  const contentX = bx + unit * 0.55 + PAD_X; // mulai setelah stripe

  for (const line of lines) {
    if (line.value === '__DIVIDER__') {
      curY += LINE_GAP;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = Math.max(0.5, unit * 0.08);
      ctx.beginPath();
      ctx.moveTo(contentX, curY);
      ctx.lineTo(bx + boxW - PAD_X, curY);
      ctx.stroke();
      curY += unit * 0.15 + LINE_GAP;
      continue;
    }

    if (line.value === 'AKSARA INSPECT') {
      // ── Header row: logo + nama app
      // Coba render logo
      let logoDrawn = false;
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((ok, fail) => {
          img.onload = () => ok();
          img.onerror = fail;
          img.src = '/icons/icon-192.png';
          setTimeout(fail, 600);
        });
        ctx.drawImage(img, contentX, curY - LOGO_SIZE * 0.08, LOGO_SIZE, LOGO_SIZE);
        logoDrawn = true;
      } catch {
        // fallback: gambar kotak hijau kecil
        ctx.fillStyle = '#10B981';
        roundRect(ctx, contentX, curY, LOGO_SIZE, LOGO_SIZE, unit * 0.3);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        setFont(LOGO_SIZE * 0.55, 'bold');
        ctx.fillText('A', contentX + LOGO_SIZE * 0.27, curY + LOGO_SIZE * 0.73);
      }

      // Nama app
      const textX = contentX + LOGO_SIZE + PAD_X * 0.6;
      setFont(FONT_LG * 0.85, 'bold');
      ctx.fillStyle = '#10B981';
      ctx.fillText('AKSARA', textX, curY + FONT_LG * 0.62);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(' INSPECT', textX + ctx.measureText('AKSARA').width, curY + FONT_LG * 0.62);

      // Label versi kecil
      setFont(FONT_SM * 0.85, 'normal');
      ctx.fillStyle = '#475569';
      ctx.fillText('v1.0 · Survey Field', textX, curY + FONT_LG * 1.25);

      curY += titleH + LINE_GAP * 0.5;
      continue;
    }

    // ── Baris normal: emoji label + nilai
    const lineBaseY = curY + FONT_MD;

    if (line.label && line.label.trim()) {
      setFont(FONT_MD, 'normal');
      ctx.fillStyle = line.labelColor || '#94A3B8';
      ctx.fillText(line.label, contentX, lineBaseY);
    }

    const emojiOffset = line.label ? FONT_MD * 1.5 : 0;
    setFont(FONT_MD, line.bold ? 'bold' : 'normal');
    ctx.fillStyle = line.valueColor;
    ctx.fillText(line.value, contentX + emojiOffset, lineBaseY);

    curY += rowH;
  }
}

// ── Helper roundRect cross-browser
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  radius: number | { tl: number; tr: number; bl: number; br: number }
) {
  const r = typeof radius === 'number'
    ? { tl: radius, tr: radius, bl: radius, br: radius }
    : radius;

  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────
export function CustomCamera({ onCapture, onClose }: CustomCameraProps) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading,         setLoading        ] = useState(true);
  const [error,           setError          ] = useState<string | null>(null);
  const [watermark,       setWatermark      ] = useState(true);
  const [gps,             setGps            ] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locationName,    setLocationName   ] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [capturing,       setCapturing      ] = useState(false);
  const [facing,          setFacing         ] = useState<'environment' | 'user'>('environment');
  const [photos,          setPhotos         ] = useState<string[]>([]);

  // ─── KAMERA ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const initStream = async () => {
      try {
        setLoading(true);
        setError(null);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              if (err.name !== 'AbortError') console.error('Video play error:', err);
            });
          }
        }
        setLoading(false);
      } catch (e: any) {
        if (mounted) {
          setError(e.message || 'Gagal mengakses kamera');
          setLoading(false);
        }
      }
    };

    initStream();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [facing]);

  // ─── GPS + REVERSE GEOCODING ──────────────────────────────────────────────
  const fetchLocationName = useCallback(async (lat: number, lng: number) => {
    setLocationLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=id`,
        { headers: { 'User-Agent': 'AksaraInspect/1.0' } }
      );
      const data = await res.json();
      if (data?.address) {
        const addr = data.address;
        const city     = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
        const province = addr.state || '';
        const parts    = [city, province].filter(Boolean);
        setLocationName(parts.length > 0 ? parts.join(', ') : null);
      }
    } catch {
      // silent — koordinat GPS tetap ditampilkan sebagai fallback
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setGps(pos);
        fetchLocationName(pos.lat, pos.lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [fetchLocationName]);

  // ─── CAPTURE ──────────────────────────────────────────────────────────────
  const capture = async () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || capturing) return;
    setCapturing(true);

    try {
      const w = v.videoWidth  || 1280;
      const h = v.videoHeight || 720;
      c.width  = w;
      c.height = h;

      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas context tidak tersedia');

      // Gambar frame video
      ctx.drawImage(v, 0, 0, w, h);

      // Gambar watermark jika aktif
      if (watermark) {
        await drawWatermark(ctx, w, h, gps, locationName);
      }

      const dataUrl = c.toDataURL('image/jpeg', 0.9);
      setPhotos(prev => [...prev, dataUrl]);
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      // Delay kecil supaya flash animation terlihat
      setTimeout(() => setCapturing(false), 180);
    }
  };

  const handleSave = () => {
    if (photos.length === 0) return;
    onCapture(photos);
    onClose();
  };

  const retryCamera = () => {
    // Trigger re-mount effect dengan mereset facing (trick sederhana)
    setFacing(f => f);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
    }}>
      {/* Canvas tersembunyi untuk proses gambar */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        paddingTop: 'calc(10px + env(safe-area-inset-top))',
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        gap: 10,
        flexShrink: 0,
      }}>
        {/* Tombol Tutup */}
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '7px 14px',
            color: '#E2E8F0',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          ✕ Tutup
        </button>

        {/* Toggle Watermark */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          cursor: 'pointer',
          padding: '6px 12px',
          background: watermark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${watermark ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 8,
          transition: 'all 0.2s',
        }}>
          <input
            type="checkbox"
            checked={watermark}
            onChange={e => setWatermark(e.target.checked)}
            style={{ accentColor: '#10B981', width: 14, height: 14 }}
          />
          <span style={{ color: watermark ? '#10B981' : '#94A3B8', fontSize: 12, fontWeight: 600 }}>
            Watermark
          </span>
        </label>

        {/* Tombol Flip Kamera */}
        <button
          onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '7px 12px',
            color: '#E2E8F0',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          🔄 Balik
        </button>
      </div>

      {/* ── AREA VIDEO ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>

        {/* Loading */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#111', color: '#94A3B8', gap: 12,
          }}>
            <div style={{ fontSize: 32 }}>📷</div>
            <div style={{ fontSize: 14 }}>Memuat kamera...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#111', color: '#EF4444',
            padding: 24, gap: 14, textAlign: 'center',
          }}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <div style={{ fontSize: 14, color: '#FCA5A5', maxWidth: 260 }}>{error}</div>
            <button
              onClick={retryCamera}
              style={{
                background: '#3B82F6', border: 'none', borderRadius: 10,
                padding: '10px 24px', color: '#fff', fontSize: 13,
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Video */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: loading || error ? 'none' : 'block',
          }}
        />

        {/* Flash saat capture */}
        {capturing && (
          <div style={{
            position: 'absolute', inset: 0,
            background: '#fff',
            opacity: 0.5,
            pointerEvents: 'none',
            animation: 'flash 0.18s ease-out forwards',
          }} />
        )}

        {/* Badge jumlah foto */}
        {photos.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: '#10B981',
            color: '#fff',
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            boxShadow: '0 2px 8px rgba(16,185,129,0.4)',
          }}>
            📸 {photos.length}
          </div>
        )}

        {/* Viewfinder grid (rule of thirds) - subtle */}
        {!loading && !error && (
          <div style={{
            position: 'absolute', inset: 0,
            pointerEvents: 'none',
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '33.33% 33.33%',
          }} />
        )}
      </div>

      {/* ── STATUS BAR GPS ───────────────────────────────────────────────── */}
      <div style={{
        padding: '6px 16px',
        background: 'rgba(0,0,0,0.75)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
        minHeight: 32,
      }}>
        {/* Indikator GPS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: gps ? '#10B981' : '#F59E0B',
            boxShadow: gps ? '0 0 6px #10B981' : '0 0 6px #F59E0B',
          }} />
          <span style={{ color: gps ? '#34D399' : '#FCD34D', fontSize: 11, fontWeight: 600 }}>
            {gps ? 'GPS Aktif' : 'Mencari GPS...'}
          </span>
        </div>

        {gps && (
          <span style={{ color: '#475569', fontSize: 10 }}>
            ±{Math.round(gps.acc)}m
          </span>
        )}

        {locationLoading && (
          <span style={{ color: '#F59E0B', fontSize: 10 }}>📍 Mencari nama lokasi...</span>
        )}

        {locationName && !locationLoading && (
          <>
            <span style={{ color: '#334155', fontSize: 10 }}>·</span>
            <span style={{
              color: '#34D399',
              fontSize: 10,
              maxWidth: '55%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {locationName}
            </span>
          </>
        )}

        {gps && !locationName && !locationLoading && (
          <>
            <span style={{ color: '#334155', fontSize: 10 }}>·</span>
            <span style={{ color: '#475569', fontSize: 10 }}>
              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
            </span>
          </>
        )}
      </div>

      {/* ── BOTTOM BAR ───────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 24px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.9)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        flexShrink: 0,
      }}>

        {/* Tombol Simpan — muncul hanya jika ada foto */}
        {photos.length > 0 ? (
          <button
            onClick={handleSave}
            style={{
              background: 'linear-gradient(135deg, #1D4ED8, #3B82F6)',
              border: 'none',
              borderRadius: 14,
              padding: '13px 22px',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(59,130,246,0.45)',
              minWidth: 130,
              justifyContent: 'center',
            }}
          >
            💾 Simpan ({photos.length})
          </button>
        ) : (
          /* Placeholder agar tombol capture tetap di tengah */
          <div style={{ width: 130 }} />
        )}

        {/* Tombol Capture */}
        <button
          onClick={capture}
          disabled={capturing || !!error || loading}
          aria-label="Ambil foto"
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: `4px solid ${capturing ? '#4B5563' : '#FFFFFF'}`,
            background: 'transparent',
            cursor: capturing || !!error || loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.12s, border-color 0.15s',
            flexShrink: 0,
            transform: capturing ? 'scale(0.92)' : 'scale(1)',
          }}
        >
          <div style={{
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: capturing
              ? '#4B5563'
              : 'linear-gradient(135deg, #10B981, #059669)',
            transition: 'background 0.15s',
            boxShadow: capturing ? 'none' : '0 0 16px rgba(16,185,129,0.5)',
          }} />
        </button>

        {/* Spacer kanan supaya capture tetap di tengah */}
        <div style={{ width: 130, display: 'flex', justifyContent: 'flex-start' }}>
          {photos.length > 0 && (
            <button
              onClick={() => setPhotos([])}
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10,
                padding: '10px 14px',
                color: '#F87171',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🗑 Hapus
            </button>
          )}
        </div>
      </div>

      {/* Flash animation style */}
      <style>{`
        @keyframes flash {
          0%   { opacity: 0.55; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}