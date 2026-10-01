# Guru/Piket Attendance Audit Implementation - Product Requirements Document

## Overview
- **Summary**: Audit-hardened implementation for the GURU_PIKET (teacher gate duty) operational surface of Tandara attendance: WebSocket authorization, live face-scan reliability, dashboard/session correctness, history/export consistency, reports fidelity, correction workflow, and leave-request review integrity.
- **Purpose**: Eliminate security violations, fabricated UI states, client-side race conditions, and frontend/backend contract mismatches identified during the initial Guru/Piket functional audit.
- **Target Users**: ADMIN_IT role retains audit visibility; GURU_PIKET performs live attendance, corrections, and leave reviews; PARENT role must receive no staff operational data or realtime staff socket access.

## Goals
- Prevent PARENT role and any unauthorized client from subscribing to the staff attendance WebSocket and receiving staff operational broadcasts.
- Guarantee ADMIN_IT / GURU_PIKET retain existing HTTP/WebSocket access to attendance operations.
- Eliminate state flicker, unbound work, camera resource leaks, and duplicate WebSocket connections in the live attendance page.
- Replace fabricated loading-zeroes, mock report metrics, mock class names, and mock correction-request UI with real backend data or explicit "unavailable" indicators.
- Attendance CSV export uses the supported backend filter contract and matches the visible history view. Remove unsupported PERMISSION attendance-status filter when backend status contract only supports EXCUSED.
- Correction workflow uses real Attendance IDs, persists correction status/reason via the real correction endpoint, and refreshes downstream data views.
- Leave-request frontend/backend filter contract matches; detail view reflects actual backend fields; approve/reject reviewer notes are not silently discarded.

## Non-Goals
- No new backend PDF / Excel report generation feature. PDF/Excel buttons remain explicitly disabled.
- No new schema migrations for reviewer notes during this audit unless the smallest backward-compatible persistence is testable without a migration product decision.
- No liveness threshold changes, no identity-threshold weakening, no temporal verification relaxation. Backend remains authoritative for identity and success.
- No fabricated "VERIFIED" UI hold to cover flicker.
- No historical AttendanceSession close/delete operations to make today's session appear functional.
- No Admin IT surface regressions from earlier Admin IT audit.

## Background & Context
Initial audit inventory recorded five Teacher routes under the GURU_PIKET protected shell: dashboard, live-attendance, attendance-history, leave-requests, reports-corrections. Initial defects included staff-attendance socket accepting parent tokens, live pre-request state flicker without bounded scan timeout, camera-switch race and missing guaranteed MediaStream track cleanup, component-unmount leak of sockets/timers/requests, no socket reconnect, dashboard loading zeroes, PERMISSION vs EXCUSED status contract mismatch, unusable correction selector with empty student list, report mock class names and empty KPI dashes, leave-request selectedType filter always-false mapping and missing detail fields, and approve-discarded reviewer notes. Yesterday-stale ACTIVE AttendanceSession rows must never be deleted or closed merely to unblock today's session; `find_active_session` already constrains results to today's date window and tests are required to confirm the guarantee holds without historical tampering.

