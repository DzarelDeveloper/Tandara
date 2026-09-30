import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, AlertCircle, ShieldCheck, Loader2, RotateCw } from 'lucide-react';
import { Drawer } from '../ui/Drawer';
import { Student } from '../../types';
import {
  FaceEnrollmentStatus,
  EnrollmentPreviewResult,
  faceEnrollmentService,
} from '../../services/face-enrollment.service';
import {
  CAMERA_STORAGE_KEY,
  cameraConstraints,
  enumerateVideoDevices,
  stopMediaStream,
} from '../../utils/camera';
import {
  ENROLL_GUIDE,
  ENROLL_POSE_SEQUENCE,
  POSE_TARGET_LABELS,
  computeRenderedGuide,
  sourceNormalizedBoxToRenderedBox,
  createInitialReadiness,
  evaluatePosition,
  updateReadiness,
  type EnrollEvaluation,
  type EnrollFaceInput,
  type EnrollPoseTarget,
  type EnrollReadinessState,
  type EnrollPositionCode,
} from '../../utils/enrollment-guide';
import {
  canStartAutomaticCapture,
  canCaptureManually,
  rememberRecentValidFrame,
  selectBestValidFrame,
  submitEnrollmentSample,
  tryAcquireCaptureRequest,
  type RecentEnrollmentFrame,
} from '../../utils/enrollment-capture';

interface FaceEnrollmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  selectedStudent: Student | null;
  onCompleted: () => Promise<void>;
}

const QUALITY_MESSAGES: Record<string, string> = {
  FACE_NOT_DETECTED: 'Tidak ada wajah yang dapat digunakan.',
  MULTIPLE_FACES: 'Lebih dari satu wajah terdeteksi.',
  FACE_TOO_BLURRY: 'Wajah kurang jelas.',
  FACE_BAD_POSE: 'Hadapkan wajah langsung ke kamera.',
  FACE_LOW_CONFIDENCE: 'Posisikan wajah lebih jelas di depan kamera.',
  FACE_TOO_DARK: 'Pencahayaan terlalu gelap.',
  FACE_TOO_BRIGHT: 'Pencahayaan terlalu terang.',
  FACE_TOO_SMALL: 'Wajah terlalu jauh.',
  FACE_OUT_OF_FRAME: 'Posisikan seluruh wajah di dalam frame.',
  SAMPLE_IDENTITY_MISMATCH: 'Sampel wajah tidak konsisten dengan sampel sebelumnya.',
};

const ENROLLMENT_PREVIEW_INTERVAL_MS = 180;
const ENROLLMENT_PREVIEW_TIMEOUT_MS = 1800;
const CAPTURE_MAX_WIDTH = 1280;
const CAPTURE_MAX_HEIGHT = 720;
const ENROLL_JPEG_QUALITY = 0.9;
const POST_CAPTURE_COOLDOWN_MS = 650;
const PREVIEW_WIDTH = 800;
const PREVIEW_HEIGHT = 450;
const PREVIEW_JPEG = 0.72;

const ENROLLMENT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 22, max: 26 },
};

function enrollmentCameraConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      ...ENROLLMENT_VIDEO_CONSTRAINTS,
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    },
  };
}

