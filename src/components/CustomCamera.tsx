// src/components/CustomCamera.tsx
import { useState, useRef, useEffect, useCallback } from 'react';

interface CustomCameraProps {
  onCapture: (dataUrls: string[]) => void;
  onClose: () => void;
}

export function CustomCamera({ onCapture, onClose }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watermark, setWatermark] = useState(true);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [photos, setPhotos] = useState<string[]>([]);

  const startStream = useCallback(async (mode: string) => {
    try {
      setLoading(true);
      setError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode as any, width: 1280, height: 720 },
        audio: false,
      });
      if (!mountedRef.current) { s.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setLoading(false);
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e.message || 'Gagal akses kamera');
        setLoading(false);
      }
    }
  }, []);

  // Reverse geocoding via Nominatim
  const fetchLocationName = useCallback(async (lat: number, lng: number) => {
    setLocationLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=id`,
        { headers: { 'User-Agent': 'AksaraInspect/1.0' } }
      );
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
        const province = addr.state || '';
        const parts = [city, province].filter(Boolean);
        setLocationName(parts.length > 0 ? parts.join(', ') : null);
      }
    } catch {
      // silent — GPS coordinates are already shown as fallback
    } finally {
      setLocationLoading(false);
    }
  }, []);

  // Single lifecycle: init camera + GPS (cleanup on unmount only)
  useEffect(() => {
    mountedRef.current = true;
    startStream(facing);

    navigator.geolocation.getCurrentPosition(
      p => {
        if (!mountedRef.current) return;
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setGps(pos);
        fetchLocationName(pos.lat, pos.lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );

    return () => {
      mountedRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle camera switch — separate effect, but only runs when facing changes AND component is still mounted
  useEffect(() => {
    if (!mountedRef.current) return;
    startStream(facing);
  }, [facing, startStream]);

  const capture = async () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || capturing) return;
    setCapturing(true);
    try {
      c.width = v.videoWidth || 1280;
      c.height = v.videoHeight || 720;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0, c.width, c.height);

      if (watermark) {
        // Dynamic sizing based on image height
        const baseFontSize = Math.max(10, c.height * 0.02);
        const pad = Math.max(8, c.height * 0.012);
        const boxW = Math.min(380, c.width * 0.48);
        const boxH = Math.max(60, baseFontSize * 6.5);
        const bx = c.width - boxW - pad * 1.5;
        const by = c.height - boxH - pad * 1.5;

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 6);
        ctx.fill();
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 6);
        ctx.stroke();

        // Logo
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((ok, fail) => {
            img.onload = () => ok();
            img.onerror = fail;
            img.src = '/icons/icon-192.png';
            setTimeout(fail, 500);
          });
          const logoSize = Math.max(18, baseFontSize * 2);
          ctx.drawImage(img, bx + pad, by + pad, logoSize, logoSize);
          ctx.font = `bold ${baseFontSize * 0.9}px system-ui,sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.fillText('AKSARA', bx + pad + logoSize + 6, by + pad + baseFontSize * 0.7);
          ctx.fillStyle = '#10B981';
          ctx.fillText('INSPECT', bx + pad + logoSize + 6, by + pad + baseFontSize * 1.65);
        } catch {
          // fallback — text-only
        }

        const now = new Date();
        const ts = now.toLocaleDateString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric',
        }) + ' ' + now.toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });

        ctx.font = `${baseFontSize * 0.85}px system-ui,sans-serif`;
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(ts, bx + pad, by + boxH - pad - baseFontSize * 0.15);

        // Location info
        const locationText = locationName
          ? locationName
          : (gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : null);

        if (locationText) {
          ctx.fillStyle = '#10B981';
          ctx.font = `${baseFontSize * 0.85}px system-ui,sans-serif`;
          const locX = bx + pad + ts.length * baseFontSize * 0.52;
          ctx.fillText(locationText, Math.min(locX, bx + boxW - pad - ctx.measureText(locationText).width), by + boxH - pad - baseFontSize * 0.15);
        }
      }

      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      setPhotos(prev => [...prev, dataUrl]);
      setTimeout(() => setCapturing(false), 200);
    } catch {
      setCapturing(false);
    }
  };

  const handleSave = () => {
    if (photos.length === 0) return;
    onCapture(photos);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', paddingTop: 'calc(12px + env(safe-area-inset-top))', background: 'rgba(0,0,0,0.85)' }}>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
          ✕ Tutup
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} style={{ accentColor: '#10B981' }} />
            Watermark
          </label>
        </div>
        <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
          🔄 Balik
        </button>
      </div>

      {/* Video area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#fff', fontSize: 14 }}>
            ⏳ Memuat kamera...
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#EF4444', padding: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 14, marginBottom: 12 }}>{error}</div>
            <button onClick={() => startStream(facing)} style={{ background: '#3B82F6', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#fff', cursor: 'pointer' }}>
              Coba Lagi
            </button>
          </div>
        )}
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: loading || error ? 'none' : 'block' }}
        />
        {capturing && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.6, transition: 'opacity 0.2s' }} />}

        {/* Photo counter badge */}
        {photos.length > 0 && (
          <div style={{ position: 'absolute', top: 12, left: 12, background: '#10B981', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📸</span> {photos.length}
          </div>
        )}
      </div>

      {/* GPS + Location status bar */}
      <div style={{ padding: '6px 16px', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: gps ? '#10B981' : '#F59E0B', fontSize: 11 }}>
          {gps ? '📍 GPS Aktif' : '⏳ Mencari GPS...'}
        </span>
        {gps && <span style={{ color: '#94A3B8', fontSize: 10 }}>±{gps.acc}m</span>}
        {locationLoading && <span style={{ color: '#F59E0B', fontSize: 10 }}>📍 Mencari lokasi...</span>}
        {locationName && (
          <span style={{ color: '#10B981', fontSize: 10, maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {locationName}
          </span>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ padding: '16px 16px calc(16px + env(safe-area-inset-bottom))', background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {/* Capture button */}
        <button onClick={capture} disabled={capturing}
          style={{
            width: 68, height: 68, borderRadius: '50%', border: '4px solid #fff',
            background: capturing ? '#6B7280' : '#10B981',
            cursor: capturing ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff' }} />
        </button>

        {/* Save button — only visible when photos exist */}
        {photos.length > 0 && (
          <button onClick={handleSave}
            style={{
              background: '#3B82F6', border: 'none', borderRadius: 12,
              padding: '12px 20px', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
            }}
          >
            <span>💾</span> Simpan ({photos.length} foto)
          </button>
        )}
      </div>
    </div>
  );
}