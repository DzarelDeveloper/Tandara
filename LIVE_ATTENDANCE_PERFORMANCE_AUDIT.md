# Live Attendance Performance Audit

**Scope:** Teacher/Guru-Piket live browser-camera attendance only. Analysis only; no application behavior or recognition settings were changed. No attendance records were created during this audit.

## 1. Current Pipeline

```text
Browser MediaStream (requested 1920x1080, ideal 20 FPS)
  -> TeacherLiveAttendancePage.scanFrame()
  -> captureFrame(): draw video to canvas, cap at 1280x720, JPEG quality 0.82
  -> attendanceService.scanFrame(): multipart POST /api/attendance/scan
  -> FastAPI auth + active session validation + UploadFile.read()
  -> FaceRecognitionService.recognize_image_many()
       -> OpenCV imdecode (BGR)
       -> load active enrolled embedding index from DB/cache
       -> YuNet detect_faces()
       -> tracker update / track assignment
       -> per face: quality gate
       -> per face when not identity-cached: YuNet landmark alignCrop + SFace feature
       -> cosine comparison against enrolled embedding matrix
       -> temporal verify_observation()
       -> passive update_liveness()
  -> attendance router: verified identity AND LIVE required
  -> duplicate/cooldown check; schedule/student/attendance DB work; commit/audit
  -> ATTENDANCE_SUCCESS WebSocket broadcast + Parent notification publication
  -> JSON response
  -> frontend state/faces/recent list update
  -> adaptive delay or outcome hold; next scan
```

Owning code: [TeacherLiveAttendancePage.tsx](src/pages/teacher/TeacherLiveAttendancePage.tsx), [camera.ts](src/utils/camera.ts), [attendance.service.ts](src/services/attendance.service.ts), [api.ts](src/services/api.ts), [attendance.py](backend/app/routers/attendance.py), [face_recognition.py](backend/app/services/face_recognition.py), [face_engine.py](backend/app/services/face_engine.py), [face_quality.py](backend/app/services/face_quality.py), [face_tracking.py](backend/app/services/face_tracking.py), [face_temporal.py](backend/app/services/face_temporal.py), and [face_liveness.py](backend/app/services/face_liveness.py).

The browser preview is independent of ML processing: the stream requests 1920x1080 but the scan canvas caps each submitted image at 1280x720. The actual camera dimensions were not available in this logged-out browser session.

## 2. Timing Measurements

### Safe local YuNet-only benchmark

Ran the loaded local engine directly against synthetic black frames. It bypassed HTTP, recognition, liveness, and attendance persistence; every frame had zero detections. The first sample is the first `detect_faces()` call after model initialization, not process/model startup cold-load time. Ten subsequent warm samples were used for the median/range.

| Input | First detect call | Warm median | Warm min–max | Result |
|---|---:|---:|---:|---|
| 1280x720 | 329.20 ms | 253.24 ms | 235.25–394.81 ms | 0 faces, synthetic black frame |
| 640x360 | 58.42 ms | 62.84 ms | 57.94–84.26 ms | 0 faces, synthetic black frame |

Runtime: OpenCV 5.0.0, `cv2.getNumThreads() == 2`, host reports 2 CPUs. The 640x360 result demonstrates detector input-size sensitivity but is **not** a recommendation to change the production resolution: no positive-face quality/recognition benchmark was run.

### Full pipeline timings

Physical camera capture, JPEG encoding, upload, positive-face quality, SFace, temporal/liveness, database write, and complete round-trip timings are **REQUIRES_PHYSICAL_TEST**. The browser is currently on `/login`; no teacher session/camera request was made.

Existing development telemetry exposes `index`, `detection`, `embedding`, `matching`, `timings_ms.total`, `frame_total_ms`, and `verification_latency_ms`. `timings_ms.total` is assembled as index + detection + embedding + matching; it excludes quality, tracking, temporal, and liveness. `frame_total_ms` is measured after service-side temporal/liveness work, but excludes image decode and everything performed later by the attendance router. There are no individual `decode_ms`, `quality_ms`, `tracking_ms`, `temporal_ms`, `liveness_ms`, `attendance_write_ms`, or WebSocket timings. `detection_to_attendance_ms` is declared in the frontend telemetry interface but is not emitted by the backend. Frontend `lastLatencyMs` starts **after** `captureFrame()` completes, so it is request round-trip, not full capture-to-display latency. No instrumentation was added because a physical end-to-end timing run was not available and the task prohibits behavior/code changes except necessary dev instrumentation.

