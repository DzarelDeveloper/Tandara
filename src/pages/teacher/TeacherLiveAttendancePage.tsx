/** Realtime, single-request-at-a-time face attendance for browser/virtual webcams. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CameraOff, Clock, Pause, Play, Scan, StopCircle, UserCheck, Video } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { StartSessionModal } from '../../components/teacher/StartSessionModal';
import { useToast } from '../../context/ToastContext';
import { AttendanceEvent } from '../../types';
import { attendanceService, FaceScanResult } from '../../services/attendance.service';
import { systemService } from '../../services/system.service';
import { ApiError, BackendDisconnectedError } from '../../services/api';
import { CAMERA_STORAGE_KEY, cameraConstraints, enumerateVideoDevices, stopMediaStream } from '../../utils/camera';

type RecognitionState = 'CAMERA_OFF' | 'READY' | 'SCANNING' | 'RECOGNIZED' | 'UNKNOWN' | 'DUPLICATE' | 'QUALITY_ERROR' | 'CAMERA_ERROR' | 'SERVER_ERROR';

const requestedScanInterval = Number(import.meta.env.VITE_SCAN_INTERVAL_MS ?? 850);
const SCAN_INTERVAL_MS = Number.isFinite(requestedScanInterval) ? Math.max(700, Math.min(5000, requestedScanInterval)) : 850;
const CAPTURE_MAX_WIDTH = 640;
const CAPTURE_MAX_HEIGHT = 360;
const JPEG_QUALITY = 0.8;

const scanErrorMessages: Record<string, string> = {
  FACE_NOT_DETECTED: 'Posisikan wajah di area kamera.',
  MULTIPLE_FACES: 'Pastikan hanya satu siswa di depan kamera.',
  FACE_TOO_BLURRY: 'Gambar terlalu buram.',
  FACE_TOO_DARK: 'Pencahayaan terlalu gelap.',
  FACE_TOO_BRIGHT: 'Pencahayaan terlalu terang.',
  FACE_TOO_SMALL: 'Dekatkan wajah ke kamera.',
  FACE_OUT_OF_FRAME: 'Posisikan wajah sepenuhnya di dalam frame.',
  NO_ENROLLED_FACES: 'Belum ada wajah siswa yang terdaftar.',
  ENGINE_NOT_READY: 'Mesin pengenalan wajah belum siap.',
  DUPLICATE_SCAN: 'Sudah dipindai.',
  UNKNOWN_FACE: 'Wajah tidak dikenali.',
  AMBIGUOUS_FACE: 'Identitas wajah belum cukup meyakinkan.',
  INVALID_IMAGE: 'Frame kamera tidak valid.',
  SESSION_NOT_ACTIVE: 'Sesi absensi tidak lagi aktif.',
};

const qualityCodes = new Set(['FACE_NOT_DETECTED', 'MULTIPLE_FACES', 'FACE_TOO_BLURRY', 'FACE_TOO_DARK', 'FACE_TOO_BRIGHT', 'FACE_TOO_SMALL', 'FACE_OUT_OF_FRAME']);

function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return Promise.resolve(null);
  const scale = Math.min(1, CAPTURE_MAX_WIDTH / sourceWidth, CAPTURE_MAX_HEIGHT / sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
}

export const TeacherLiveAttendancePage: React.FC = () => {
  const { showBackendNotConnected, showToast } = useToast();
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [activeMode, setActiveMode] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentDetections, setRecentDetections] = useState<AttendanceEvent[]>([]);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => localStorage.getItem(CAMERA_STORAGE_KEY) ?? '');
  const [mirrored, setMirrored] = useState(true);
  const [scanState, setScanState] = useState<RecognitionState>('CAMERA_OFF');
  const [scanMessage, setScanMessage] = useState('Aktifkan kamera untuk memulai.');
  const [scanResult, setScanResult] = useState<FaceScanResult | null>(null);
  const [faceBox, setFaceBox] = useState<FaceScanResult['faceBox']>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInFlightRef = useRef(false);
  const scanAbortRef = useRef<AbortController | null>(null);
  const networkFailureRef = useRef(0);
  const mountedRef = useRef(true);

  const clearScanScheduling = useCallback(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setCameraStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    const devices = await enumerateVideoDevices();
    if (mountedRef.current) setVideoDevices(devices);
  }, []);

  const openCamera = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanState('CAMERA_ERROR');
      setScanMessage('Browser ini tidak mendukung akses kamera.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId));
      if (!mountedRef.current) {
        stopMediaStream(stream);
        return;
      }
      stopMediaStream(streamRef.current);
      streamRef.current = stream;
      setCameraStream(stream);
      const settings = stream.getVideoTracks()[0]?.getSettings();
      const activeDeviceId = settings?.deviceId ?? deviceId ?? '';
      if (activeDeviceId) {
        setSelectedDeviceId(activeDeviceId);
        localStorage.setItem(CAMERA_STORAGE_KEY, activeDeviceId);
      }
      setMirrored(settings?.facingMode !== 'environment');
      setScanState('READY');
      setScanMessage(sessionId ? 'Pemindaian otomatis aktif.' : 'Kamera siap. Mulai sesi untuk memindai.');
      await refreshDevices();
    } catch (error) {
      setScanState('CAMERA_ERROR');
      setScanMessage('Kamera tidak dapat diakses. Periksa izin atau pilihan kamera.');
      showToast({ type: 'error', title: 'Kamera tidak tersedia', message: error instanceof Error ? error.message : 'Periksa izin kamera browser.' });
    }
  }, [refreshDevices, sessionId, showToast]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && cameraStream) {
      video.srcObject = cameraStream;
      void video.play();
    }
  }, [cameraStream]);

  useEffect(() => {
    void refreshDevices();
    const handleDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  }, [refreshDevices]);

  useEffect(() => attendanceService.subscribe((message) => {
    if (message.event !== 'ATTENDANCE_SUCCESS') return;
    const data = message.data;
    setRecentDetections((current) => [{
      id: `${data.student_id}-${message.timestamp}`, studentId: String(data.student_id), studentName: String(data.student_name ?? ''),
      nis: String(data.nis ?? ''), className: String(data.class_name ?? ''), eventType: data.mode as 'CHECK_IN' | 'CHECK_OUT',
      timestamp: message.timestamp, cameraSource: 'BROWSER_CAMERA', similarityScore: typeof data.similarity === 'number' ? data.similarity : undefined,
    }, ...current].slice(0, 50));
  }), []);

  const scanFrame = useCallback(async (): Promise<number> => {
    const video = videoRef.current;
    if (!sessionId || !streamRef.current || !video || scanInFlightRef.current) return SCAN_INTERVAL_MS;
    const frame = await captureFrame(video);
    if (!frame || !mountedRef.current) return SCAN_INTERVAL_MS;
    scanInFlightRef.current = true;
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanState('SCANNING');
    setScanMessage('Memproses frame...');
    const started = performance.now();
    try {
      const result = await attendanceService.scanFrame(sessionId, frame, controller.signal);
      if (!mountedRef.current) return SCAN_INTERVAL_MS;
      networkFailureRef.current = 0;
      setLastLatencyMs(performance.now() - started);
      setScanResult(result);
      setFaceBox(result.faceBox);
      setScanState('RECOGNIZED');
      setScanMessage(result.mode === 'CHECK_IN' ? 'CHECK-IN BERHASIL' : 'CHECK-OUT BERHASIL');
      return SCAN_INTERVAL_MS;
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return SCAN_INTERVAL_MS;
      const code = error instanceof ApiError ? error.code : undefined;
      const message = scanErrorMessages[code ?? ''] ?? (error instanceof Error ? error.message : 'Scan gagal.');
      if (code === 'DUPLICATE_SCAN') {
        networkFailureRef.current = 0; setFaceBox(null); setScanState('DUPLICATE'); setScanMessage(message); return SCAN_INTERVAL_MS;
      }
      if (code === 'UNKNOWN_FACE' || code === 'AMBIGUOUS_FACE') {
        networkFailureRef.current = 0; setFaceBox(null); setScanState('UNKNOWN'); setScanMessage(message); return SCAN_INTERVAL_MS;
      }
      if (code && qualityCodes.has(code)) {
        networkFailureRef.current = 0; setFaceBox(null); setScanState('QUALITY_ERROR'); setScanMessage(message); return SCAN_INTERVAL_MS;
      }
      if (code === 'SESSION_NOT_ACTIVE') {
        clearScanScheduling(); setSessionId(null); stopCamera(); setFaceBox(null); setScanState('SERVER_ERROR'); setScanMessage(message); return 5000;
      }
      networkFailureRef.current += 1;
      setScanState('SERVER_ERROR');
      setScanMessage(message);
      if (error instanceof BackendDisconnectedError && networkFailureRef.current === 1) {
        showBackendNotConnected('Koneksi backend terputus. Pemindaian akan mencoba kembali secara bertahap.');
      }
      return Math.min(5000, 2000 * (2 ** Math.max(0, networkFailureRef.current - 1)));
    } finally {
      if (scanAbortRef.current === controller) scanAbortRef.current = null;
      scanInFlightRef.current = false;
    }
  }, [clearScanScheduling, sessionId, showBackendNotConnected, stopCamera]);

  useEffect(() => {
    if (!sessionId || !cameraStream) return;
    let cancelled = false;
    const tick = async () => {
      const delay = await scanFrame();
      if (!cancelled && mountedRef.current && streamRef.current) scanTimerRef.current = setTimeout(tick, delay);
    };
    scanTimerRef.current = setTimeout(tick, 250);
    return () => { cancelled = true; clearScanScheduling(); };
  }, [cameraStream, clearScanScheduling, scanFrame, sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        const active = await systemService.activeSession({ cameraSource: 'BROWSER_CAMERA' });
        if (!active || !mountedRef.current) return;
        setSessionId(active.id);
        setActiveMode(active.mode);
        setScanState('READY');
        setScanMessage('Sesi aktif ditemukan. Pemindaian otomatis siap dijalankan.');
        if (!streamRef.current) {
          void openCamera(selectedDeviceId || undefined);
        }
      } catch {
        // Ignore bootstrap load failure: the page can still start a fresh session normally.
      }
    })();
    return () => {
      mountedRef.current = false;
      clearScanScheduling();
      stopMediaStream(streamRef.current);
    };
  }, [clearScanScheduling, openCamera, selectedDeviceId]);

  const closeSession = async () => {
    if (!sessionId) return;
    const closingId = sessionId;
    clearScanScheduling(); setSessionId(null); stopCamera(); setScanResult(null); setFaceBox(null); setScanState('CAMERA_OFF'); setScanMessage('Sesi ditutup.');
    try { await attendanceService.stopLiveSession(closingId); }
    catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Sesi gagal ditutup di server.' }); }
  };

  const columns: Column<AttendanceEvent>[] = [
    { key: 'timestamp', header: 'Waktu', render: (item) => new Date(item.timestamp).toLocaleTimeString('id-ID') },
    { key: 'studentName', header: 'Siswa' }, { key: 'nis', header: 'NIS' }, { key: 'className', header: 'Kelas' },
    { key: 'eventType', header: 'Tipe', render: (item) => <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${item.eventType === 'CHECK_IN' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-teal-50 text-teal-800 border border-teal-200'}`}>{item.eventType === 'CHECK_IN' ? 'Masuk' : 'Pulang'}</span> },
    { key: 'similarityScore', header: 'Similarity', render: (item) => <span className="text-xs text-slate-600">{typeof item.similarityScore === 'number' ? item.similarityScore.toFixed(3) : '—'}</span> },
  ];

  const videoAspect = videoRef.current?.videoWidth && videoRef.current?.videoHeight ? videoRef.current.videoWidth / videoRef.current.videoHeight : 16 / 9;
  const containerAspect = 16 / 9;
  const videoScaleX = videoAspect < containerAspect ? videoAspect / containerAspect : 1;
  const videoScaleY = videoAspect > containerAspect ? containerAspect / videoAspect : 1;
  const videoOffsetX = (1 - videoScaleX) / 2;
  const videoOffsetY = (1 - videoScaleY) / 2;
  const overlayBox = faceBox;
  const overlayColor = scanState === 'RECOGNIZED' ? 'border-emerald-400' : scanState === 'UNKNOWN' ? 'border-amber-400' : 'border-white/60';
  const stateColor = scanState === 'RECOGNIZED' ? 'bg-emerald-600 text-white' : scanState === 'DUPLICATE' ? 'bg-blue-600 text-white' : scanState === 'UNKNOWN' || scanState === 'QUALITY_ERROR' ? 'bg-amber-500 text-slate-950' : scanState === 'SERVER_ERROR' || scanState === 'CAMERA_ERROR' ? 'bg-red-600 text-white' : 'bg-slate-900/80 text-white';

  return (
    <div className="space-y-6">
      <PageHeader title="Absensi Langsung" subtitle="Pemindaian wajah realtime melalui webcam browser atau DroidCam virtual" breadcrumbs={[{ label: 'Guru Piket', href: '/teacher/dashboard' }, { label: 'Absensi Langsung' }]} actions={
        <div className="flex items-center gap-2">
          <button type="button" disabled={Boolean(sessionId)} onClick={() => setShowSessionModal(true)} className="t-button-primary text-sm"><Play className="w-4 h-4 fill-current" /> Mulai Sesi</button>
          <button type="button" disabled={!cameraStream} onClick={() => { clearScanScheduling(); stopCamera(); setScanState('CAMERA_OFF'); setScanMessage('Kamera dijeda.'); }} className="t-button-secondary text-sm disabled:opacity-40"><Pause className="w-4 h-4" /> Jeda Kamera</button>
          <button type="button" disabled={!sessionId} onClick={closeSession} className="inline-flex items-center gap-2 min-h-10 px-4 text-sm font-semibold rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-40"><StopCircle className="w-4 h-4" /> Tutup Sesi</button>
        </div>
      } />

      <div className="bg-white py-4 px-5 border-y border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><span className="text-xs font-medium uppercase tracking-wider text-slate-500">Sesi:</span><span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${sessionId ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>{sessionId ? `${activeMode === 'CHECK_IN' ? 'CHECK IN' : 'CHECK OUT'} · AKTIF` : 'BELUM AKTIF'}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="camera-device" className="text-xs font-medium text-slate-600">Kamera</label>
          <select id="camera-device" value={selectedDeviceId} onChange={(event) => void openCamera(event.target.value)} className="max-w-64 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
            <option value="">Default browser camera</option>{videoDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Kamera ${index + 1}`}</option>)}
          </select>
          <button type="button" onClick={() => void openCamera(selectedDeviceId || undefined)} className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">{cameraStream ? 'Hubungkan Ulang' : 'Aktifkan Kamera'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)] min-[1200px]:grid-cols-[minmax(0,68fr)_minmax(300px,32fr)] gap-5 items-start min-w-0">
        <section>
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><Video className="w-4 h-4 text-blue-600" /><h3 className="text-sm font-semibold text-slate-900">Live Camera</h3></div><span className="text-[11px] text-slate-500">1280×720 · scan {SCAN_INTERVAL_MS} ms</span></div>
          <div className="relative aspect-video w-full rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
            {cameraStream ? <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" style={{ transform: mirrored ? 'scaleX(-1)' : undefined }} /> : <div className="text-center text-slate-300 p-6"><CameraOff className="w-8 h-8 mx-auto mb-2 text-slate-500" /><p className="text-sm font-semibold">Kamera tidak aktif</p><p className="text-xs text-slate-500 mt-1">Pilih dan aktifkan kamera browser.</p></div>}
            <div className="absolute inset-[12%] border border-white/20 rounded-[42%] pointer-events-none" />
            {cameraStream && overlayBox && <div className={`absolute border-2 rounded-lg pointer-events-none transition-all duration-150 ${overlayColor}`} style={{ left: `${(videoOffsetX + (mirrored ? 1 - overlayBox.x - overlayBox.width : overlayBox.x) * videoScaleX) * 100}%`, top: `${(videoOffsetY + overlayBox.y * videoScaleY) * 100}%`, width: `${overlayBox.width * videoScaleX * 100}%`, height: `${overlayBox.height * videoScaleY * 100}%` }} />}
            <div className={`absolute left-3 right-3 bottom-3 px-3 py-2 rounded-lg text-xs font-semibold text-center ${stateColor}`} aria-live="polite">{scanMessage}</div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600"><div className="flex items-start gap-2"><Scan className="w-4 h-4 text-teal-600 shrink-0" /><span>Pemindaian otomatis, satu request pada satu waktu.</span></div><div className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-amber-600 shrink-0" /><span>Pastikan hanya satu siswa terlihat.</span></div><div className="flex items-start gap-2"><Clock className="w-4 h-4 text-blue-600 shrink-0" /><span>Cooldown dan attendance diputuskan backend.</span></div></div>
        </section>

        <aside className="bg-white rounded-xl border border-slate-200 p-6 min-h-full">
          <div><div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5"><div><p className="text-xs uppercase tracking-wide text-blue-600 font-semibold">Status · {scanState}</p><h3 className="text-lg font-semibold text-slate-900 mt-1">Hasil Pengenalan</h3></div><UserCheck className="w-5 h-5 text-emerald-600" /></div>{scanResult ? <div className="border-l-4 border-emerald-600 pl-4 py-1 space-y-2 text-sm text-slate-800"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">✓ Wajah Dikenali</p><p className="text-xl font-semibold text-slate-900">{scanResult.studentName}</p><p className="font-mono text-xs">NIS {scanResult.nis}</p><p className="text-sm">{scanResult.className}</p><div className="pt-4 mt-4 border-t border-slate-200 flex items-end justify-between"><div><p className="text-xs text-slate-500">{scanResult.mode === 'CHECK_IN' ? 'Masuk' : 'Pulang'}</p><p className="text-2xl font-semibold font-mono">{new Date(scanResult.recordedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p></div><div className="text-right"><p className="text-xs text-slate-500">Similarity</p><p className="font-semibold">{scanResult.similarity.toFixed(3)}</p></div></div></div> : <div className="py-8 text-sm text-slate-600"><p className="font-medium text-slate-800">Menunggu hasil pengenalan.</p><p className="mt-1">{scanMessage}</p></div>}</div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1"><p>Status: {scanState}</p>{import.meta.env.DEV && lastLatencyMs !== null && <p>Latency HTTP terakhir: {lastLatencyMs.toFixed(0)} ms</p>}</div>
        </aside>
      </div>

      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-base font-semibold text-slate-900">Daftar Kehadiran Terbaru Sesi Ini</h3><span className="text-xs text-slate-500">Diperbarui melalui WebSocket</span></div><DataTable columns={columns} data={recentDetections} emptyTitle="Belum ada data kehadiran pada sesi ini." emptyDescription="Hasil scan berhasil akan muncul dari event backend." /></div>

      <StartSessionModal isOpen={showSessionModal} onClose={() => setShowSessionModal(false)} onStarted={(id, mode) => { setSessionId(id); setActiveMode(mode); setScanResult(null); if (!streamRef.current) void openCamera(selectedDeviceId || undefined); else { setScanState('READY'); setScanMessage('Pemindaian otomatis aktif.'); } }} />
    </div>
  );
};