## Functional Requirements
- **FR-1 (WebSocket Authorization)**: `GET /ws/attendance?token=...` handshake verifies decoded JWT `sub` belongs to an ACTIVE User whose role is exactly `ADMIN_IT` or `GURU_PIKET`; every PARENT, inactive, or unknown token closes with code 1008 before `accept()`.
- **FR-2 (WebSocket Authorization Scope)**: ADMIN_IT and GURU_PIKET tokens continue to connect successfully and receive `ATTENDANCE_SUCCESS`, `ATTENDANCE_CORRECTED`, `SESSION_OPENED`, `SESSION_CLOSED`, and `ATTENDANCE_SCHEDULE_UPDATED` broadcasts via existing `broadcast()` path.
- **FR-3 (Regression Tests)**: Backend test suite includes negative tests proving a PARENT token, an expired/invalid token, and an inactive-user token all fail `/ws/attendance` handshake (1008); positive tests proving active ADMIN_IT and GURU_PIKET tokens accept.
- **FR-4 (Stale Historical Sessions)**: `find_active_session` and dashboard active-session lookup restrict results strictly to today's date window; no route closes, deletes, or mutates historical (pre-today) ACTIVE AttendanceSession rows; tests assert stale ACTIVE row from yesterday never blocks opening today's new session and remains untouched.
- **FR-5 (Scan Lifecycle)**: Live attendance scan cycle transitions states without flapping `DETECTING`/`PROCESSING` before flight; each in-flight scan request has an explicit time-bound abort (timeout with AbortController cancellation); at most one scan request is in flight per page instance; overlapping rapid frames never duplicate requests.
- **FR-6 (Camera Resource Lifecycle)**: Opening a different camera device always stops every track of the previously held MediaStream before or atomically with the new stream swap; page unmount/component unmount stops the current stream, cancels any pending scan timer, aborts any in-flight request, and closes the attendance WebSocket subscription without leaving orphaned socket connections; duplicate subscribe calls never open duplicate sockets.
- **FR-7 (WebSocket Reconnect)**: Attendance WebSocket implements reconnect with exponential backoff and a single socket guarantee; disconnection is surfaced via the existing operational UI toast without flooding.
- **FR-8 (Dashboard Session Errors)**: Dashboard and recent-attendance load failures surface in the UI without fabricating zero-filled KPI values; loading state uses an explicit "memuat"/unknown indicator until backend data arrives; after relevant mutations (session open/close, correction) dashboard/session state refreshes.
- **FR-9 (Attendance History / CSV Consistency)**: Teacher attendance page applies grade/class/status filters using backend-supported parameters where available; class filter forwards `class_id` integer to the endpoint and CSV export uses the same supported filters applied to the current visible view; PERMISSION filter value is either removed (if backend contract does not store it as an Attendance.status) or mapped consistently to EXCUSED at the API boundary.
- **FR-10 (Reports Integrity)**: Teacher reports page replaces hard-coded fake class select options with real ClassRoom names from the classes API; KPI cards use real backend-derived reports metrics where endpoints exist; where no endpoint exists the value shows "Belum tersedia" / explicitly unavailable; PDF and Excel buttons remain disabled with a "belum diimplementasikan" hint. No mock correction-request rows are rendered; correction tab reflects real correction data when an endpoint exists, otherwise a clear empty state.
- **FR-11 (Corrections Workflow)**: CorrectionFormModal invoked from an Attendance row pre-fills the attendanceId, studentId, attendanceDate, previousStatus using the real Attendance record being corrected (not an empty student selector); submitCorrection sends status+notes+optional times to the PATCH endpoint; on success the attendance history and report correction lists invalidate/refetch; AuditLog `CORRECT` entry records the reason.
- **FR-12 (Leave Requests — Filter Contract)**: Teacher leave-requests page selectedType filter values match backend LeaveRequest.leave_type contract (SICK / PERMISSION / DISPENSATION actually supported); class filter populates from ClassRoom API; loading passes backend-supported query params when the endpoint accepts them, otherwise frontend filtering reflects accurate and intentional field names.
- **FR-13 (Leave Requests — Detail & Decision)**: LeaveReviewDrawer displays only fields actually returned by the backend leave list/detail shape (no phantom NIS / className when absent from response); backend approve endpoint accepts and persists a reviewer note in LeaveRequest.review_note when provided (reject already does), or if schema access is insufficient the FE surfaces a NEEDS_PRODUCT_DECISION instead of silently discarding. Approve transitions resulting Attendance.status according to leave_type (SICK→SICK, else→EXCUSED), reject leaves attendance untouched, per existing rules.
- **FR-14 (Parent API Compatibility)**: No changes break `PARENT`-role HTTP endpoints (`/api/parent/*`, `/ws/parent`) or the existing leave submit / realtime delivery contracts.