## 3. Frontend Scan Scheduling

Active root `.env` has `VITE_SCAN_INTERVAL_MS=300`; frontend clamps this to a minimum of 300 ms. `SCAN_INTERVAL_TARGET_MS` is nevertheless at least 420 ms. Scan scheduling uses recursive `setTimeout`: `tick()` awaits `scanFrame()` and only then schedules the next tick. `scanInFlightRef` also guards entry. There is no `setInterval` or animation-frame request loop, so normal browser-side scans do not overlap.

Camera constraints: width 1920 ideal, height 1080 ideal, frame rate 20 ideal / 24 max. The source video is captured through canvas and proportionally scaled down only if either maximum is exceeded; it is then JPEG quality 0.82. Actual `videoWidth`, `videoHeight`, encoded byte size, and encoding time were unavailable. Backend upload limit is 5 MiB.

The frontend measures `observedMs` from immediately before `attendanceService.scanFrame()` until parsed response. This includes FormData/fetch/network/server/response parsing, but excludes canvas capture and `toBlob()` encoding. The timeout is 8 seconds by default (`VITE_SCAN_TIMEOUT_MS` can override within 2–60 seconds); this external abort signal supersedes the API helper's default 30-second signal.

Normal adaptive scheduling updates latency EMA with alpha 0.35. It waits `EMA + max(60 ms, 0.55 * EMA)`, clamped to 300–1400 ms. At steady state for measured round-trip latency `L`, the next wait is approximately `max(300 ms, 1.55L)` (subject to the 1400 ms cap), so total cycle is approximately `L + max(300 ms, 1.55L)`. Example: if a physical request measured 500 ms, steady cadence would be about 1275 ms, or 0.78 scans/s, not 2 scans/s. This is a formula example, not an observed request measurement.

If complete request latency hypothetically equalled only the 1280x720 synthetic detector median (253 ms, with capture/encoding/network/quality/SFace all treated as zero), the steady scheduler formula gives about 645 ms per cycle (~1.55 scans/s). This is an illustrative component-based calculation, not a measured physical scan rate or strict bound: actual face-positive detector latency varies, and all omitted request work adds time. The 640x360 detector-only sample plus the 300 ms minimum wait gives a hypothetical >=363 ms cycle (~2.75/s), but that resolution is not the active production path and has no face-positive validation.

Outcome holds add another 100 ms after the stated hold due to the nested result cooldown/tick schedule: UNKNOWN is about 1.8 seconds after its response, duplicate about 2.5 seconds, and errors at least about 2.5 seconds. Quality failures use normal adaptive scheduling. A timeout aborts at 8 seconds, then the code uses an estimated 0.6×timeout latency for adaptation and holds the result; the next attempt is delayed rather than immediately retried.

## 4. Detector Cost and Resolution

`FaceEngine.initialize()` creates YuNet with initial input size 320x320. On **every detection** `detect_faces()` calls `setInputSize()` again. For source dimensions whose longest side is above 1280, it first resizes to longest side 1280 with `INTER_AREA`; otherwise it sends the frame as-is and sets the detector input size to the full frame dimensions. Current frontend cap means a normal 1920x1080 source becomes 1280x720, so backend does not downscale it further. This call includes OpenCV's detect implementation and per-frame `setInputSize`; no separate copy/resize occurs in the backend at 1280x720.

The 253 ms warm measurement is material on this CPU, but it is for an empty black frame and may not represent NMS/detection work on an actual face or webcam noise. SFace and other service work add to it. The current YuNet score threshold is 0.65, NMS 0.30, top-K 5000. No model/threshold was changed.

## 5. Recognition Cost and Caching

For each detected face, service calls `validate_face_quality()` before recognition-cache lookup. If the quality gate passes and the per-track identity cache has expired, it calls `alignCrop()` and `feature()` once, normalizes the 128-dimensional embedding, then performs a vectorized dot product against all compatible active enrolled embeddings; it also obtains the second-best similarity. With N detected faces, detection/index happen once; quality is evaluated N times, and embedding/matching can run up to N times per request. Matching work grows approximately linearly with enrolled embedding count for each query face.

