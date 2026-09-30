# Guru/Piket Attendance Audit Implementation - Implementation Plan

## Task 1: P0 — Hardened WebSocket authorization + regression tests
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Audit `backend/app/routers/websocket.py` `/ws/attendance` handshake to add explicit defensive ordering and PARENT role short-circuit (currently `user.role in {ADMIN_IT,GURU_PIKET}` — add explicit `user.role == 'PARENT'` guard and tests).
  - Ensure every PARENT / inactive / invalid-token path closes with 1008 BEFORE `await ws.accept()`.
  - Add pytest cases in new test file (or existing regression test file) covering:
    - PARENT token → 1008 close, no acceptance, no broadcast received.
    - Invalid/expired/tampered/missing token → 1008.
    - Inactive GURU_PIKET → 1008.
    - Active ADMIN_IT and active GURU_PIKET → accept + receive broadcast.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4
- **Test Requirements**:
  - `rule` TR-1.1: pytest asserting WebSocket `/ws/attendance` with a PARENT-role JWT closes with code 1008 and does not receive any broadcast messages. Evidence: `pytest backend/tests/ -k websocket -q` exit 0 and source.
  - `rule` TR-1.2: pytest asserting missing/invalid token closes 1008. Evidence: test exit 0.
  - `rule` TR-1.3: pytest asserting inactive user token closes 1008. Evidence: test exit 0.
  - `rule` TR-1.4: pytest asserting active ADMIN_IT + GURU_PIKET accept and receive broadcast. Evidence: test exit 0.
- **Notes**: Do not change `/ws/parent` behavior; preserve Admin IT behavior.

## Task 2: P0 — Yesterday-active session preservation + non-blocking tests
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Verify `find_active_session` date-window semantics in `attendance_sessions.py` and dashboard equivalent in `dashboards.py` (today-only).
  - Add pytest that seeds an ACTIVE AttendanceSession with `session_date` = yesterday (same mode/camera_source) and calls open_session for today → assert 200 + today session created AND yesterday row untouched (status==ACTIVE, closed_at is None).
  - Verify no code path in routers auto-closes or deletes any historical ACTIVE AttendanceSession rows.
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-2.1: pytest creates yesterday ACTIVE AttendanceSession, opens today, asserts yesterday row still ACTIVE and closed_at NULL and today session created successfully. Evidence: `pytest -q` pass.
  - `rule` TR-2.2: code grep of `attendance_sessions.py`, `dashboards.py`, `attendance.py` confirms no `AttendanceSession.status='CLOSED'` assignment outside the explicit `/close` endpoint; no DELETE on AttendanceSession. Evidence: grep output.

## Task 3: P1 — Scan lifecycle: bounded timeout, single-flight, and state flicker fix
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `TeacherLiveAttendancePage.tsx` `scanFrame`:
    - Move DETECTING/PROCESSING setState calls AFTER `scanInFlightRef` guard passes AND after frame capture validity is confirmed (not before the guard).
    - Add explicit scan timeout: schedule `setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)` immediately when creating the AbortController; clear timeout in finally. Define SCAN_TIMEOUT_MS to a bounded default (e.g., 8000, clamped).
    - Strengthen single-flight invariant by checking again after capture to avoid edge races.
  - Ensure after capture/timeout the state does not oscillate between READY/DETECTING/PROCESSING on every tick when nothing changes.
- **Acceptance Criteria Addressed**: AC-6, AC-7
- **Test Requirements**:
  - `rule` TR-3.1: Source trace: in `scanFrame`, `scanInFlightRef` check returns early BEFORE any `setScanState('DETECTING'|'PROCESSING')`. Evidence: source lines + `npm run lint` pass.
  - `rule` TR-3.2: Source trace: `AbortController` is paired with a `setTimeout` abort that runs at N seconds (configurable constant). Evidence: source lines + build pass.
  - `rubric` TR-3.3: Scan state transition smoothness; scale 1-5; anchors 1=flip every tick, 3=set once but before guard, 5=set after guard passes and per-cycle only once; threshold >= 4; evidence: code review.