## Non-Functional Requirements
- **NFR-1**: All added tests pass under `pytest backend/tests/` and `npm run lint` / `npm run build` succeeds; `git diff --check` reports no whitespace errors.
- **NFR-2**: No code comment additions unless explicitly requested.
- **NFR-3**: Backend role checks are enforced at the FastAPI dependency level (not UI-only) for every staff route and the WebSocket handshake.
- **NFR-4**: FE state transitions for live attendance never depend on a fake VERIFIED hold for perceived stability.

## Constraints
- **Technical**: FastAPI backend with SQLAlchemy, SQLite/Postgres-compatible models, PyJWT auth, argon2 password hashes; React 19 + Vite + TypeScript frontend with TanStack Query optional and `apiRequest`/`attendanceService` service layer. Tests use `TestClient` in pytest.
- **Business**: ADMIN_IT/GURU_PIKET must retain current operational capability; PARENT must never gain staff socket access; historical data integrity (AttendanceSession, Attendance, LeaveRequest, AuditLog) is non-negotiable.
- **Dependencies**: Existing `attendance_out`, `require`, `user_dep`, `auth`, `broadcast`, `audit`, `localnow`, `find_active_session`, and service-layer exports remain available; only additive/role-hardening or contract-matching changes allowed.

## Assumptions
- `settings.secret_key` and `HS256` JWT decode remain authoritative for both HTTP and WS handshake tokens.
- LeaveRequest.leave_type domain matches: SICK, PERMISSION, DISPENSATION (model allows 20-char string).
- Attendance.status domain: PRESENT, LATE, SICK, EXCUSED, UNEXCUSED per `correct_attendance` validator.
- No new migrations are run during this audit; if approve reviewer-note persistence is required and the column already exists (`review_note` exists in LeaveRequest model) no migration product decision is needed for that specific write.

## Acceptance Criteria

### AC-1: PARENT token rejected on staff attendance WebSocket
- **Type**: `rule`
- **Given**: A signed JWT for an active User with `role == 'PARENT'`
- **When**: The client opens a WebSocket to `/ws/attendance?token=<PARENT_jwt>`
- **Then**: The server closes the handshake with code 1008 and never calls accept; the client receives no broadcasts.
- **Pass Condition**: pytest test exists and passes asserting close code 1008 for PARENT token.
- **Evidence**: `backend/tests/` test output and source file link.

### AC-2: Invalid token rejected on staff attendance WebSocket
- **Type**: `rule`
- **Given**: A missing, tampered, expired, or signature-invalid JWT
- **When**: Opening `/ws/attendance?token=...`
- **Then**: Handshake closes with code 1008, no accept.
- **Pass Condition**: pytest test covers invalid token cases and passes.
- **Evidence**: Test command output.

### AC-3: Inactive ADMIN_IT/GURU_PIKET user rejected on staff attendance WebSocket
- **Type**: `rule`
- **Given**: Valid JWT for User whose `is_active == False` and role is GURU_PIKET
- **When**: Opening `/ws/attendance?token=...`
- **Then**: Handshake closes code 1008
- **Pass Condition**: pytest test passes
- **Evidence**: Test command output.

### AC-4: Active ADMIN_IT and GURU_PIKET tokens accepted on staff attendance WebSocket
- **Type**: `rule`
- **Given**: Valid JWT for active ADMIN_IT and active GURU_PIKET users
- **When**: Each opens `/ws/attendance?token=...`
- **Then**: Both handshakes accept; a broadcast via `broadcast()` is received by both sockets.
- **Pass Condition**: pytest test passes with message reception assertion.
- **Evidence**: Test command output.