Enrollment vectors are cached in process memory per student, keyed by embedding path/update timestamp; existing `.npy` files are not re-read each scan while unchanged. The database enrollment query does run every scan to enumerate active registered students and detect cache invalidations. Live per-track recognized identity cache lasts `FACE_OBSERVATION_INTERVAL_SECONDS` (active 0.3 s); rejected-result cache lasts 0.45 s. Temporal evidence explicitly refuses to count cached recognition as a fresh observation. SFace alignment and inference are combined in existing `embedding` telemetry; no physical positive-face cost was measured.

## 6. Quality and Recognition Gates

These are separate stages. Values below are effective Pydantic settings from root `.env` plus defaults; `backend/.env` is **not** the configured env file. Its ambiguity-margin value of 0 does not override the active value 0.05.

| Gate | Active value | What it blocks | Temporal effect |
|---|---|---|---|
| YuNet detector score | 0.65 | Candidate not detected; no per-face track/evidence | A no-face observation preserves an existing track's observations temporarily, but invalidates cached identity/verification; TTL can later expire the track |
| Detector NMS | 0.30 | Overlapping detections suppressed/merged by detector | Same as detection miss if no face emitted |
| Post-detection confidence floor | 0.75 | `FACE_LOW_CONFIDENCE`; SFace skipped | No fresh temporal sample; existing evidence is preserved, not cleared. Liveness sample is not appended |
| Minimum face size | min(width,height) >= 36 px **and** width/frame width >= 0.015 **and** height/frame height >= 0.015 | `FACE_TOO_SMALL`; SFace skipped | No fresh temporal sample; existing evidence is preserved |
| Blur | Laplacian variance >= 28.0 | Below threshold -> `FACE_TOO_BLURRY`; SFace skipped | No fresh temporal sample; evidence is preserved; liveness does not append and reports pending |
| Brightness | grayscale mean 35–220 inclusive | Too dark/bright; SFace skipped | No fresh temporal sample; evidence is preserved |
| Landmarks | all 5 YuNet landmarks finite; eye distance / face width >= 0.18; roll <= 35 degrees; symmetric yaw ratio >= 0.20; nose vertical position between eye and mouth midpoints | `FACE_BAD_POSE`; SFace skipped | No fresh temporal sample; existing evidence preserved |
| Identity similarity | cosine >= 0.363 | Below -> UNKNOWN_FACE | UNKNOWN is fresh evidence with no student identity; it conflicts with all candidate evidence in the 3-second window |
| Identity ambiguity margin | best minus second >= 0.05 | Lower -> AMBIGUOUS_FACE | Fresh no-identity observation poisons consistency window until aged out |
| Fast-path GOOD classification | min face dimension >=50 px; blur >=37.8; confidence >=0.75; yaw ratio >=0.40; roll <=20 degrees | Does **not** block standard identity matching; prevents the fast temporal path | GOOD is needed for fast-path evidence only; ACCEPTABLE can still verify through standard temporal path |

Thus a moderately imperfect face can still reach standard identity verification if it passes the base acceptability gates and similarity/margin. The fast path is substantially more demanding, and quality errors prevent new identity evidence. No separate quality scalar is used; blur is a Laplacian variance statistic, brightness is grayscale mean, and landmarks provide geometry checks.

## 7. Temporal Verification and Fast Path

Active values: standard 3 consistent fresh observations, all within a 3.0-second evidence window and spanning at least 0.6 seconds. Each supporting observation must be the same candidate and every observation in the window must support that candidate; UNKNOWN/AMBIGUOUS/other identity observations block verification. A cached recognition is not fresh evidence. Best-ranked supporting observations must still meet the base 0.363 similarity threshold.

Fast path is **reachable in code**: at least 2 observations must each be `GOOD`, sharpness >=60, similarity >=max(0.75,0.363), and ambiguity margin >=max(0.15,0.05), with those two spanning >=0.3 seconds. It then sets `verification_path='FAST'`. It is not contradictory to the 3-observation standard minimum: the minimum is selected as 2 only if the fast conditions are already met. It is reachable for exceptionally strong, sharp, high-margin faces; physical reachability/rate is unmeasured.

The router does not accept `RECOGNIZED` alone. It additionally requires track `verified_student_id` and state VERIFIED/ATTENDED, then requires liveness exactly LIVE before attendance. Therefore fast identity verification does **not** bypass liveness or attendance safety.

