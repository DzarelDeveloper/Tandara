# Live Attendance Performance V2 Report

**Scope:** Teacher/Guru-Piket live attendance only. Phase 2 code readiness is implemented; physical performance remains unverified. No Face Enrollment behavior was changed by this task.

## Scheduler and Observation Rate

**Scheduler before:** Serial recursive `setTimeout` was already preventing overlapping requests, but the post-response wait was `EMA latency + 55% latency`, minimum 300 ms. For a 500 ms request the modeled cycle was about 1,275 ms, or 0.78 observations/s.

**Scheduler after:** Still serial, still one in-flight scan, with a target start-to-start period taken from `VITE_SCAN_INTERVAL_MS` (active root value 300 ms; configurable/clamped 250–2,000 ms) and a 60 ms minimum idle yield. After each request, it captures the current video frame only after waiting `max(60 ms, targetPeriod - processingDuration)`. There is no queued frame backlog and no latency-derived delay added a second time.

For an illustrative 500 ms processing cycle at the active 300 ms target: wait 60 ms, cycle ~560 ms, theoretical ~1.79 starts/s. For 320 ms processing: wait 60 ms, cycle ~380 ms, ~2.63 starts/s. These are calculated values, **not measured camera rates**. An error/backoff path can wait longer; UNKNOWN and duplicate outcomes no longer impose global holds.

**Effective physical scan rate before:** REQUIRES_PHYSICAL_TEST. Audit model example was 0.78/s at 500 ms request latency.

**Effective physical scan rate after:** REQUIRES_PHYSICAL_TEST. The scheduler formula targets faster starts; no camera-backed measurement was available.

## Resolution and Detector

**Selected ML resolution:** Default remains 1280×720. `VITE_LIVE_SCAN_MAX_WIDTH` and `VITE_LIVE_SCAN_MAX_HEIGHT` can select candidate scan-canvas dimensions for physical comparison. The camera/display constraints remain independent at 1920×1080 ideal, 20 FPS ideal / 24 max. No lower production resolution was selected because the existing 640×360 benchmark used synthetic black frames only and says nothing about distant-face detection, quality acceptance, or identity reliability.

**YuNet before:** 1280×720 synthetic empty-frame warm median 253.24 ms, range 235.25–394.81 ms; first detect call after model initialization 329.20 ms. At 640×360 synthetic empty frames: warm median 62.84 ms, range 57.94–84.26 ms. These are the audit's measurements.

**YuNet after:** Same detector, model, thresholds, and default dimensions. No post-change face-positive physical timing was collected. No claim of detector speedup.

**SFace latency:** REQUIRES_PHYSICAL_TEST; embedding remains separately timed in development telemetry. Identity thresholds and margins are unchanged.

## Evidence, Liveness, and Safety

- Identity FAST path: **PASS in automated coverage**; still requires 2 strong GOOD observations, existing similarity/margin/sharpness thresholds, and >=0.3 s span.
- Standard temporal verification: **PASS in automated coverage**; existing 3 consistent fresh observations spanning >=0.6 s remains unchanged.
- Transient miss handling: **PASS in tests**; one fresh UNKNOWN/AMBIGUOUS is a bounded miss and does not enter the identity evidence window. A second consecutive weak miss clears the candidate evidence. Cached recognition remains non-fresh and does not count.
- Strong identity contradiction: **PASS in tests**; a fresh recognized different student clears prior candidate observations before adding the new candidate. Evidence remains per-track.
- Liveness: **PASS; unchanged and still required**. Benchmark mode cannot signal ready until the same verified identity and `LIVE` state pass.
- Spoof blocking: **PASS in tests**; `SPOOF_SUSPECTED` does not reach attendance or benchmark-ready state.
- Multi-face: **PASS in existing scan tests**; per-face processing remains independent and one duplicate/unknown face does not globally stop other faces.
- Unknown-person safety: **PASS in tests**; UNKNOWN remains non-attendance evidence; repeated UNKNOWN clears accumulated candidate evidence.
- Duplicate attendance: **PASS in existing tests**; duplicate decision stays per student/track/session/mode, without a global scan pause.
- Benchmark persistence protection: **PASS in tests**. `?benchmark=1` is honored only in Vite DEV and backend non-production; it still requires active session, identity verification, and LIVE liveness, then returns `benchmarkReady` without `take()`, DB writes, audit, notifications, or attendance WebSocket publication. Production rejects the benchmark flag.

Normal attendance invariant remains: `RECOGNIZED` alone is insufficient; the server still requires VERIFIED identity, LIVE liveness, active student/session, and existing schedule/duplicate rules. Thresholds were not weakened.

## Measurements and Tests

Development panel timings use `performance.now()` in the browser and `time.perf_counter()` in the backend. Browser metrics include capture draw, JPEG encode, request, scan processing cycle, start interval/rate, payload bytes, source/submitted dimensions, face count, track/evidence, and liveness state. Backend metrics include decode, enrollment index, detection, per-face quality, embedding, matching, tracking, temporal, liveness, attendance write, realtime publication, and backend total. No face image, embedding, identity ID, similarity, ambiguity margin, or landmark values are displayed in the performance panel.

**Backend tests:** 195 passed, 1 dependency deprecation warning.

**Focused backend regressions:** 63 passed for attendance scan/flow, temporal, liveness, tracking, and recognition service.

**Frontend scheduler tests:** 6 passed.

**Relevant frontend lifecycle/admin regressions:** 15 passed.

**Lint:** PASS.

**Build:** PASS; Vite emitted its existing config-loader and >500 kB chunk warnings.

**`git diff --check`:** PASS.

## Physical Performance Unverified

The browser session was logged out and no authorized live teacher session/camera was active. No attendance scan was sent for benchmark purposes. Therefore these remain **REQUIRES_PHYSICAL_TEST**:

- Physical standing verification
- Physical slow/normal walking verification
- Physical slight-turn verification
- Farther-face verification
- Motion-blur verification
- Unknown-person behavior under real camera conditions
- Two-face behavior and track continuity
- Already-attended student followed by a new student
- Before/after physical scan rate and VERIFIED/LIVE/attendance-ready times
- 1280×720, 960×540, 800×450, and 640×360 face-positive quality/distance comparison

The benchmark mode is code-ready for an authorized dev camera session and will not create attendance records, but it has not been physically exercised. **Overall: CODE READY; PHYSICAL PERFORMANCE UNVERIFIED.**

## Phase 2 Files

Files touched by this Phase 2 work (some were already dirty before the task):

- `src/pages/teacher/TeacherLiveAttendancePage.tsx`
- `src/services/attendance.service.ts`
- `src/utils/live-attendance-scheduler.ts`
- `src/utils/live-attendance-scheduler.test.ts`
- `backend/app/routers/attendance.py`
- `backend/app/services/face_recognition.py`
- `backend/app/services/face_temporal.py`
- `backend/app/services/face_tracking.py`
- `backend/tests/test_attendance_face_scan.py`
- `backend/tests/test_face_temporal.py`
- `backend/tests/test_face_recognition_service.py`
- `LIVE_ATTENDANCE_PERFORMANCE_V2_REPORT.md`

No Face Enrollment files were modified by this task. The existing dirty enrollment modifications were not reset or reverted. Database schema: unchanged. ONNX models: unchanged. Recognition thresholds: unchanged. Commit/push: none.