## Task 4: P1 — Camera switch/unmount/socket cleanup hardening
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `TeacherLiveAttendancePage.tsx` `openCamera`: call `stopMediaStream(streamRef.current)` BEFORE awaiting `getUserMedia` (not after) to guarantee old tracks are released before new acquisition, and protect with a mutex/ref against concurrent openCamera calls.
  - In unmount effect and the live-attendance subscription useEffect: store subscribe unsubscribe in a `socketCleanupRef`; on cleanup call unsubscribe, abort via scanAbortRef, clear timers, stop stream, set mountedRef false in correct deterministic order.
  - In `attendanceService.subscribe`: prevent double-connect if caller subscribes twice; ensure at most one live socket exists per service singleton, or at page-level ref.
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-4.1: `openCamera` calls `stopMediaStream` on `streamRef.current` prior to the `getUserMedia` await. Evidence: source.
  - `rule` TR-4.2: useEffect cleanup path calls socket unsubscribe + AbortController.abort + clearTimeout + stopMediaStream. Evidence: source + lint/build pass.
  - `rule` TR-4.3: subscribe cleanup function is retained (stored in a ref) and actually invoked on teardown (not ignored as return value of an inline subscribe call). Evidence: source.

## Task 5: P1 — WebSocket reconnect with single-connection + bounded backoff
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - Enhance `attendanceService.subscribe` to implement reconnect logic or return an enhanced subscription object that reconnects on close with exponential backoff (initial delay ~1s, cap ~30s), with strict single socket/one-pending-reconnect guards.
  - Surface disconnect via existing toast/scan-message channel on the first disconnect only (non-flooding), and auto-recover socket silently on success.
  - Ensure the page never subscribes twice even when useEffect re-runs.
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-5.1: `attendanceService.subscribe` includes reconnect with bounded backoff and guards against duplicate sockets (ref counter / socket-in-flight ref). Evidence: source + build pass.
  - `rule` TR-5.2: Toast/disconnect messaging fires at most once per disconnect interval, not every retry. Evidence: source.

## Task 6: P1 — Dashboard loading/placeholder + mutation-driven refresh
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - In `TeacherDashboardPage.tsx`: introduce explicit `isLoading` state that renders StatCard with a non-zero placeholder (skeleton or "Memuat…" text) while the promise is in-flight. Replace `stats?.presentToday ?? 0` pattern with rendering that distinguishes loading (no value displayed as zero) from actual zero.
  - After StartSessionModal success / correction events, refresh teacher dashboard.
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `rule` TR-6.1: Teacher dashboard KPI card values never render via `?? 0` fallback while pending; a distinct loading skeleton/text appears until stats resolved. Evidence: source diff + build pass.
  - `rule` TR-6.2: On session open/close and correction events, dashboard stats trigger re-fetch / state refresh where the page is visible. Evidence: source.

## Task 7: P1 — Attendance history filter/CSV consistency + PERMISSION→EXCUSED mapping
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `TeacherAttendancePage.tsx`:
    - Load classes from `classesService.getClasses()`; forward selectedClass (as `class_id` integer when available) to `getAttendanceRecords` params and to the report CSV export `downloadAttendanceCsv` params.
    - Remove client-side `className` text-match filtering; use server-side `class_id`/`status`.
    - Ensure status filter options only include values the backend contract actually stores in Attendance.status: PRESENT, LATE, SICK, EXCUSED, UNEXCUSED. If UI previously offered "PERMISSION" (which backend never writes on Attendance rows, only on leave_type), either remove the option OR — if kept for UX — map PERMISSION→EXCUSED at the service boundary.
  - In CSV export handler: pass identical date/class/status params currently applied to the visible list.
  - Update `reports.service.ts` `downloadAttendanceCsv` callers to ensure field naming aligned (date_from/date_to vs startDate/endDate — the service already maps correctly; verify attendance page export uses date_from/date_to consistent with the reports page).
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-7.1: Attendance page passes class_id/status to the GET list AND CSV export uses the same params. Evidence: source + build pass.
  - `rule` TR-7.2: PERMISSION value never reaches the backend as an Attendance.status filter parameter, unless mapped to EXCUSED or removed from UI. Evidence: grep/search of compiled params or source.
  - `rule` TR-7.3: Class filter no longer uses client-side string `className` text-match for server-paginated list. Evidence: source.