At theoretical service settings, standard identity needs at least 0.6 seconds of evidence; fast identity needs 0.3 seconds. These accumulate concurrently with liveness, not serially. Overall temporal+liveness lower bound is at least 0.6 seconds for standard or 0.5 seconds for fast, assuming usable fresh observations and successful motion signals. With the measured 720p detector-only scheduler floor, three observation timestamps would be separated by about 2×645 ms = 1.29 seconds; full response/attendance adds further time. These are derived bounds, not physical measurements.

## 8. Tracking Continuity

`LightweightFaceTracker` matches by IoU >=0.08 **or** normalized center distance <=1.25 times the larger face-box diagonal, with greedy score assignment. Track TTL is 2.25 seconds. A brief missing detection retains the ID and temporal/liveness samples but calls `break_continuity`, dropping identity cache and verified state. Missing longer than TTL removes the track; return then creates a new ID with empty history.

Low-overlap movement while unverified (IoU <0.18) drops identity cache but preserves temporal evidence and liveness. A large jump (IoU <0.08 and normalized center distance >0.75) clears evidence and liveness. Ambiguous competing track assignment clears verification/cache and liveness but preserves identity observations. For already-verified tracks, low overlap plus normalized distance >0.45 removes verified state and liveness while preserving observations. Existing tests cover moving faces, short gap continuity, TTL expiration, identity cache invalidation, and crossing-track safety.

Normal movement alone is not automatically a track reset. Fast motion that produces a large normalized jump, extended occlusion >2.25 s, or ambiguous crossing is the likely discontinuity case. Head turns/scale changes can lower IoU but center matching allows some continuity; outcome depends on actual detector boxes.

## 9. Liveness

Passive motion liveness is enabled. It keeps up to 24 samples per track, prunes samples older than 3 seconds, and needs at least 3 good/usable observations spanning >=0.5 seconds. It normalizes five YuNet landmarks by eye midpoint, eye distance, and roll; needs plausible nose pose, mouth geometry between 0.2 and 1.5, and at least two adjacent transitions where both pose and mouth-geometry changes are >=0.005, coherent in direction, and each component step <0.18. Overall pose range and geometry range must each reach 0.025. Otherwise state remains LIVENESS_PENDING. If both ranges remain <0.01 for >=1.5 seconds, state becomes SPOOF_SUSPECTED.

Sampling is throttled to at most one sample per 150 ms. Poor-quality observations do not append and set liveness pending, but do not clear stored samples; old samples expire by window. Explicit continuity breaks usually clear liveness; no-face gaps preserve samples but invalidate verified state. This can be the gate after FAST identity: it requires three observations and actual coherent landmark motion, while a straight walk toward camera is scale-normalized and may not create the required geometry change. Excessively abrupt per-observation changes (>0.18) fail plausibility. This is a code-derived risk, not confirmation that current users fail specifically there. The service comments correctly state this is experimental passive motion checking, not a trained presentation-attack detector.

## 10. Reset Conditions

| Trigger | Track | Temporal identity evidence | Liveness evidence | Classification |
|---|---|---|---|---|
| One no-face frame | Retained until TTL; identity cache and verified state invalidated | Preserved | Preserved, then time-pruned | SOFT/MISS |
| Missing >2.25 s | Track expires; new ID on return | Lost with track | Lost with track | HARD RESET |
| Blur/dark/bright/bad pose/low confidence/too small | Track remains; identity cache and verified-until cleared | No observation appended; prior evidence preserved | No sample appended; status pending; prior samples remain until expiry | SOFT/MISS |
| UNKNOWN or AMBIGUOUS | Track remains | Appends no-ID evidence; blocks candidate consistency until evidence ages out (up to 3 s) | Can still accumulate if quality is usable | SOFT but evidence-conflicting |
| Different recognized student on same track | Same track | Prior observations remain and conflict with new identity | Liveness samples cleared | SOFT + liveness reset |
| Ambiguous tracker assignment | Track IDs may remain | Preserved | Cleared | SOFT continuity break |
| Large jump/no overlap | Track reused or new slot assignment | Cleared | Cleared | HARD RESET |
| Verified track drift (IoU <0.18, normalized distance >0.45) | Track retained | Preserved | Cleared; verified identity removed | SOFT re-verification |
| Verified hold expires | Track retained | Cleared by `break_continuity(clear_evidence=True)` | Cleared | HARD RESET |
| Session/service invalidation | Tracker map cleared | Cleared | Cleared | HARD RESET |
| Browser request timeout | Frontend aborts current request and backs off; backend may already have processed it | No direct frontend reset; server work is synchronous within the async endpoint and is not guaranteed cancelled by browser abort | Same | NO RESET guaranteed; server outcome may be unknown to UI |

