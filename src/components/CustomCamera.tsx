// src/components/CustomCamera.tsx
// Custom In-App Camera dengan WebRTC + K3 Watermark (GPS + Timestamp + Logo)
// FAST-CAPTURE: Langsung jepret tanpa retake confirmation

import { useState, useRef, useEffect, useCallback } from 'react';

interface CustomCameraProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  maxPhotos?: number;
  currentPhotoCount?: number;
}

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface WatermarkData {
  timestamp: string;
  geoLocation: GeoLocation | null;
  logoUrl: string;
}

export function CustomCamera({
  onCapture,
  onClose,
  maxPhotos = 10,
  currentPhotoCount = 0
}: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [logoUrl] = useState<string>('/icons/icon-192.png');
  
  const remainingSlots = maxPhotos - currentPhotoCount;
  const canCapture = remainingSlots > 0;

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setIsLoading(false);
      
      // Get GPS location
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setGeoLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            });
            setGeoError(null);
          },
          (err) => {
            setGeoError('GPS: ' + err.message);
            setGeoLocation(null);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
      } else {
        setGeoError('Geolocation tidak tersedia');
      }
      
    } catch (err) {
      console.error('Camera error:', err);
      setError(err instanceof Error ? err.message : 'Gagal mengakses kamera');
      setIsLoading(false);
    }
  }, [facingMode]);

  // Initialize camera on mount
  useEffect(() => {
    startCamera();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Toggle camera facing
  const toggleFacing = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Capture photo with watermark
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;
    
    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;
      
      // Set canvas size same as video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get current timestamp
      const now = new Date();
      const timestamp = now.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
      
      // Draw watermark if enabled
      if (watermarkEnabled) {
        await drawWatermark(ctx, canvas, timestamp, geoLocation, logoUrl);
      }
      
      // Get data URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      // Callback with captured image
      onCapture(dataUrl);
      
      // Small delay for visual feedback
      setTimeout(() => setIsCapturing(false), 300);
      
    } catch (err) {
      console.error('Capture error:', err);
      setError('Gagal mengambil foto');
      setIsCapturing(false);
    }
  };

  // Draw watermark on canvas
  const drawWatermark = async (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    timestamp: string,
    geo: GeoLocation | null,
    logoSrc: string
  ) => {
    const width = canvas.width;
    const height = canvas.height;
    
    // Watermark box properties
    const boxPadding = 16;
    const boxWidth = Math.min(400, width * 0.35);
    const boxX = width - boxWidth - 20;
    const boxY = height - 120;
    
    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(boxX, boxY, boxWidth, 100);
    
    // Border
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, 100);
    
    // Text properties
    const textX = boxX + boxPadding;
    let textY = boxY + 28;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    
    // Draw logo if available
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve(); // Continue without logo
        logoImg.src = logoSrc;
        setTimeout(resolve, 1000); // Timeout fallback
      });
      
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        const logoSize = 30;
        ctx.drawImage(logoImg, boxX + boxPadding, boxY + boxPadding, logoSize, logoSize);
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('AKSARA INSPECT', boxX + boxPadding + logoSize + 8, textY);
        textY += 28;
      }
    } catch (err) {
      // Logo failed, continue without it
    }
    
    // Timestamp
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = '#10B981';
    ctx.fillText('🕐 ' + timestamp, textX, textY);
    textY += 22;
    
    // GPS Coordinates
    if (geo) {
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(
        `📍 ${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}`,
        textX,
        textY
      );
      textY += 18;
      
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`Accuracy: ±${Math.round(geo.accuracy)}m`, textX, textY);
    } else {
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.fillText('⚠️ Lokasi tidak tersedia', textX, textY);
    }
  };

  // Format GPS for display
  const formatGPS = (geo: GeoLocation | null) => {
    if (!geo) return 'Tidak ada GPS';
    return `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}`;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000000',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)'
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ✕ Tutup
        </button>
        
        <div style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
          {currentPhotoCount}/{maxPhotos} foto
        </div>
        
        {/* Toggle facing camera */}
        <button
          onClick={() => {
            toggleFacing();
            startCamera();
          }}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#FFFFFF',
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          🔄 Flip
        </button>
      </div>
      
      {/* Camera Preview */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111'
          }}>
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
              <div>Memuat kamera...</div>
            </div>
          </div>
        )}
        
        {error && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111',
            padding: 20
          }}>
            <div style={{ textAlign: 'center', color: '#EF4444' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
              <div style={{ fontSize: 16, marginBottom: 8 }}>{error}</div>
              <button
                onClick={startCamera}
                style={{
                  background: '#3B82F6',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 20px',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                  marginTop: 8
                }}
              >
                🔄 Coba Lagi
              </button>
            </div>
          </div>
        )}
        
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: isLoading || error ? 'none' : 'block'
          }}
        />
        
        {/* Capture Flash Effect */}
        {isCapturing && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: '#FFFFFF',
            animation: 'flash 0.3s ease-out'
          }} />
        )}
      </div>
      
      {/* Watermark Toggle & Info */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)'
      }}>
        {/* Toggle Watermark */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10
        }}>
          <div style={{ color: '#FFFFFF', fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Watermark K3</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>
              Timestamp + GPS + Logo
            </div>
          </div>
          
          <button
            onClick={() => setWatermarkEnabled(!watermarkEnabled)}
            style={{
              width: 52,
              height: 28,
              borderRadius: 14,
              background: watermarkEnabled ? '#10B981' : '#374151',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.2s'
            }}
          >
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#FFFFFF',
              position: 'absolute',
              top: 3,
              left: watermarkEnabled ? 27 : 3,
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} />
          </button>
        </div>
        
        {/* GPS Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: geoLocation ? '#10B981' : '#F59E0B',
          fontSize: 11
        }}>
          <span>{geoLocation ? '📍' : '⚠️'}</span>
          <span>{formatGPS(geoLocation)}</span>
          {geoError && (
            <span style={{ color: '#94A3B8', fontSize: 10 }}>({geoError})</span>
          )}
        </div>
      </div>
      
      {/* Capture Button */}
      <div style={{
        padding: '20px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <button
          onClick={capturePhoto}
          disabled={!canCapture || isCapturing}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: canCapture && !isCapturing ? '#10B981' : '#374151',
            border: '4px solid #FFFFFF',
            cursor: canCapture && !isCapturing ? 'pointer' : 'not-allowed',
            opacity: canCapture ? 1 : 0.5,
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
          }}
        >
          {isCapturing ? (
            <div style={{
              width: 32,
              height: 32,
              border: '3px solid #fff',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: 'auto'
            }} />
          ) : (
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#FFFFFF',
              margin: 'auto'
            }} />
          )}
        </button>
      </div>
      
      {/* CSS Animations */}
      <style>{`
        @keyframes flash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Gallery picker component for selecting from device gallery
interface GalleryPickerProps {
  onSelect: (files: FileList) => void;
  onClose: () => void;
  multiple?: boolean;
}

export function GalleryPicker({ onSelect, onClose, multiple = false }: GalleryPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    inputRef.current?.click();
  }, []);
  
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple={multiple}
      onChange={(e) => {
        if (e.target.files && e.target.files.length > 0) {
          onSelect(e.target.files);
        } else {
          onClose();
        }
      }}
      style={{ display: 'none' }}
    />
  );
}