function captureVideoFrame(
  video: HTMLVideoElement,
  maxW = CAPTURE_MAX_WIDTH,
  maxH = CAPTURE_MAX_HEIGHT,
  quality = ENROLL_JPEG_QUALITY,
): Promise<Blob | null> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return Promise.resolve(null);
  const scale = Math.min(1, maxW / sourceWidth, maxH / sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

type GuideVisual = 'neutral' | 'adjust' | 'ready' | 'capturing' | 'success';

export const FaceEnrollmentDrawer: React.FC<FaceEnrollmentDrawerProps> = ({
  isOpen,
  onClose,
  students,
  selectedStudent,
  onCompleted,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const openingCameraRef = useRef(false);
  const previewInFlightRef = useRef(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureInFlightRef = useRef(false);
  const readinessRef = useRef<EnrollReadinessState>(createInitialReadiness());
  const positionWasValidRef = useRef(false);
  const recentValidFramesRef = useRef<RecentEnrollmentFrame<Blob>[]>([]);
  const lastCaptureAtRef = useRef<number | null>(null);
  const lastCaptureFlashAtRef = useRef<number | null>(null);
  const lastSampleSuccessAtRef = useRef<number | null>(null);

  const [selectedDeviceId, setSelectedDeviceId] = useState(
    () => localStorage.getItem(CAMERA_STORAGE_KEY) ?? '',
  );
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [studentId, setStudentId] = useState(selectedStudent?.id || '');
  const [sampleCount, setSampleCount] = useState(0);
  const [minimumSamples, setMinimumSamples] = useState(3);
  const [enrollment, setEnrollment] = useState<FaceEnrollmentStatus | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [prepareVersion, setPrepareVersion] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [sampleFlash, setSampleFlash] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const [preview, setPreview] = useState<EnrollmentPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [evaluation, setEvaluation] = useState<EnrollEvaluation | null>(null);
  const [stableProgress, setStableProgress] = useState(0);

  const student = students.find((item) => item.id === studentId) || selectedStudent;
  const targetPoseIndex = sampleCount % ENROLL_POSE_SEQUENCE.length;
  const targetPose = ENROLL_POSE_SEQUENCE[targetPoseIndex];
  const allSamplesComplete = sampleCount >= minimumSamples;

  const guideBox = useMemo(() => computeRenderedGuide(), []);

  const clearPreviewScheduling = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
  }, []);

  const clearAutoEvidence = useCallback(() => {
    readinessRef.current = createInitialReadiness();
    positionWasValidRef.current = false;
    recentValidFramesRef.current = [];
  }, []);

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setCameraActive(false);
    setVideoFrameReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    const devices = await enumerateVideoDevices();
    if (mountedRef.current) setVideoDevices(devices);
  }, []);

  const openCamera = useCallback(async (deviceId?: string) => {
    if (openingCameraRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini tidak mendukung akses kamera.');
      return;
    }
    openingCameraRef.current = true;
    setCameraActive(false);
    setVideoFrameReady(false);
    clearAutoEvidence();
    clearPreviewScheduling();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        enrollmentCameraConstraints(deviceId),
      );
      if (!mountedRef.current) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      }
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (streamRef.current === stream) {
            setCameraActive(false);
            setVideoFrameReady(false);
          }
        }, { once: true });
      });
      const settings = stream.getVideoTracks()[0]?.getSettings();
      const activeDeviceId = settings?.deviceId ?? deviceId ?? '';
      if (activeDeviceId) {
        setSelectedDeviceId(activeDeviceId);
        localStorage.setItem(CAMERA_STORAGE_KEY, activeDeviceId);
      }
      setCameraError('');
      await refreshDevices();
    } catch (error) {
      setCameraError('Kamera tidak tersedia atau izin kamera ditolak.');
    } finally {
      openingCameraRef.current = false;
    }
  }, [clearAutoEvidence, clearPreviewScheduling, refreshDevices]);

  const performCapture = useCallback(
    async (fromAuto: boolean, readyFrame?: Blob) => {
      if (!student || !videoRef.current || isCompleting || !prepared || !isOpen || isClosing || !mountedRef.current) return;
      if (sampleCount >= minimumSamples) return;
      const now = performance.now();
      if (fromAuto && lastCaptureAtRef.current !== null && now - lastCaptureAtRef.current < POST_CAPTURE_COOLDOWN_MS) return;
      const vid = videoRef.current;
      if (!vid.videoWidth || !vid.videoHeight) {
        setFeedback('Frame kamera belum siap.');
        return;
      }
      if (!tryAcquireCaptureRequest(captureInFlightRef)) return;
      readinessRef.current = createInitialReadiness();
      positionWasValidRef.current = false;
      recentValidFramesRef.current = [];
      setStableProgress(0);
      setIsCapturing(true);
      lastCaptureAtRef.current = now;
      lastCaptureFlashAtRef.current = now;
      setCaptureFlash(true);
      setTimeout(() => {
        if (mountedRef.current) setCaptureFlash(false);
      }, 220);
      setFeedback(fromAuto ? 'Mengambil sampel...' : 'Memeriksa sampel...');
      try {
        const blob = readyFrame ?? await captureVideoFrame(vid, CAPTURE_MAX_WIDTH, CAPTURE_MAX_HEIGHT, ENROLL_JPEG_QUALITY);
        if (!blob) {
          setFeedback('Frame kamera tidak dapat diproses.');
          return;
        }
        await submitEnrollmentSample(
          () => faceEnrollmentService.addSample(student.id, blob),
          (result) => {
            lastSampleSuccessAtRef.current = performance.now();
            setSampleFlash(true);
            setTimeout(() => {
              if (mountedRef.current) setSampleFlash(false);
            }, 650);
            setSampleCount(result.sampleCount);
            setMinimumSamples(result.minimumSamples);
            setPreviewError('');
            readinessRef.current = createInitialReadiness();
            recentValidFramesRef.current = [];
            setFeedback(result.sampleCount >= result.minimumSamples
              ? '✓ Semua sampel wajah berhasil disimpan'
              : fromAuto
                ? `✓ Sampel ${result.sampleCount} tersimpan otomatis`
                : `✓ Sampel ${result.sampleCount} tersimpan`);
          },
        );
      } catch (error) {
        const code = faceEnrollmentService.getErrorCode(error);
        const message =
          QUALITY_MESSAGES[code || ''] ||
          (error instanceof Error ? error.message : 'Sampel tidak valid.');
        setFeedback(message);
      } finally {
        captureInFlightRef.current = false;
        if (mountedRef.current) setIsCapturing(false);
      }
    },
    [isClosing, isCompleting, isOpen, minimumSamples, prepared, sampleCount, student],
  );

  const previewFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!streamRef.current || !video || !prepared || !student || allSamplesComplete) return;
    if (previewInFlightRef.current) return;
    if (captureInFlightRef.current || isCompleting) return;
    const now = performance.now();
    if (lastCaptureAtRef.current !== null && now - lastCaptureAtRef.current < 250) return;
    previewInFlightRef.current = true;
    const controller = new AbortController();
    previewAbortRef.current = controller;
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    let timedOut = false;
    previewTimeoutRef.current = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      ENROLLMENT_PREVIEW_TIMEOUT_MS,
    );
    try {
      const blob = await captureVideoFrame(video, PREVIEW_WIDTH, PREVIEW_HEIGHT, PREVIEW_JPEG);
      if (!mountedRef.current || controller.signal.aborted || !blob) return;
      const result = await faceEnrollmentService.previewEnrollment(blob, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setPreviewError('');
      setPreview(result);

      const renderW = video.clientWidth || 1;
      const renderH = video.clientHeight || 1;
      const viewport = {
        videoW: result.frameSizePx?.width ?? video.videoWidth,
        videoH: result.frameSizePx?.height ?? video.videoHeight,
        renderW,
        renderH,
        mirrored: true,
      };
      const renderedFaceBox = result.faceBox
        ? sourceNormalizedBoxToRenderedBox(result.faceBox, viewport)
        : null;
      const input: EnrollFaceInput = {
        faceCount: result.faceCount,
        faceBox: renderedFaceBox,
        assessmentAcceptable: result.assessment?.isAcceptable ?? false,
        assessmentGood: result.assessment?.status === 'GOOD',
        errorCode: result.assessment?.errorCode ?? null,
        // The backend yaw convention is user-centric and unmirrored; preview mirroring only transforms face-box coordinates.
        poseLabel: targetPose,
        poseYawRatio: result.pose?.yawRatio ?? 0.5,
        poseRollDeg: result.pose?.rollDegrees ?? 0,
        positionWasValid: positionWasValidRef.current,
        viewport,
      };
      const evalNow = evaluatePosition(input);
      positionWasValidRef.current = evalNow.positionValid;
      setEvaluation(evalNow);
      const observedAt = performance.now();
      const readiness = updateReadiness(
        readinessRef.current,
        evalNow,
        observedAt,
        lastCaptureAtRef.current,
        POST_CAPTURE_COOLDOWN_MS,
      );
      readinessRef.current = readiness.next;
      setStableProgress(readiness.stableProgress);
      if (evalNow.autoCaptureCandidate && (readiness.next.candidateStartedAtMs !== null || readiness.shouldCapture)) {
        const assessment = result.assessment;
        const guideWidth = computeRenderedGuide().widthPct / 100;
        const faceWidth = renderedFaceBox?.width ?? guideWidth;
        const sizePenalty = Math.abs(faceWidth / guideWidth - 0.76) * 40;
        const score = (assessment?.sharpness ?? 0) + (assessment?.detectionConfidence ?? 0) * 100 - sizePenalty;
        recentValidFramesRef.current = rememberRecentValidFrame(
          recentValidFramesRef.current,
          { frame: blob, score, pose: targetPose },
          3,
        );
      } else if (readiness.next.candidateStartedAtMs === null && !readiness.shouldCapture) {
        recentValidFramesRef.current = [];
      }
      if (canStartAutomaticCapture({
        ready: readiness.shouldCapture,
        requestInFlight: captureInFlightRef.current,
        cooldownActive: lastCaptureAtRef.current !== null && observedAt - lastCaptureAtRef.current < POST_CAPTURE_COOLDOWN_MS,
        enrollmentComplete: allSamplesComplete || sampleCount >= minimumSamples,
      })) {
        const bestFrame = selectBestValidFrame(recentValidFramesRef.current, targetPose);
        if (bestFrame) void performCapture(true, bestFrame.frame);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (timedOut) {
        readinessRef.current = createInitialReadiness();
        positionWasValidRef.current = false;
        recentValidFramesRef.current = [];
        setPreview(null);
        setEvaluation(null);
        setPreviewError('Deteksi otomatis sedang lambat. Anda tetap dapat mengambil sampel manual.');
        return;
      }
      if (controller.signal.aborted) return;
      readinessRef.current = createInitialReadiness();
      positionWasValidRef.current = false;
      recentValidFramesRef.current = [];
      setPreview(null);
      setEvaluation(null);
      const message = error instanceof Error ? error.message : 'Preview kamera gagal.';
      setPreviewError(message);
    } finally {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
      if (previewAbortRef.current === controller) previewAbortRef.current = null;
      previewInFlightRef.current = false;
    }
  }, [allSamplesComplete, isCompleting, minimumSamples, performCapture, prepared, sampleCount, student, targetPose]);

  useEffect(() => {
    readinessRef.current = createInitialReadiness();
    positionWasValidRef.current = false;
    recentValidFramesRef.current = [];
    setStableProgress(0);
  }, [targetPose]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !studentId) return;
    let active = true;
    setIsClosing(false);
    setPreparing(true);
    setPrepared(false);
    setEnrollment(null);
    setSampleCount(0);
    setPreview(null);
    setPreviewError('');
    setFeedback('');
    setEvaluation(null);
    setStableProgress(0);
    readinessRef.current = createInitialReadiness();
    lastCaptureAtRef.current = null;
    lastCaptureFlashAtRef.current = null;
    lastSampleSuccessAtRef.current = null;
    Promise.all([
      faceEnrollmentService.getStatus(studentId),
      faceEnrollmentService.discardSamples(studentId),
    ])
      .then(([status]) => {
        if (active) {
          setEnrollment(status);
          setMinimumSamples(Math.max(3, status.sampleCount || 3, 3));
          setPrepared(true);
        }
      })
      .catch((error) => {
        if (active) setFeedback(error instanceof Error ? error.message : 'Persiapan enrollment gagal.');
      })
      .finally(() => {
        if (active) setPreparing(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, studentId, prepareVersion]);

  useEffect(() => {
    if (!isOpen) {
      clearPreviewScheduling();
      stopCamera();
      clearAutoEvidence();
      return;
    }
    void refreshDevices();
    void openCamera(selectedDeviceId || undefined);
    const handleDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      clearPreviewScheduling();
      stopCamera();
      clearAutoEvidence();
    };
  }, [clearAutoEvidence, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!cameraActive || !streamRef.current || !prepared || !student || allSamplesComplete) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || !mountedRef.current) return;
      await previewFrame();
      if (cancelled || !mountedRef.current) return;
      previewTimerRef.current = setTimeout(tick, ENROLLMENT_PREVIEW_INTERVAL_MS);
    };
    previewTimerRef.current = setTimeout(tick, 220);
    return () => {
      cancelled = true;
      clearPreviewScheduling();
    };
  }, [allSamplesComplete, cameraActive, isOpen, prepared, previewFrame, student]);

  const handleComplete = async () => {
    if (!student || sampleCount < minimumSamples || isCompleting || captureInFlightRef.current) return;
    setIsCompleting(true);
    clearPreviewScheduling();
    try {
      await faceEnrollmentService.complete(student.id);
      setFeedback('Enrollment wajah berhasil disimpan.');
      await onCompleted();
      onClose();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enrollment belum dapat diselesaikan.');
    } finally {
      if (mountedRef.current) setIsCompleting(false);
    }
  };

  const handleClose = async () => {
    if (isCapturing || isCompleting || preparing) return;
    setIsClosing(true);
    clearPreviewScheduling();
    clearAutoEvidence();
    if (student && sampleCount > 0) {
      try {
        await faceEnrollmentService.discardSamples(student.id);
      } catch {
        /* ignore */
      }
    }
    onClose();
  };

  const evalCode: EnrollPositionCode = evaluation?.code ?? 'NO_FACE';
  const guideVisual: GuideVisual = (() => {
    if (isCapturing || captureFlash) return 'capturing';
    if (sampleFlash) return 'success';
    switch (evalCode) {
      case 'NO_FACE':
      case 'MULTIPLE_FACES':
        return 'neutral';
      case 'VALID_POSING':
        return stableProgress > 0 ? 'ready' : 'adjust';
      case 'READY':
        return 'ready';
      default:
        return 'adjust';
    }
  })();

  const guideBorderColor = {
    neutral: 'border-white/45',
    adjust: 'border-amber-400',
    ready: 'border-emerald-500',
    capturing: 'border-emerald-300',
    success: 'border-emerald-400',
  }[guideVisual];

  const guideOuterShadow = {
    neutral: '',
    adjust: 'drop-shadow-[0_0_0_9999px_rgba(251,191,36,0.10)]',
    ready: 'drop-shadow-[0_0_0_9999px_rgba(16,185,129,0.18)]',
    capturing: 'drop-shadow-[0_0_0_9999px_rgba(16,185,129,0.28)]',
    success: 'drop-shadow-[0_0_0_9999px_rgba(16,185,129,0.25)]',
  }[guideVisual];

  const evalMessage =
    evaluation?.message ?? (preview?.faceCount === 0 ? 'Posisikan wajah di area' : preview?.faceCount && preview.faceCount > 1 ? 'Pastikan hanya satu orang di depan kamera.' : 'Posisikan wajah di area');

  const poseDetected = preview?.pose?.label;

  const previewViewport = videoRef.current ? {
    videoW: preview?.frameSizePx?.width ?? videoRef.current.videoWidth,
    videoH: preview?.frameSizePx?.height ?? videoRef.current.videoHeight,
    renderW: videoRef.current.clientWidth || 1,
    renderH: videoRef.current.clientHeight || 1,
    mirrored: true,
  } : null;
  const renderedPreviewFaceBox = preview?.faceBox && previewViewport
    ? sourceNormalizedBoxToRenderedBox(preview.faceBox, previewViewport)
    : null;
  const cooldownActive = lastCaptureAtRef.current !== null &&
    performance.now() - lastCaptureAtRef.current < POST_CAPTURE_COOLDOWN_MS;
  const autoCaptureEligible = Boolean(
    cameraActive && videoFrameReady && evaluation?.autoCaptureCandidate &&
    !captureInFlightRef.current && !cooldownActive && !allSamplesComplete && !isCompleting,
  );
  const qualityReady = Boolean(evaluation?.qualityValid && preview?.assessment?.status === 'GOOD');
  const stabilityElapsedMs = readinessRef.current.candidateStartedAtMs === null
    ? 0
    : Math.max(0, performance.now() - readinessRef.current.candidateStartedAtMs);
  const autoCaptureBlockers = [
    !cameraActive && 'CAMERA',
    !videoFrameReady && 'FRAME',
    preview?.faceCount !== 1 && 'FACE',
    !evaluation?.positionValid && 'POSITION',
    !qualityReady && 'QUALITY',
    !evaluation?.poseValid && 'POSE',
    (captureInFlightRef.current || isCapturing) && 'REQUEST',
    cooldownActive && 'COOLDOWN',
    allSamplesComplete && 'COMPLETE',
    isCompleting && 'COMPLETING',
  ].filter(Boolean);

  const progressFill = minimumSamples > 0 ? sampleCount / minimumSamples : 0;
  const nextPose = ENROLL_POSE_SEQUENCE[(sampleCount + 1) % ENROLL_POSE_SEQUENCE.length];

  const ringPct = Math.min(1, Math.max(0, stableProgress)) * 100;
  const manualCaptureEnabled = canCaptureManually({
    cameraActive,
    videoFrameReady,
    requestInFlight: captureInFlightRef.current || isCapturing,
    enrollmentComplete: allSamplesComplete,
    drawerOpen: isOpen,
    drawerClosing: isClosing,
    mounted: mountedRef.current,
    sessionPrepared: prepared && !preparing,
    completing: isCompleting,
    studentAvailable: Boolean(student),
  });

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title="Pendaftaran Wajah"
      subtitle="Ambil sampel otomatis ketika posisi, kualitas, dan pose memenuhi syarat."
      width="2xl"
    >
      <div className="space-y-5">
        {!selectedStudent && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Pilih siswa
            </label>
            <select
              disabled={isCapturing || isCompleting || preparing}
              value={studentId}
              onChange={(event) => {
                setStudentId(event.target.value);
                setSampleCount(0);
                setFeedback('');
                setPrepared(false);
              }}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg"
            >
              <option value="">Pilih siswa</option>
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName} · {item.nis} · {item.className}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Identitas Siswa
            </p>
            {student ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mt-1 break-words">
                  {student.fullName}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {student.nis} · {student.className}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-1">Pilih siswa untuk memulai.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="enrollment-camera-fix"
              className="text-xs font-medium text-slate-600"
            >
              Kamera
            </label>
            <select
              id="enrollment-camera-fix"
              value={selectedDeviceId}
              onChange={(event) => void openCamera(event.target.value)}
              className="max-w-52 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Default browser</option>
              {videoDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Kamera ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {enrollment?.status === 'REGISTERED' && (
          <p className="text-xs text-blue-700">
            Wajah sudah terdaftar ({enrollment.sampleCount} sampel). Enrollment sebelumnya
            diganti setelah penyimpanan baru berhasil.
          </p>
        )}
        {preparing && (
          <p role="status" className="text-xs text-slate-500">
            Menyiapkan enrollment…
          </p>
        )}
        {student && !preparing && !prepared && (
          <button
            type="button"
            onClick={() => setPrepareVersion((value) => value + 1)}
            className="text-sm text-blue-700"
          >
            Coba Persiapan Lagi
          </button>
        )}

        {import.meta.env.DEV && (
          <section aria-label="Auto enrollment diagnostics" className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <p>AUTO ENROLLMENT</p>
            <p>Camera: {cameraActive ? 'READY' : 'BLOCKED'}</p>
            <p>Frame: {videoFrameReady ? 'READY' : 'BLOCKED'}</p>
            <p>Face: {preview?.faceCount === 1 ? 'READY' : 'BLOCKED'}</p>
            <p>Single face: {preview?.faceCount === 1 ? 'YES' : 'NO'}</p>
            <p>Position: {evaluation?.positionValid ? 'READY' : 'BLOCKED'}</p>
            <p>Quality: {qualityReady ? 'GOOD' : preview?.assessment?.status ?? 'WAITING'}</p>
            <p>Pose: {evaluation?.poseValid ? 'READY' : 'BLOCKED'}</p>
            <p>Target pose: {targetPose}</p>
            <p>Detected pose: {poseDetected ?? 'WAITING'}</p>
            <p>Stability: {readinessRef.current.candidateStartedAtMs === null ? 'WAITING' : `${Math.round(stabilityElapsedMs)} / ${ENROLL_GUIDE.autoCaptureMaxStableMs} ms`}</p>
            <p>Request: {captureInFlightRef.current ? 'IN FLIGHT' : 'IDLE'}</p>
            <p>Cooldown: {cooldownActive ? 'ACTIVE' : 'IDLE'}</p>
            <p>Eligible: {autoCaptureEligible ? 'YES' : 'NO'}</p>
            <p className="col-span-2 sm:col-span-4">Blocked by: {autoCaptureEligible ? 'NONE' : autoCaptureBlockers.join(', ') || 'POSE / QUALITY / FACE'}</p>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-3">
            <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden border border-slate-800">
              <video
                ref={videoRef}
                muted
                playsInline
                onLoadedData={(event) => setVideoFrameReady(Boolean(event.currentTarget.videoWidth && event.currentTarget.videoHeight))}
                onEmptied={() => setVideoFrameReady(false)}
                className="w-full h-full object-cover scale-x-[-1]"
              />

              <div
                className={`absolute pointer-events-none transition-all duration-200 ${guideOuterShadow}`}
                style={{
                  left: `${guideBox.leftPct}%`,
                  top: `${guideBox.topPct}%`,
                  width: `${guideBox.widthPct}%`,
                  height: `${guideBox.heightPct}%`,
                }}
              >
                <div
                  className={`absolute inset-0 rounded-[50%_50%_46%_46%/42%_42%_58%_58%] border-[2.5px] transition-colors duration-200 ${guideBorderColor}`}
                />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[calc(100%+6px)] flex flex-col gap-1 opacity-80">
                  <div className="h-px w-3 bg-white/70" />
                  <div className="h-px w-5 bg-white/60" />
                </div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+6px)] flex flex-col gap-1 items-end opacity-80">
                  <div className="h-px w-3 bg-white/70" />
                  <div className="h-px w-5 bg-white/60" />
                </div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[calc(100%+6px)] flex flex-col items-center gap-1 opacity-80">
                  <div className="w-px h-3 bg-white/70" />
                  <div className="w-px h-5 bg-white/60" />
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+6px)] flex flex-col items-center gap-1 opacity-80">
                  <div className="w-px h-5 bg-white/60" />
                  <div className="w-px h-3 bg-white/70" />
                </div>

                {stableProgress > 0 && guideVisual === 'ready' && (
                  <svg
                    className="absolute -inset-[6%] w-[112%] h-[112%] pointer-events-none -rotate-90"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="47.2"
                      fill="none"
                      stroke="rgba(16,185,129,0.15)"
                      strokeWidth="1.2"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="47.2"
                      fill="none"
                      stroke="rgb(16,185,129)"
                      strokeWidth="1.8"
                      strokeDasharray={`${ringPct * 2.965} 296.5`}
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>

              {renderedPreviewFaceBox && (
                <div
                  className={`absolute border-2 rounded-md pointer-events-none ${evalCode === 'VALID_POSING' ? 'border-emerald-400/90' : 'border-amber-300/80'}`}
                  style={{
                    left: `${renderedPreviewFaceBox.x * 100}%`,
                    top: `${renderedPreviewFaceBox.y * 100}%`,
                    width: `${renderedPreviewFaceBox.width * 100}%`,
                    height: `${renderedPreviewFaceBox.height * 100}%`,
                  }}
                />
              )}

              <div className="absolute left-3 top-3 px-2.5 py-1 rounded-md bg-slate-950/80 text-xs font-semibold text-white flex items-center gap-2">
                <Camera className="w-3.5 h-3.5" />
                ENROLL · LIVE
              </div>

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-center p-6">
                  <CameraOff className="w-9 h-9 text-slate-400 mb-3" />
                  <p className="text-sm text-white font-semibold">Kamera tidak tersedia</p>
                  <p className="text-xs text-slate-400 mt-1">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => void openCamera(selectedDeviceId || undefined)}
                    className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-md bg-white/10 text-white border border-white/20 inline-flex items-center gap-1.5"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Coba Hubungkan
                  </button>
                </div>
              )}
              {captureFlash && (
                <div className="absolute inset-0 bg-white/75 pointer-events-none animate-pulse" />
              )}
              {sampleFlash && !captureFlash && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-bold shadow-md pointer-events-none flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Sampel {sampleCount} tersimpan
                </div>
              )}
              <div
                className={`absolute left-3 right-3 bottom-3 px-3 py-2 rounded-lg text-xs font-semibold text-center ${
                  evalCode === 'VALID_POSING'
                    ? stableProgress > 0.7
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-700/95 text-white'
                    : evalCode === 'NO_FACE' || evalCode === 'MULTIPLE_FACES'
                      ? 'bg-slate-900/90 text-white'
                      : 'bg-amber-600 text-white'
                }`}
                aria-live="polite"
              >
                {evalMessage}
              </div>
            </div>

            <div className="space-y-2">
              {feedback && (
                <div
                  aria-live="polite"
                  className={`p-3 rounded-lg border text-sm flex gap-2 ${
                    feedback.includes('berhasil') ||
                    feedback.includes('tersimpan') ||
                    feedback.includes('terpenuhi') ||
                    feedback.includes('disimpan')
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {feedback}
                </div>
              )}
              {previewError && (
                <div
                  aria-live="polite"
                  className="p-3 rounded-lg border border-slate-200 text-sm text-slate-600 flex gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {previewError}
                </div>
              )}
            </div>
          </div>

          <aside className="lg:col-span-2 lg:border-l lg:border-slate-200 lg:pl-6 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Sampel wajah</p>
                  <ShieldCheck
                    className={`w-5 h-5 ${
                      allSamplesComplete ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {Array.from({ length: minimumSamples }, (_, index) => (
                    <div
                      key={index}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className={`w-full h-2 rounded-sm ${
                          index < sampleCount
                            ? 'bg-emerald-500'
                            : 'bg-slate-200'
                        }`}
                      />
                      <div
                        className={`text-[11px] font-bold ${
                          index < sampleCount
                            ? 'text-emerald-700'
                            : index === sampleCount
                              ? allSamplesComplete
                                ? 'text-emerald-700'
                                : 'text-blue-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {index < sampleCount
                          ? '✓'
                          : index === sampleCount
                            ? allSamplesComplete
                              ? '✓'
                              : '→'
                            : `${index + 1}`}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm font-medium text-slate-800 mt-2">
                  {sampleCount}/{minimumSamples} sampel valid
                </p>
                <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, progressFill * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs space-y-1.5">
                <p className="font-semibold text-blue-900">
                  {allSamplesComplete
                    ? 'Semua sampel lengkap'
                    : `Sampel ${sampleCount + 1}: ${POSE_TARGET_LABELS[targetPose]}`}
                </p>
                <p className="text-slate-600">
                  {allSamplesComplete &&
                    'Klik "Selesaikan Enrollment" di bawah untuk menyimpan identitas wajah.'}
                  {sampleCount === 0 &&
                    !allSamplesComplete &&
                    'Hadapkan wajah lurus ke arah kamera pada jarak yang nyaman. Sistem mengambil sampel otomatis.'}
                  {sampleCount === 1 &&
                    !allSamplesComplete &&
                    'Putar sedikit ke kiri untuk variasi sudut pandang (~10°–15°).'}
                  {sampleCount === 2 &&
                    !allSamplesComplete &&
                    'Putar sedikit ke kanan untuk variasi sudut pandang (~10°–15°).'}
                  {sampleCount >= 3 &&
                    sampleCount < minimumSamples &&
                    `Lanjutkan variasi pose: ${POSE_TARGET_LABELS[nextPose]}.`}
                </p>
                {poseDetected && !allSamplesComplete && (
                  <p className="pt-1 border-t border-blue-200/60 text-slate-700">
                    Terdeteksi: <span className="font-semibold text-slate-900">{POSE_TARGET_LABELS[poseDetected]}</span> · target:{' '}
                    <span className="font-semibold text-slate-900">{POSE_TARGET_LABELS[targetPose]}</span>
                  </p>
                )}
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <p className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Jarak wajah santai &amp; alami (tidak perlu menempel).
                </p>
                <p className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Pencahayaan ruangan cukup merata, tidak ada backlight berlebih.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => performCapture(false)}
                disabled={!manualCaptureEnabled}
                className="w-full inline-flex items-center justify-center gap-2 min-h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Camera className="w-3.5 h-3.5" />
                {isCapturing ? 'Memeriksa sampel…' : `Ambil Sampel ${sampleCount + 1} Manual`}
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={
                  !student ||
                  !prepared ||
                  preparing ||
                  isCapturing ||
                  sampleCount < minimumSamples ||
                  isCompleting
                }
                className="w-full inline-flex items-center justify-center min-h-10 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold disabled:opacity-40"
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan…
                  </>
                ) : (
                  'Selesaikan Enrollment'
                )}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="t-button-secondary w-full"
              >
                Batal
              </button>
            </div>
          </aside>
        </div>
      </div>
    </Drawer>
  );
};