## 11. Moving-Face Scenarios: First Likely Gate

| Scenario | First likely rejecting/resetting gate from code |
|---|---|
| Looks straight | Base quality, then SFace threshold/margin; after recognition, temporal/liveness still required |
| Slight head turn | Base quality first if symmetric yaw <0.20, roll >35, or eyes too narrow; otherwise identity/SFace or fast-GOOD criteria may fail. Standard path can use ACCEPTABLE |
| Walks normally | Per-scan 1280x720 detection and adaptive wait lower observation rate; tracker should retain ordinary motion; liveness requires coherent normalized pose **and** mouth-geometry changes |
| Walks quickly | YuNet blur/size/confidence first; then tracker large-jump reset or liveness per-step >0.18 plausibility rejection |
| Brief look away | YuNet quality pose check can fail; evidence is preserved as a miss, but liveness pauses. Longer absence >2.25 s loses track |
| Slight blur | Laplacian variance <28 rejects SFace and adds no identity evidence. Prior identity history is preserved, but liveness waits; GOOD fast path needs >=60 sharpness |
| Face smaller/farther | min dimension <36 px or relative width/height <1.5% -> no embedding/evidence. Near 36–49 px may pass base quality but cannot be GOOD for fast path |

## 12. Multi-Face Cost and State

YuNet runs once per frame. Tracker assignment compares each detected box with existing tracks, approximately O(number of detections × active tracks), then greedily sorts candidate matches. Quality runs once per face; each face with expired identity cache can run a separate SFace alignment/embedding and compare that vector against the full enrollment matrix. Temporal and liveness histories are per track. Expected service shape is detector + N×(quality + possible SFace + matrix compare + temporal/liveness), not one recognition for the whole frame. Exact 1/2/3-face latency is unmeasured; multi-face ambiguity can also add quality/identity failures independent of cost.

## 13. Database and Realtime Work

Every scan first loads/validates session from DB, then recognition queries registered active enrollments; cached vectors avoid repeated `.npy` decoding but not the enrollment-row query. Attendance DB work happens only after identity VERIFIED and liveness LIVE: student lookup, schedule row lookup, existing same-day attendance lookup, flush, parent-recipient lookup/notification rows if linked, audit row, commit. The router then awaits attendance WebSocket broadcast and Parent notification publication before returning the HTTP response. Therefore frontend request latency includes this work on successful attendance, unlike `frame_total_ms` telemetry. Duplicate checks include per-track `attendance_attempted` and a `(student,session,mode)` 4-second monotonic cooldown; the legacy `scan_cooldown_seconds=30` is not used by this route. No DB/realtime timings exist, so materiality is unmeasured; these stages are after verification and cannot explain the waiting time for initial identity evidence.

## 14. UI-Perceived Latency

On each request, UI transitions DETECTING -> PROCESSING before awaiting the response; the response sets SUCCESS, DUPLICATE, UNKNOWN, ERROR, or PROCESSING/VERIFYING from returned track/liveness state. There is no intentional per-frame UI sleep beyond scan scheduling and outcome holds. The existing latency label measures request round trip but not capture/encoding. An old state can remain visible during inter-scan waits; the next cycle overwrites it with DETECTING. Responses are sequential, so normal response reordering is not expected.

For unverified recognized faces, backend returns a successful response with VERIFYING and the frontend displays “Memverifikasi wajah...” while another scan is scheduled. For a one-face UNKNOWN/AMBIGUOUS/quality error, backend returns 422 with face payload; frontend handles UNKNOWN/AMBIGUOUS with a 1.7 s hold, while quality errors resume adaptive scheduling. Successful attendance response itself waits for database commit and awaited realtime publication. The UI also receives WebSocket success and merges it with scan response; merge logic de-duplicates recent rows.

## 15. CPU and Resolution

