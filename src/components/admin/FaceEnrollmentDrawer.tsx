import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { Drawer } from '../ui/Drawer';
import { Student } from '../../types';
import { faceEnrollmentService } from '../../services/face-enrollment.service';

interface FaceEnrollmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  selectedStudent: Student | null;
  onCompleted: () => Promise<void>;
}

const qualityMessages: Record<string, string> = {
  FACE_NOT_DETECTED: 'Wajah belum terdeteksi.',
  MULTIPLE_FACES: 'Pastikan hanya satu orang di depan kamera.',
  FACE_TOO_BLURRY: 'Gambar terlalu buram. Tahan posisi dan coba lagi.',
  FACE_TOO_DARK: 'Pencahayaan terlalu gelap.',
  FACE_TOO_BRIGHT: 'Pencahayaan terlalu terang.',
  FACE_TOO_SMALL: 'Dekatkan wajah ke kamera.',
  FACE_OUT_OF_FRAME: 'Posisikan seluruh wajah di dalam frame.',
  SAMPLE_IDENTITY_MISMATCH: 'Sampel wajah tidak konsisten dengan sampel sebelumnya.',
};

export const FaceEnrollmentDrawer: React.FC<FaceEnrollmentDrawerProps> = ({ isOpen, onClose, students, selectedStudent, onCompleted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [studentId, setStudentId] = useState(selectedStudent?.id || '');
  const [sampleCount, setSampleCount] = useState(0);
  const [minimumSamples, setMinimumSamples] = useState(3);
  const [cameraError, setCameraError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const student = students.find((item) => item.id === studentId) || selectedStudent;

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    setStudentId(selectedStudent?.id || '');
    setSampleCount(0);
    setFeedback('');
  }, [selectedStudent, isOpen]);

  useEffect(() => {
    if (!isOpen || !studentId) return;
    void faceEnrollmentService.discardSamples(studentId).catch(() => undefined);
  }, [isOpen, studentId]);

  useEffect(() => {
    if (!isOpen) { stopCamera(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Browser ini tidak mendukung akses kamera.'); return; }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); }
    }).catch(() => setCameraError('Kamera tidak tersedia atau izin kamera ditolak.'));
    return () => { cancelled = true; stopCamera(); };
  }, [isOpen]);

  const handleCapture = () => {
    if (!student || !videoRef.current || !canvasRef.current || isCapturing) return;
    setIsCapturing(true); setFeedback('Memvalidasi sampel di backend...');
    const video = videoRef.current; const canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (!blob) { setFeedback('Frame kamera tidak dapat diproses.'); setIsCapturing(false); return; }
      try {
        const result = await faceEnrollmentService.addSample(student.id, blob);
        setSampleCount(result.sampleCount); setMinimumSamples(result.minimumSamples); setFeedback(`Sampel ${result.sampleCount} valid.`);
      } catch (error) {
        const code = faceEnrollmentService.getErrorCode(error);
        setFeedback(qualityMessages[code || ''] || (error instanceof Error ? error.message : 'Sampel tidak valid.'));
      } finally { setIsCapturing(false); }
    }, 'image/jpeg', 0.92);
  };

  const handleComplete = async () => {
    if (!student || sampleCount < minimumSamples || isCompleting) return;
    setIsCompleting(true);
    try { await faceEnrollmentService.complete(student.id); setFeedback('Enrollment wajah berhasil disimpan.'); await onCompleted(); setTimeout(onClose, 700); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Enrollment belum dapat diselesaikan.'); }
    finally { setIsCompleting(false); }
  };

  const handleClose = async () => {
    if (student && sampleCount > 0) {
      try { await faceEnrollmentService.discardSamples(student.id); } catch { }
    }
    onClose();
  };

  return <Drawer isOpen={isOpen} onClose={handleClose} title="Pendaftaran Wajah" subtitle="Ambil tiga sampel wajah yang jelas untuk identitas siswa." width="2xl">
    <div className="space-y-5">
      {!selectedStudent && <div><label className="block text-xs font-semibold text-slate-700 mb-1.5">Pilih siswa</label><select value={studentId} onChange={(event) => { setStudentId(event.target.value); setSampleCount(0); setFeedback(''); }} className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg"><option value="">Pilih siswa</option>{students.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.nis} · {item.className}</option>)}</select></div>}
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identitas Siswa</p>{student ? <><h3 className="text-lg font-semibold text-slate-900 mt-1 break-words">{student.fullName}</h3><p className="text-sm text-slate-500 mt-0.5">{student.nis} · {student.className}</p></> : <p className="text-sm text-slate-500 mt-1">Pilih siswa untuk memulai.</p>}</div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-3">
          <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden border border-slate-800">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-[12%] border-2 border-white/60 rounded-[42%] pointer-events-none" />
            <div className="absolute left-3 top-3 px-2.5 py-1 rounded-md bg-slate-950/80 text-xs font-semibold text-white">LIVE CAMERA</div>
            {cameraError && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-center p-6"><CameraOff className="w-9 h-9 text-slate-400 mb-3" /><p className="text-sm text-white font-semibold">Kamera tidak tersedia</p><p className="text-xs text-slate-400 mt-1">{cameraError}</p></div>}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          {feedback && <div aria-live="polite" className={`p-3 rounded-lg border text-sm flex gap-2 ${feedback.includes('berhasil') || feedback.includes('valid') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{feedback}</div>}
        </div>
        <aside className="lg:col-span-2 lg:border-l lg:border-slate-200 lg:pl-6 flex flex-col justify-between gap-5">
          <div className="space-y-5">
            <div><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">Sampel wajah</p><ShieldCheck className={`w-5 h-5 ${sampleCount >= minimumSamples ? 'text-emerald-600' : 'text-slate-400'}`} /></div><div className="grid grid-cols-3 gap-2 mt-3">{Array.from({ length: minimumSamples }, (_, index) => <div key={index} className={`h-2 rounded-sm ${index < sampleCount ? 'bg-emerald-500' : 'bg-slate-200'}`} />)}</div><p className="text-sm font-medium text-slate-800 mt-3">{sampleCount}/{minimumSamples} sampel valid</p></div>
            <div className="text-xs text-slate-600 space-y-2"><p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />Pastikan hanya satu wajah terlihat.</p><p>Gunakan pencahayaan merata dan pandang kamera.</p><p>Ubah posisi sedikit pada setiap sampel.</p></div>
          </div>
          <div className="space-y-2"><button type="button" onClick={handleCapture} disabled={!student || Boolean(cameraError) || isCapturing} className="t-button-primary w-full"><Camera className="w-4 h-4" />{isCapturing ? 'Memvalidasi…' : 'Ambil Sampel'}</button><button type="button" onClick={handleComplete} disabled={!student || sampleCount < minimumSamples || isCompleting} className="w-full inline-flex items-center justify-center min-h-10 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold disabled:opacity-40">{isCompleting ? 'Menyimpan…' : 'Selesaikan Enrollment'}</button><button type="button" onClick={handleClose} className="t-button-secondary w-full">Batal</button></div>
        </aside>
      </div>
    </div>
  </Drawer>;
};
