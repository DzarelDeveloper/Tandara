import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Camera, CheckCircle2, Database, RefreshCw, Server, ShieldAlert, StopCircle, Video } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { ApiError } from '../../services/api';
import { ActiveSessionHealth, DetectionDiagnostic, FaceEngineHealth, HealthStatus, systemService } from '../../services/system.service';
import { CAMERA_STORAGE_KEY, CameraPermissionState, cameraConstraints, cameraErrorMessage, cameraErrorState, enumerateVideoDevices, stopMediaStream } from '../../utils/camera';

type ServiceState = 'CHECKING' | 'ONLINE' | 'OFFLINE';
type TrackDetails = { label: string; width?: number; height?: number; frameRate?: number };

const Badge = ({ ok, text }: { ok: boolean; text: string }) => <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}><span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />{text}</span>;

function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / video.videoWidth, 360 / video.videoHeight);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
}

function withTimeout<T>(request: Promise<T>, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('DIAGNOSTIC_TIMEOUT')), timeoutMs);
    request.then((value) => { window.clearTimeout(timeout); resolve(value); }, (error) => { window.clearTimeout(timeout); reject(error); });
  });
}

export const AdminDevicesSystemPage: React.FC = () => {
  const [serviceState, setServiceState] = useState<ServiceState>('CHECKING');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [face, setFace] = useState<FaceEngineHealth | null>(null);
  const [session, setSession] = useState<ActiveSessionHealth | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => localStorage.getItem(CAMERA_STORAGE_KEY) ?? '');
  const [permission, setPermission] = useState<CameraPermissionState>('NOT_REQUESTED');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [trackDetails, setTrackDetails] = useState<TrackDetails | null>(null);
  const [diagnostic, setDiagnostic] = useState<DetectionDiagnostic | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef(false);

  const refreshDevices = useCallback(async () => {
    try {
      const available = await enumerateVideoDevices();
      if (!mountedRef.current) return;
      setDevices(available);
      setSelectedDeviceId((current) => {
        const next = available.some((device) => device.deviceId === current) ? current : (available[0]?.deviceId ?? '');
        if (next) localStorage.setItem(CAMERA_STORAGE_KEY, next); else localStorage.removeItem(CAMERA_STORAGE_KEY);
        return next;
      });
    } catch { if (mountedRef.current) setPermission('ERROR'); }
  }, []);

  const stopCamera = useCallback(() => {
    detectAbortRef.current?.abort(); detectAbortRef.current = null;
    stopMediaStream(streamRef.current); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null); setTrackDetails(null); setDiagnostic(null); setDetecting(false);
  }, []);

  const startCamera = useCallback(async (deviceId = selectedDeviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) { setPermission('ERROR'); return; }
    setPermission('REQUESTING'); setDiagnostic(null); setDiagnosticError('');
    try {
      const next = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId || undefined));
      if (!mountedRef.current) { stopMediaStream(next); return; }
      stopMediaStream(streamRef.current); streamRef.current = next; setStream(next); setPermission('GRANTED');
      const track = next.getVideoTracks()[0]; const settings = track?.getSettings(); const activeId = settings?.deviceId ?? deviceId;
      if (activeId) { setSelectedDeviceId(activeId); localStorage.setItem(CAMERA_STORAGE_KEY, activeId); }
      setTrackDetails({ label: track?.label || 'Kamera browser', width: settings?.width, height: settings?.height, frameRate: settings?.frameRate });
      await refreshDevices();
    } catch (error) { stopCamera(); setPermission(cameraErrorState(error)); }
  }, [refreshDevices, selectedDeviceId, stopCamera]);

  const refreshDiagnostics = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setRefreshing(true); setServiceState('CHECKING');
    const healthStarted = performance.now();
    try {
      const healthCheck = withTimeout(systemService.health()).then((value) => ({ value, latency: Math.round(performance.now() - healthStarted) }));
      const [healthResult, faceResult, sessionResult, devicesResult] = await Promise.allSettled([
        healthCheck,
        withTimeout(systemService.faceEngine()),
        withTimeout(systemService.activeSession()),
        withTimeout(enumerateVideoDevices()),
      ]);
      if (!mountedRef.current) return;
      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value.value);
        setServiceState(healthResult.value.value.status === 'ok' ? 'ONLINE' : 'OFFLINE');
        setLatency(healthResult.value.latency);
      } else {
        setHealth(null); setServiceState('OFFLINE'); setLatency(null);
      }
      setFace(faceResult.status === 'fulfilled' ? faceResult.value : null);
      setSession(sessionResult.status === 'fulfilled' ? sessionResult.value : null);
      if (devicesResult.status === 'fulfilled') {
        const available = devicesResult.value;
        setDevices(available);
        setSelectedDeviceId((current) => {
          const next = available.some((device) => device.deviceId === current) ? current : (available[0]?.deviceId ?? '');
          if (next) localStorage.setItem(CAMERA_STORAGE_KEY, next); else localStorage.removeItem(CAMERA_STORAGE_KEY);
          return next;
        });
      }
    } finally {
      refreshInFlightRef.current = false;
      if (mountedRef.current) { setLastChecked(new Date()); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { void refreshDiagnostics(); }, [refreshDiagnostics]);
  useEffect(() => { if (videoRef.current && stream) { videoRef.current.srcObject = stream; void videoRef.current.play(); } }, [stream]);
  useEffect(() => {
    const changed = async () => {
      const available = await enumerateVideoDevices(); if (!mountedRef.current) return; setDevices(available);
      if (selectedDeviceId && !available.some((device) => device.deviceId === selectedDeviceId)) {
        stopCamera(); const fallback = available[0]?.deviceId ?? ''; setSelectedDeviceId(fallback); setPermission(fallback ? 'NOT_REQUESTED' : 'NO_DEVICE');
      }
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', changed);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', changed);
  }, [selectedDeviceId, stopCamera]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; detectAbortRef.current?.abort(); stopMediaStream(streamRef.current); };
  }, []);

  const switchDevice = async (deviceId: string) => { setSelectedDeviceId(deviceId); localStorage.setItem(CAMERA_STORAGE_KEY, deviceId); if (streamRef.current) { stopCamera(); await startCamera(deviceId); } };
  const runDetection = async () => {
    if (!videoRef.current) return; const image = await captureFrame(videoRef.current); if (!image) { setDiagnosticError('Frame kamera belum siap.'); return; }
    const controller = new AbortController(); detectAbortRef.current = controller; setDetecting(true); setDiagnostic(null); setDiagnosticError('');
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
    try { setDiagnostic(await systemService.detectFace(image, controller.signal)); }
    catch (error) { if (timedOut) setDiagnosticError('Uji deteksi melewati batas waktu. Periksa koneksi backend.'); else if (!controller.signal.aborted) setDiagnosticError(error instanceof ApiError ? error.message : 'Uji deteksi gagal.'); }
    finally { window.clearTimeout(timeout); if (detectAbortRef.current === controller) detectAbortRef.current = null; setDetecting(false); }
  };

  const dbReady = health?.database.status === 'connected'; const faceReady = face?.status === 'READY' || health?.face_recognition === 'READY'; const cameraReady = Boolean(stream && trackDetails);
  const systemReady = serviceState === 'ONLINE' && dbReady && faceReady && cameraReady;
  const detectionMessage = diagnostic ? diagnostic.faceCount === 0 ? 'Wajah tidak terdeteksi.' : diagnostic.faceCount === 1 ? (diagnostic.quality === 'OK' ? '1 wajah terdeteksi.' : `1 wajah terdeteksi — ${diagnostic.quality}.`) : 'Lebih dari satu wajah terdeteksi.' : '';

  return <div className="space-y-6">
    <PageHeader title="System Health & Camera Diagnostics" subtitle="Status nyata layanan dan kesiapan kamera browser Tandara" breadcrumbs={[{ label: 'Admin IT', href: '/admin/dashboard' }, { label: 'Perangkat & Sistem' }]} />
    <section className={`rounded-xl border p-5 ${systemReady ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-slate-500">System Readiness</p><h2 className="text-xl font-bold">{systemReady ? 'SYSTEM READY' : 'ACTION REQUIRED'}</h2><p className="text-xs text-slate-500 mt-1">Last checked: {lastChecked ? lastChecked.toLocaleTimeString('id-ID') : '—'}</p></div><button type="button" onClick={() => void refreshDiagnostics()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />Periksa Ulang</button></div>
      <div className="flex flex-wrap gap-4 mt-4 text-sm"><span>{serviceState === 'ONLINE' ? '✓' : '✕'} Backend</span><span>{dbReady ? '✓' : '✕'} Database</span><span>{faceReady ? '✓' : '✕'} Face Engine</span><span>{cameraReady ? '✓' : '✕'} Camera</span></div>
    </section>
    <section><h3 className="font-semibold mb-3">System Services</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white border rounded-xl p-5"><Server className="w-5 h-5 text-blue-600 mb-3" /><p className="font-semibold">FastAPI</p><Badge ok={serviceState === 'ONLINE'} text={serviceState} /><p className="text-xs text-slate-500 mt-2">API latency: {latency === null ? '—' : `${latency} ms`}</p></div>
      <div className="bg-white border rounded-xl p-5"><Database className="w-5 h-5 text-blue-600 mb-3" /><p className="font-semibold">Database</p><Badge ok={dbReady} text={health ? health.database.status.toUpperCase() : 'UNKNOWN'} /><p className="text-xs text-slate-500 mt-2">{health?.database.type === 'sqlite' ? 'SQLite' : health?.database.type ?? '—'}</p></div>
      <div className="bg-white border rounded-xl p-5"><Activity className="w-5 h-5 text-blue-600 mb-3" /><p className="font-semibold">Face Engine</p><Badge ok={faceReady} text={face?.status ?? health?.face_recognition ?? 'UNAVAILABLE'} /><div className="text-xs text-slate-500 mt-2"><p>YuNet: {face?.detectorStatus ?? '—'}</p><p>SFace: {face?.recognizerStatus ?? '—'}</p><p>{face?.engine ?? 'OpenCV / ONNX'}</p>{face?.message && <p className="text-amber-700">{face.message}</p>}</div></div>
    </div></section>
    <section className="bg-white border rounded-xl p-5">
      <div className="flex gap-2 mb-4"><Video className="w-5 h-5 text-blue-600" /><div><h3 className="font-semibold">Camera Diagnostics</h3><p className="text-xs text-slate-500">Preview lokal browser; frame hanya dikirim saat Uji Deteksi Wajah ditekan.</p></div></div>
      <label className="block text-xs font-semibold mb-1">SUMBER KAMERA</label><select value={selectedDeviceId} onChange={(event) => void switchDevice(event.target.value)} className="w-full md:max-w-lg border rounded-lg px-3 py-2 text-sm" disabled={!devices.length}>{devices.length ? devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>) : <option value="">Tidak ada kamera terdeteksi</option>}</select>
      <p className="text-xs text-slate-500 mt-2">Jika menggunakan DroidCam, aktifkan virtual camera terlebih dahulu lalu pilih perangkatnya di sini.</p>
      <div className="relative aspect-video max-w-3xl mt-4 rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center">{stream ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" /> : <div className="text-center text-slate-400 px-6"><Camera className="w-9 h-9 mx-auto mb-2" /><p className="text-sm">{cameraErrorMessage(permission)}</p></div>}{diagnostic?.faceBoxes.map((box, index) => <div key={index} className="absolute border-2 border-emerald-400" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />)}</div>
      <div className="flex flex-wrap gap-2 mt-4">{stream ? <button type="button" onClick={stopCamera} className="inline-flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm"><StopCircle className="w-4 h-4" />Hentikan Kamera</button> : <button type="button" onClick={() => void startCamera()} disabled={permission === 'REQUESTING'} className="inline-flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60"><Camera className="w-4 h-4" />{permission === 'NOT_REQUESTED' ? 'Izinkan Kamera' : 'Mulai Tes Kamera'}</button>}<button type="button" onClick={() => void runDetection()} disabled={!cameraReady || serviceState !== 'ONLINE' || !faceReady || detecting} className="inline-flex items-center gap-2 border rounded-lg px-4 py-2 text-sm disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />{detecting ? 'Mendeteksi…' : 'Uji Deteksi Wajah'}</button></div>
      {trackDetails && <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm"><p><span className="text-slate-500">Device:</span> {trackDetails.label}</p><p><span className="text-slate-500">Resolution:</span> {trackDetails.width && trackDetails.height ? `${trackDetails.width}×${trackDetails.height}` : 'Tidak tersedia'}</p><p><span className="text-slate-500">Frame Rate:</span> {trackDetails.frameRate ?? 'Tidak tersedia'}</p></div>}
      {(detectionMessage || diagnosticError) && <p className={`mt-3 text-sm ${diagnosticError ? 'text-red-700' : ''}`}>{diagnosticError || detectionMessage}</p>}
      <div className="mt-5"><p className="text-xs font-semibold mb-2">CAMERA DEVICES</p>{devices.length ? <ul className="text-sm space-y-1">{devices.map((device, index) => <li key={device.deviceId}>• {device.label || `Camera ${index + 1}`}</li>)}</ul> : <p className="text-sm text-slate-500">Label perangkat tersedia setelah browser memberikan izin kamera.</p>}</div>
    </section>
    <div className="grid md:grid-cols-2 gap-4"><section className="bg-white border rounded-xl p-5"><h3 className="font-semibold mb-3">Attendance Session</h3>{session ? <div><Badge ok text="ACTIVE" /><p className="text-sm mt-2">Mode: {session.mode}</p><p className="text-sm">Camera Source: {session.cameraSource}</p><p className="text-sm">Opened At: {new Date(session.openedAt).toLocaleString('id-ID')}</p></div> : <div><Badge ok={false} text="NO ACTIVE SESSION" /><p className="text-xs text-slate-500 mt-2">Sesi hanya dibuka dari alur attendance.</p></div>}</section><section className="bg-white border rounded-xl p-5"><div className="flex gap-2"><ShieldAlert className="w-5 h-5 text-amber-600" /><div><h3 className="font-semibold">Parent Notification</h3><p className="text-xs font-semibold text-amber-700 mt-2">IN DEVELOPMENT</p><p className="text-sm text-slate-600 mt-2">Pengiriman notifikasi presensi ke aplikasi orang tua sedang dalam tahap pengembangan.</p></div></div></section></div>
  </div>;
};