Host: Intel Pentium 2020M, 2 physical cores/2 threads, integrated graphics; OpenCV reports 2 worker threads. Current memory sample was 3.9 GiB used of 5.1 GiB with 1.2 GiB available. YuNet/SFace run CPU through OpenCV ONNX; no GPU is required or assumed. Frontend browser encoding, Vite/React, and backend compete on only two cores. No CPU profiler or face-positive pipeline was run. Current 1280x720 YuNet benchmark is the strongest measured indication of CPU cost; frontend encoding/network/recognition add unmeasured load.

## 16. Root Causes / Bottleneck Ranking

1. **Frontend scheduler adds a full latency estimate plus another 55% latency gap after every response.** This is a proven code-derived delay. At 500 ms request latency, it yields ~1.275 s cycles (~0.78 scans/s), before considering special holds.
2. **YuNet at the current 1280x720 submitted size is CPU-heavy on this laptop.** Measured synthetic warm median is ~253 ms, with up to ~395 ms. Actual face-positive latency is not measured. Processing at 640x360 measured ~63 ms but cannot be adopted without face-size/quality validation.
3. **Passive liveness is an independent, stricter completion gate even when FAST identity verification succeeds.** It requires 3 samples, >=0.5 s, two coherent transitions in both normalized nose pose and mouth geometry; ordinary scale-only walk-through motion may not satisfy it.
4. **Transient UNKNOWN/AMBIGUOUS is added to the 3-second temporal window and conflicts with all identity support.** It can delay recovery beyond the usual 0.6-second standard evidence minimum.
5. **Base quality failures skip recognition for that frame; fast-path GOOD is significantly stricter than base acceptance.** This creates retries and prevents fast mode for ACCEPTABLE faces, although base quality misses do not hard-clear temporal evidence.
6. **Pipeline telemetry does not isolate capture/encode, decode, quality, tracker, temporal, liveness, attendance DB, or realtime.** Current evidence cannot attribute an actual physical scan's elapsed time exactly among those stages.

## 17. Physical Benchmark Still Required

**REQUIRES_PHYSICAL_TEST.** With an authorized live teacher session and camera, collect at least 20 consecutive warm observations without using real attendance writes if a non-persisting preview/dry-run path can be provided. Current scan endpoint can persist once identity and liveness pass, so it is not safe to benchmark against live students without a dry-run option/authorized test session. Record actual source/frame dimensions and `Blob.size`; use `performance.now()` around capture, `toBlob`, request and scheduler. Add monotonic server timing around decode, index, detection, quality, tracking, SFace, temporal, liveness, DB commit, WebSocket publication. Keep the exercise short and avoid exposing student images/embeddings.

Current auditable metrics:
- Capture: unmeasured
- Encode: unmeasured
- HTTP round trip: unmeasured
- Backend decode: unmeasured
- YuNet: **253.24 ms warm median** on synthetic 1280x720 black frames; not physical camera
- Positive-face quality / SFace: unmeasured
- Tracking / temporal / liveness: no separate timers
- Attendance write / realtime: unmeasured
- End-to-end scan latency / physical effective observations per second: **REQUIRES_PHYSICAL_TEST**

## 18. Phase 2 Plan (Proposal Only)

1. Add development-only monotonic timing fields around capture, encoding, HTTP round trip, decode, embedding index, detection, each face's quality/embedding/matching, tracker, temporal, liveness, attendance transaction, and realtime publish. Add `Blob.size`, actual source/sent dimensions, and measured inter-observation start interval. Do not include wall-clock values in durations.
2. Replay a representative authorized walk-through set on this exact CPU, including moving/blurred/turned/far faces, and correlate each rejection/reset with telemetry. Compare one face vs two vs three, and 1280x720 vs candidate processing sizes; confirm base 36 px and quality/unknown/spoof protection before choosing any resolution change.
3. After measurement, evaluate the adaptive scheduler formula: it waits `EMA + 0.55×EMA` after a response, so the derived cycle is ~2.55×request latency. Consider a latency-budgeted wait that preserves serial latest-frame processing and enforces a CPU cap; do not lower thresholds or overlap requests.
4. If liveness is the measured final gate, evaluate motion-evidence accumulation for moving subjects while retaining its current spoof rejection invariants. Validate coherent pose/geometry signals on real walk-throughs before changes; do not disable liveness or treat RECOGNIZED as attendance.
5. If transient UNKNOWN/AMBIGUOUS is confirmed as the dominant restart delay, design explicit bounded conflict/miss handling per same track, with tests preventing identity evidence from crossing tracks or students.

No Phase 2 changes were implemented in this audit.
