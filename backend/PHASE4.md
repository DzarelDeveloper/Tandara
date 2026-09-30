# Phase 4 MVP: validation and limitations

The normal scan gate requires server track identity VERIFIED and liveness LIVE.
UNKNOWN, AMBIGUOUS, bad quality, LIVENESS_PENDING and SPOOF_SUSPECTED cannot
record face attendance. Manual entry stays a separate audited staff action.
Existing attendance schedules and database duplicate protection still apply.

Identity uses fresh SFace evidence only. Strong GOOD observations (similarity
>= 0.75, ambiguity margin >= 0.15, sharpness >= 60) can verify after two samples
spanning >= 0.3 seconds. Otherwise the Phase 3 minimum/window apply. All
observations must agree; base recognition thresholds are unchanged. The best
quality supporting observations are selected from the bounded history.
Cached recognition never adds identity evidence. Verified identity is held for
up to 4 seconds without more embedding. A missing detection, uncertain crossing
assignment, weak bbox match, or expiry invalidates the hold. Bad quality never
produces attendance. Brief gaps retain pending identity evidence within its window.

Passive liveness uses YuNet's five landmarks; it does not infer blinks. Translation,
scale and roll are normalized out. Both relative nose/eye pose and mouth/eye
geometry must change coherently over multiple plausible transitions. Default:
3 quality samples spanning >= 0.5 seconds. Near-static sequences after 1.5 seconds
become SPOOF_SUSPECTED. Evidence expires after 3 seconds. No video is stored.

**This is an experimental motion heuristic, not validated presentation attack
detection.** Detector jitter, perspective changes in a moving photo, a warped
print, replay video and track replacement can defeat these signals. Genuine
students walking directly forward with little facial deformation can stay
pending. Synthetic tests do not establish real false-accept or false-reject rates.
Physical testing is required before calling this anti-spoof reliable.

References: [OpenCV YuNet output](https://docs.opencv.org/4.12.0/d0/dd4/tutorial_dnn_face.html)
and [NIST passive PAD evaluation](https://www.nist.gov/publications/face-analysis-technology-evaluation-fate-part-10-performance-passive-software-based).
These describe detection output and evaluation context; they do not validate this heuristic.

## Configuration and fallback

Configuration defaults are in `app/config.py`; names are shown in `.env.example`.
Observation interval, standard/fast minimum evidence and time window, track TTL,
verified hold, attendance cooldown and liveness thresholds are configurable.
Restart backend for backend settings; restart Vite if changing its scan interval.

Set `FACE_LIVENESS_ENABLED=false` if passive behavior is unsuitable for the
demo hardware. This explicitly makes automatic scans **MANUAL_ONLY**; it never
marks tracks LIVE. Use the small **Verifikasi petugas / Presensi manual** panel
on the live page: choose the student, check identity/presence in person, enter a
reason, confirm and submit. It records MANUAL, follows the same schedule/duplicate
rules and immediately updates Recent Attendance. No automatic fallback/bypass.

## Profiling

In development mode the per-face telemetry contains detection/embedding/matching
times, `frame_total_ms`, `verification_latency_ms`, and successful attendance
`detection_to_attendance_ms`. Detection/index times are shared per frame: do not
sum them across faces. Verification latency is wall time from first track sighting,
not CPU compute time. Measure average over successful *distinct* tracks, report
sample size, and include pending/rejected counts to avoid hiding slow failures.
No claim of 0.5–1.2 second physical performance is made before measurement.

Local synthetic run (100 sequences per path, sample timestamps 0/0.4/0.8 s):
mean identity verification 400 ms fast / 800 ms standard; LIVE gate readiness
800 ms for both. Mean decision-only CPU time was 0.128 / 0.124 ms per three-sample
sequence. This excludes capture, YuNet, SFace, HTTP and database time; it is not
an Intel i5 Gen 7 end-to-end benchmark.

## Physical demo checklist

Keep passive liveness enabled. Test both CHECK_IN and CHECK_OUT (the configured
school schedule still applies). Log lighting, camera resolution, distances and
each telemetry latency. Check Recent Attendance and no duplicate rows.
Leave the frame for at least 5 seconds between genuine and spoof trials. A student
already marked present may hit database duplicate protection: inspect liveness
state separately, so a duplicate rejection is not mistaken for spoof detection.

- A: registered student walks normally; VERIFIED + LIVE then one attendance.
- B: two registered students walk together; independent tracks and entries.
- C: registered + unknown; only registered can attend.
- D: registered student's static photo on a phone / print; must not immediately
  attend. Repeat by translating, scaling and tilting the phone. Any acceptance is
  a failed spoof trial; do not mask it by lowering recognition thresholds.
- E: genuine student moves naturally without a special gesture; record pending
  cases and latency rather than forcing a successful classification.

Stop at Phase 4. No Android Parent changes, database reset, commit or push.