## Task 8: P1 — Reports page: real class names, no fake correction rows, explicit unavailable KPIs
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7
- **Description**:
  - In `TeacherReportsCorrectionsPage.tsx`:
    - Replace hard-coded class options (`<option value="X-A">…</option>` etc.) with real ClassRoom data from `classesService.getClasses()`.
    - Load correction audit records from backend (existing `/api/audit-logs` if available, or report correction source) when endpoint supports them; if no correction endpoint is available, keep the explicit empty state message but ensure no fake rows.
    - KPI values: currently `'—'` is acceptable but helper text says "Belum ada data untuk dihitung"; update to "Data backend belum tersedia" (unavailable indicator not fabricated zero/dash that could be mistaken for computed zero). Do NOT invent numbers.
    - Keep PDF/Excel buttons disabled with the existing disabled explicit label.
- **Acceptance Criteria Addressed**: AC-12
- **Test Requirements**:
  - `rule` TR-8.1: No literal string options `<option value="X-A"|…` remain in TeacherReportsCorrectionsPage class select; instead rendered from classes API data. Evidence: source diff + build pass.
  - `rule` TR-8.2: Corrections data array is empty or backend-derived (no local literal rows). Evidence: source.
  - `rule` TR-8.3: PDF/Excel buttons remain `disabled`. Evidence: source.

## Task 9: P1 — Correction form: real Attendance record prefill + success refresh
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7
- **Description**:
  - Extend `CorrectionFormModal.tsx` props to accept an optional `attendance: AttendanceRecord | null` prop in addition to `attendanceId`.
  - When the modal is invoked from the Attendance row (TeacherAttendancePage passes `selectedRecord`), pre-populate:
    - studentId (disable the student selector when coming from a row, or just hide with a label showing the student name).
    - attendanceDate from the record.
    - previousStatus from `record.status` (disable previousStatus select when coming from a row to avoid user changing it arbitrarily).
  - The empty student selector (previously "-- Pilih Siswa (Daftar Kosong) --") must no longer be shown as the only option when correction is invoked from a known row.
  - On successful submit: ensure TeacherAttendancePage calls `load()` and TeacherReportsCorrectionsPage refreshes relevant data (ensure the CorrectionFormModal accepts and invokes `onSuccess` in both call sites).
- **Acceptance Criteria Addressed**: AC-13
- **Test Requirements**:
  - `rule` TR-9.1: CorrectionFormModal when opened with attendanceId + attendance record pre-fills student, date, previousStatus. Evidence: source + build pass.
  - `rule` TR-9.2: submitCorrection payload shape matches backend PATCH endpoint contract `{status, notes, check_in_time?, check_out_time?}`. Evidence: source.
  - `rule` TR-9.3: Backend correct_attendance audit log includes reason in description (already does `body.notes` in existing code — assert coverage via existing test or new minimal test if coverage gap). Evidence: source + lint.

