// src/components/CustomCamera.tsx
import { useState, useRef, useEffect } from 'react';

interface CustomCameraProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CustomCamera({ onCapture, onClose }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watermark, setWatermark] = useState(true);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  const startStream = async (mode: string) => {
    try {
      setLoading(true);
      setError(null);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode as any, width: 1280, height: 720 },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setLoading(false);
    } catch (e: any) {
      setError(e.message || 'Gagal akses kamera');
      setLoading(false);
    }
  };

  useEffect(() => {
    startStream(facing);
    navigator.geolocation.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => { startStream(facing); }, [facing]);

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
        const pad = 12;
        const boxW = Math.min(340, c.width * 0.45);
        const bx = c.width - boxW - 14;
        const by = c.height - 90;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(bx, by, boxW, 76);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, boxW, 76);

        // Logo
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = fail; img.src = '/icons/icon-192.png'; setTimeout(fail, 500); });
          ctx.drawImage(img, bx + pad, by + pad, 22, 22);
          ctx.font = 'bold 12px system-ui,sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText('AKSARA', bx + pad + 28, by + 20);
          ctx.fillStyle = '#10B981';
          ctx.fillText('INSPECT', bx + pad + 28, by + 34);
        } catch {}

        const now = new Date();
        const ts = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
          + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        ctx.font = '11px system-ui,sans-serif';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(ts, bx + pad, by + 56);

        if (gps) {
          ctx.fillStyle = '#10B981';
          ctx.fillText(
            gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5),
            bx + pad + 140, by + 56
          );
        }
      }

      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      onCapture(dataUrl);
      setTimeout(() => setCapturing(false), 200);
    } catch {
      setCapturing(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
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
      </div>

      {/* GPS status bar */}
      <div style={{ padding: '6px 16px', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: gps ? '#10B981' : '#F59E0B', fontSize: 11 }}>
          {gps ? '📍 GPS Aktif' : '⏳ Mencari GPS...'}
        </span>
        {gps && <span style={{ color: '#94A3B8', fontSize: 10 }}>±{gps.acc}m</span>}
      </div>

      <div style={{ padding: '16px 16px calc(16px + env(safe-area-inset-bottom))', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center' }}>
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
      </div>
    </div>
  );
}