### AC-5: Yesterday ACTIVE AttendanceSession never blocks today open and is never mutated
- **Type**: `rule`
- **Given**: An ACTIVE AttendanceSession row whose `session_date` is yesterday for the same mode/camera source.
- **When**: `POST /api/attendance-sessions/open` is called today for the same mode/camera_source
- **Then**: Today's session opens successfully (200); the yesterday ACTIVE row remains ACTIVE, `closed_at` stays NULL, `status` unchanged — never deleted nor auto-closed.
- **Pass Condition**: pytest test passes pre and post-assertion on the historical row.
- **Evidence**: Test command output + `find_active_session` source date-window assertion in code.

### AC-6: Scan request timeout and strict single-flight enforcement
- **Type**: `rule`
- **Given**: Live attendance page with camera + session running
- **When**: Rapid scan ticks occur or a request hangs beyond the timeout
- **Then**: At most one scan HTTP request is in flight at any moment (enforced by single-flight guard); any scan exceeding a bounded timeout (e.g., 8s default, configurable) cancels via AbortController and transitions to ERROR with bounded retry delay rather than dangling.
- **Pass Condition**: Code trace of `scanInFlightRef` guarding + `setTimeout` wired to `controller.abort()` in `scanFrame` / service; FE tests verify `AbortSignal` wiring pattern.
- **Evidence**: Source lines + focused unit test / lint pass.

### AC-7: No DETECTING/PROCESSING flicker before request flight
- **Type**: `rubric`
- **Dimension**: Scan state transition smoothness
- **Scale**: 1-5
- **Anchors**: 1 = states flip DETECTING→PROCESSING→READY→PROCESSING every tick without work; 3 = states set once per cycle but flip before in-flight guard; 5 = states set only after in-flight guard passes and frame/request actually begins, with a single "preparing" transition per cycle.
- **Pass Threshold**: >= 4
- **Evidence**: Source code review of `scanFrame` ordering + live state-trace log if available; otherwise static code reasoning.

### AC-8: Camera switch / unmount / socket cleanup determinism
- **Type**: `rule`
- **Given**: Live attendance page during camera selection change or route navigation
- **When**: user switches cameras, or page unmounts, or component unmounts
- **Then**: Every track on the prior `MediaStream` is stopped (no hanging `MediaStreamTrack`); pending setTimeout/scan timers are cleared; in-flight AbortController is aborted; the attendance WebSocket `subscribe` cleanup is invoked and the socket is closed. Duplicate subscribe calls never produce more than one live socket.
- **Pass Condition**: `stopMediaStream` is called inside the critical openCamera swap path AND in useEffect cleanup; subscribe unsubscribe is stored in a ref and called on teardown; only a single WebSocket instance is tracked at a time.
- **Evidence**: Source trace + lint/build pass.

### AC-9: WebSocket single-connection reconnect with bounded backoff
- **Type**: `rule`
- **Given**: Live attendance page loses WebSocket connectivity
- **When**: `onclose` or `onerror` fires
- **Then**: The service schedules a reconnect with exponential backoff (capped) and guarantees only one active socket + one pending reconnect timer exist; duplicate retries never spawn duplicate connections.
- **Pass Condition**: Source inspection of reconnect logic with connection-count guards; linter clean.
- **Evidence**: Source + build pass.

### AC-10: Dashboard KPI loading vs zero distinguished; mutation-driven refresh
- **Type**: `rule`
- **Given**: Teacher dashboard initial load, and a session/correction mutation
- **When**: data is loading and after corrections/session operations
- **Then**: KPI cards never show numeric "0" while the promise is in-flight; a placeholder/muat indicator is shown until `TeacherDashboardStats` resolves. Session-open / correction events trigger a dashboard refresh of relevant caches/state.
- **Pass Condition**: TeacherDashboardPage rendering uses `stats === null` placeholder (not `?? 0`); mutation callbacks invalidate/re-fetch.
- **Evidence**: Source diff + build pass.