## Task 10: P1 — Leave requests: filter fix + backend fields detail + approve reviewer-note persistence
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Frontend filter bug (`TeacherLeaveRequestsPage.tsx` visibleRequests filter): selectedType values (`SICK`/`PERMISSION`/`DISPENSATION`) are inverted through the `{ Sakit: 'SICK', Izin: 'PERMISSION', Dispensasi: 'DISPENSATION' }` lookup which returns `undefined` for any actual enum value; replace with direct equality `request.leaveType === selectedType`.
  - LeaveReviewDrawer:
    - Fields `nis`, `className`, `parentName` currently assumed to exist but backend leaves list response does not include them (returns studentId, studentName, leaveType, startDate/endDate, reason, status, createdAt). Hide fields not present or enhance backend GET `/api/leave-requests` response shape to include: `nis`, `className`, and — since submitted_by can be a PARENT user — `parentName` resolved from User/Guardian via submitted_by User id + Guardian/GuardianAccount. Backend enhancement is preferred so detail view has accurate data. Do NOT fabricate values.
    - When approving with `reviewNote` text: the FE `leaveService.approveRequest(id, notes)` sends body `{ notes }`. Backend `/approve` currently ignores the body. Update backend to read a `review_note` or `notes` field from the body and save to `LeaveRequest.review_note` (column already exists in model). If route body is empty and Pydantic-less dict is used, match reject's pattern — use a Pydantic model for approve body too to be explicit.
  - Ensure approve still sets attendance status correctly (SICK→SICK else EXCUSED). Ensure no breakage to parent submit-leave endpoint compatibility.
- **Acceptance Criteria Addressed**: AC-14, FR-14
- **Test Requirements**:
  - `rule` TR-10.1: selectedType filter uses `request.leaveType === selectedType` (not the broken lookup). Evidence: source diff.
  - `rule` TR-10.2: Backend leave GET response includes accurate `nis`, `className`, and submitter `parentName` if the submitting user is a PARENT (otherwise fallback to user display name or "Tidak tersedia"). OR fields are hidden on FE when absent — whichever path is chosen is consistent and no fabricated values displayed. Evidence: pytest GET response shape assertion + FE source.
  - `rule` TR-10.3: Backend approve endpoint accepts request body with a note string and persists to LeaveRequest.review_note. pytest asserts the column value after approve with note. Evidence: `pytest -q` pass.

## Task 11: Full suite verification
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1-10
- **Description**:
  - Run focused Guru/Piket tests (new websocket/session/leave tests).
  - Run full backend suite: `pytest backend/tests/ -q`
  - Run `npm run lint` (tsc --noEmit).
  - Run `npm run build`.
  - Run `git diff --check`.
  - Ensure no regressions vs Admin IT changes.
- **Acceptance Criteria Addressed**: AC-15
- **Test Requirements**:
  - `rule` TR-11.1: `pytest backend/tests/ -q` exit 0. Evidence: terminal output.
  - `rule` TR-11.2: `npm run lint` exit 0. Evidence: terminal output.
  - `rule` TR-11.3: `npm run build` exit 0. Evidence: terminal output.
  - `rule` TR-11.4: `git diff --check` exit 0. Evidence: terminal output.

## Task 12: Update GURU_PIKET_AUDIT.md with FINAL categorized results
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 11
- **Description**:
  - Replace/update the "Verification and final classifications" placeholder section with real results grouped into:
    - AUTOMATED VERIFIED (each with test command and pass evidence).
    - CODE-TRACED (each with source file path + line range and reasoning).
    - REQUIRES_PHYSICAL_TEST (DroidCam, walking recognition, real multi-face, real liveness — explicitly not claimed).
    - NEEDS_PRODUCT_DECISION (if any; e.g., if reviewer note persistence path is considered out of scope even though the column exists — unlikely but documented).
- **Acceptance Criteria Addressed**: N/A (audit deliverable)
- **Test Requirements**:
  - `rubric` TR-12.1: Audit document classification fidelity; scale 1-5; anchors 1 = all items lumped into one group with no evidence; 3 = groups present but evidence missing for many; 5 = every claimed finding is linked to explicit evidence (test command or code path), physical/hardware items correctly never AUTOMATED VERIFIED. Threshold >= 4. Evidence: the final GURU_PIKET_AUDIT.md document.