### AC-11: Attendance filter/export consistency and PERMISSION→EXCUSED contract
- **Type**: `rule`
- **Given**: Teacher attendance page with class + status filters applied
- **When**: the page loads rows AND when CSV export is triggered
- **Then**: API call uses backend-supported params `class_id`, `date_from`, `date_to`, `status` consistently for both list and CSV; a PERMISSION status filter option is not sent verbatim unless backend Attendance.status contract supports it (otherwise FE option maps to EXCUSED or the unsupported option is dropped). Class filter text match client-side filtering is removed in favor of server-side `class_id`.
- **Pass Condition**: Visible filter values map 1:1 to CSV request query params observed in the service call; no PERMISSION→nothing mismatch for backend statuses.
- **Evidence**: Source diff for attendance page + reports.service params; build pass.

### AC-12: Reports page no fake classes; no fake correction rows; unavailable metrics explicit
- **Type**: `rule`
- **Given**: Teacher reports corrections page render
- **When**: user opens the page and the class dropdown / correction data list
- **Then**: Class dropdown uses real ClassRoom entries (not static X-A/XI-IPA-1/XII-IPA-1 fake rows); correction tab list shows real data via backend endpoint (if available) or explicit empty state with no fabricated rows; KPI metrics show explicit unavailable when no backend source. PDF/Excel buttons remain disabled.
- **Pass Condition**: Fake class `<option>` literals absent from rendered output; CorrectionFormModal wired to actual attendance IDs; report KPIs show backend values or "Belum tersedia".
- **Evidence**: Source review + build pass.

### AC-13: Correction form uses real Attendance record data; audit-logged; refreshes views
- **Type**: `rule`
- **Given**: Teacher clicks "Ajukan Koreksi" on a specific attendance row (attendanceId known)
- **When**: the modal opens and the user submits a correction
- **Then**: Modal pre-fills student name, date, and previous status from the selected `AttendanceRecord` (student selector disabled/prefilled when coming from a row); submit sends status + notes + optional check-in/out times via `PATCH /api/attendance/{id}/correction`; success closes modal and triggers re-fetch of attendance history / reports list; AuditLog contains CORRECT action with the notes.
- **Pass Condition**: CorrectionFormModal uses `attendanceId` prop to pre-fill existing AttendanceRecord data in form defaults; student selector is not empty; attendance page passes `onSuccess` re-loader.
- **Evidence**: Source diff + unit test coverage if feasible + build pass.

### AC-14: Leave selectedType filter works; detail shows backend fields; approve persists reviewer note or surfaces NEEDS_PRODUCT_DECISION
- **Type**: `rule`
- **Given**: Teacher leave-requests page with SICK/PERMISSION/DISPENSATION filter, and a leave request opened in the drawer with reviewer note text entered on approve
- **When**: selectedType is non-empty, and approve is clicked with reviewNote text
- **Then**: Filter comparison does not use an inverted lookup table that returns undefined for the actual leave_type values; detail view fields (NIS, className, parentName) only render labels when backend actually supplies them or the endpoint is enhanced to include them (otherwise fallback label like "Tidak tersedia"). Backend approve endpoint accepts and persists the reviewer note in LeaveRequest.review_note; if model column exists and access path allows, note survives POST.
- **Pass Condition**: selectedType direct equality match works; drawer only shows actually-present fields; approve route reads `review_note`/`notes` from body and writes to LeaveRequest.review_note.
- **Evidence**: Source diff + pytest for approve persistence if column present; build pass.

### AC-15: Full test, lint, build, whitespace hygiene passes
- **Type**: `rule`
- **Given**: Implemented codebase
- **When**: `pytest backend/tests/ -q`, `npm run lint`, `npm run build`, `git diff --check` are executed
- **Then**: All commands exit 0; no whitespace errors; no TypeScript diagnostics; no test failures.
- **Pass Condition**: Exit code 0 for all four commands.
- **Evidence**: Terminal output capture for each.

## Open Questions
- [ ] Leave approve persistence: confirm product expectation that `review_note` should be written both on approve and reject (reject already does; approve currently skips). Assumed YES per consistency / not silent discard. If the product direction differs, this becomes `NEEDS_PRODUCT_DECISION` but NOT silent discard.
