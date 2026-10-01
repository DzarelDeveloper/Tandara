# Admin IT functional audit

Inventory recorded before implementation, 2026-09-30. Branch: phase4-working-checkpoint; initial working tree clean.

## Discovered routes and components

| Route / entry | Components and visible functions |
| --- | --- |
| `/admin/dashboard` | AdminDashboardPage; four database KPI cards, enrollment coverage, health; StudentFormModal and FaceEnrollmentDrawer quick actions |
| `/admin/students` | AdminStudentsPage; name/NIS search, class/face filters, DataTable pagination; StudentFormModal, StudentImportModal (template/preview/import), FaceEnrollmentDrawer; selected-student biometric deletion |
| `/admin/parents` | AdminParentsPage; metrics, search/status filter, ParentFormModal; ParentDetailDrawer edit, link/unlink, status, reset-password placeholder |
| `/admin/classes-users` | AdminClassesUsersPage; class/major/user tabs and paginated tables; ClassFormModal, MajorFormModal, UserFormModal; edit/delete master data, account status |
| `/admin/devices-system` | AdminDevicesSystemPage; API/DB/engine readiness, refresh, camera selection/permission/preview/stop/detection, current session, notification development notice |
| Shared Admin layout | Sidebar navigation/collapse/mobile drawer; Audit Log modal; header identity/menu/date; logout confirmation; ProtectedRoute |

No Admin attendance history, correction, report/export, profile editing, or dedicated settings route exists. Teacher routes are role-restricted. Attendance settings have an existing reusable panel and API; minimal integration belongs in Perangkat & Sistem. No new attendance/report product area is assumed.

## Initial confirmed findings

- Student service retrieves only default first 50 rows; frontend filtering/pagination consequently omit students.
- DataTable can remain beyond the final page after filtering/deletion.
- Dashboard quick-create and enrollment completion do not refresh KPI data; student fetch failure is silently converted to an empty list. Enrollment coverage shows zero before a successful response. Date uses browser timezone.
- Students list lacks edit/deactivate controls despite existing API support, and loading/error states. Import success does not refresh it.
- Import UI advertises unsupported Excel and drag/drop; backend supports CSV only. Preview hides row errors. Malformed short rows can crash parsing; imported guardians lack GuardianStudent links.
- Student PATCH duplicate NIS can raise unhandled IntegrityError. Student input lacks server-side nonblank validation.
- Audit endpoint always returns an empty actor username.
- Guardian reset password is a toast-only action; inactive status action still says deactivate. Guardian records without login accounts are counted/labeled as active accounts.
- Class/major/user tables lack loading/error/retry state; blank names can pass backend trim-after-validation.
- Attendance settings API is disconnected from Admin.
- Attendance list ignores class/student filters; CSV endpoint uses generic authentication rather than staff RBAC.

Detailed API mapping, fixes, evidence, limitations and verification results follow after implementation.

## UI → API → database → UI mapping (final)

All JSON calls use `services/api.ts`, attach the bearer token, unwrap the `data` envelope (including explicit null), and reject non-2xx responses. Unhandled server failures are shown without internal stack traces; validation errors identify fields without echoing submitted values. Requests without an explicit cancellation signal have a 30-second timeout. The following classifications describe the final implementation; arrows record initial defects.

| UI feature / component | Frontend call → HTTP endpoint | Backend router / operation / response | UI update and classification |
| --- | --- | --- | --- |
| Login / restored session | authService.login → POST `/api/auth/login` | auth.py: verify password, active User, issue JWT, record LOGIN; token + safe user metadata | AuthContext and localStorage; role redirect. CONNECTED. Password hashes never returned. |
| Dashboard four cards | dashboardService.admin → GET `/api/dashboard/admin` | dashboards.py: counts from Student, Attendance, AttendanceSession; AdminDashboardStats | Loading/error/retry and explicit refresh; now also refreshed after create/enrollment. PARTIAL → CONNECTED. |
| Dashboard enrollment coverage | same dashboard call | counts active REGISTERED/non-REGISTERED students | Real numerator/denominator/progress, unknown shown as dash rather than fabricated zero. CONNECTED. |
| Dashboard system status | systemService.health → GET `/api/health` | main.py: SQL SELECT 1 and FaceEngine state; HealthStatus | Loading/unknown/actual status; refresh with dashboard; configured API URL shown. CONNECTED. |
| Dashboard quick-create | StudentFormModal → studentsService.createStudent → POST `/api/students` | students.py: validate class/guardian, insert Student/link, audit CREATE; Student | Modal closes only after confirmed response; dashboard and enrollment roster reload. PARTIAL → CONNECTED. |
| Dashboard quick-enroll | studentsService.getStudents, FaceEnrollmentDrawer | paged roster plus enrollment endpoints below | Full student choices; roster fetch errors visible; completion refreshes metrics. PARTIAL → CONNECTED. |
| Student list and identity/guardian/face columns | studentsService.getStudents → GET `/api/students?page=N&page_size=500` | students.py: active Student query, stable ID ordering, classroom/primary guardian relation; Student[] | Fetches all pages; errors never silently return partial list; loading/error/empty/retry. BROKEN beyond first 50 → CONNECTED. |
| Student search/class/face filters | local filtering of complete roster | No extra request; backend also supports q/class_id/face_status | useMemo → DataTable; no-result state. CONNECTED. |
| Student detail/edit | StudentFormModal → updateStudent → PATCH `/api/students/{id}` | students.py: Student fields, optional fields preserved, duplicate NIS 409, UPDATE audit; Student | Populated edit form; reload on success. BACKEND_ONLY → CONNECTED. Dedicated read-only detail route is absent; detail GET remains API-only. |
| Student deactivate | deactivateStudent → DELETE `/api/students/{id}` | students.py: is_active=false, DEACTIVATE audit, invalidate recognition cache; success | Confirmation names selected student and explains preserved history/face data; refetch removes inactive row. BACKEND_ONLY → CONNECTED. No hard deletion added. |
| Student class choices | classesService.getClasses → GET `/api/classes` | classes.py: ClassRoom + major identity/student counts; Class[] | Active choices plus unchanged current inactive class when editing. CONNECTED. |
| Student guardian choices/new guardian | parentsService.getParents/createGuardian → GET/POST `/api/guardians` | guardians.py: Guardian without login account when no password supplied; Parent contract | Existing active eligible guardians; create-first retry reuses created guardian; Student POST creates link. CONNECTED; multi-request operation is not atomic, see limitations. |
| Import template download | studentsService.downloadTemplate → GET `/api/students/import-template.csv` | imports.py: actual CSV header, attachment response | Blob URL and named file download. CONNECTED. |
| Import preview | previewImport → POST `/api/students/import/preview` multipart | imports.py: CSV decode/header/rows, NIS uniqueness, active class, names/phone; row errors and totals | Valid/invalid totals and per-row errors; unsupported Excel claim removed. PARTIAL → CONNECTED (CSV only). |
| Import submit | importStudents → POST `/api/students/import` multipart | imports.py: revalidate, insert Guardian + Student + GuardianStudent in transaction, IMPORT audit; importedCount | Await confirmed response and refresh table. PARTIAL → CONNECTED. |
| Class tab list/count | classesService.getClasses → GET `/api/classes` | classes.py: ClassRoom; studentCount counts all associated Student rows, including inactive | Table with loading/error/empty/retry, real counts. CONNECTED. |
| Class create/edit | createClass/updateClass → POST `/api/classes`, PATCH `/api/classes/{id}` | classes.py: validate/resolve Major, insert/update ClassRoom, audit, duplicate 409; Class | Reload classes + majors, then close modal. CONNECTED. Existing inactive major can be retained, not newly assigned. |
| Class delete/status | deleteClass → DELETE `/api/classes/{id}` | classes.py: DELETE unused / DEACTIVATE referenced class; action result | Explicit confirmation; accurate result toast; reload. CONNECTED. |
| Major list/create/edit/delete | classesService.getMajors/createMajor/updateMajor/deleteMajor → GET/POST `/api/majors`, PATCH/DELETE `/api/majors/{id}` | classes.py: Major rows and ClassRoom counts; rename propagates major text; referenced delete deactivates; audit | Both master tables reload; blank/duplicate names rejected. CONNECTED. |
| Users list | usersService.getUsers → GET `/api/users` | users.py: safe User fields, role, status; User[] | Loading/error/empty/retry table. CONNECTED. Includes backend roles without pretending all users are teachers. |
| User create | UserFormModal → createUser → POST `/api/users` | users.py: hash password, unique trimmed username, allowed role, audit; safe User | Form intentionally creates GURU_PIKET; reload after success. CONNECTED. ADMIN_IT creation is backend-only by existing UI policy. |
| User status toggle | toggleUserStatus → PATCH `/api/users/{id}/status?active=…` | users.py: active flag and STATUS_CHANGE audit | Reload after success; inactive login rejected and existing token rejected by user_dep. CONNECTED. |
| Guardians list/metrics/search/status | parentsService.getParents → GET `/api/guardians?include_inactive=true` | guardians.py: Guardian, GuardianAccount→User, GuardianStudent→Student; Parent[] | Real account-only counts, unique linked-student count, loading/error/empty/retry; records without credentials labeled without login. PARTIAL → CONNECTED. Search/status are local. |
| Guardian create | ParentFormModal → createParent → POST `/api/guardians` | guardians.py: Guardian + unique username/User + GuardianAccount + one GuardianStudent; safe Guardian output | Confirmed username displayed, list reloaded; password/phone validation. CONNECTED. |
| Guardian detail/edit | ParentDetailDrawer → updateParent → PATCH `/api/guardians/{id}` | guardians.py: Guardian name/phone, linked User name, relationship; audit UPDATE | Reload list and selected drawer object. CONNECTED. Opening a different guardian resets previous edit/link state. |
| Link student | linkStudents → POST `/api/guardians/{id}/students?relationship=…` | guardians.py: validates one student and creates/updates GuardianStudent; assigns legacy primary guardian if unset | Refreshes drawer/list and clears picker after confirmation. CONNECTED. Empty selection rejected at API. |
| Unlink student | unlinkStudent → DELETE `/api/guardians/{id}/students/{studentId}` | guardians.py: delete selected link; primary guardian falls back to remaining link; audit | Explicit named confirmation and refetch; Student itself preserved. CONNECTED. |
| Guardian status | toggleStatus → PATCH `/api/guardians/{id}/status?active=…` | guardians.py: Guardian + related User status; audit | Confirmation, dynamic activate/deactivate label, refetch. CONNECTED. |
| Guardian reset password | no call / no implemented endpoint | no reset operation | FRONTEND_ONLY toast action → explicitly disabled “Belum Tersedia”. NOT_IMPLEMENTED; needs product decision. |
| Enrollment existing status | faceEnrollmentService.getStatus → GET `/api/students/{id}/face-enrollment` | face_enrollment.py: Student + FaceEnrollment metadata only | Existing enrollment notice; no raw embeddings. Previously unused service → CONNECTED. |
| Enrollment camera/student selection | browser getUserMedia with stored device preference | Browser media stream, not an API metric | Camera errors visible, stream stops on close/unmount, frame readiness checked. CONNECTED in code; physical verification pending. |
| Enrollment prepare/cancel | discardSamples → DELETE `/api/students/{id}/face-enrollment/samples` | face_enrollment.py: selected student's pending samples only | Await preparation before capture, errors/retry visible; cancel clears pending samples, never final enrollment. PARTIAL → CONNECTED. |
| Capture/quality/progress | addSample → POST `/api/students/{id}/face-enrollment/samples` multipart image | face_enrollment.py + unchanged FaceEngine quality/identity checks; sampleCount/minimumSamples/guidance | Backend counts and quality codes shown, selection locked during requests, no fabricated samples. CONNECTED. |
| Complete/re-enroll | complete → POST `/api/students/{id}/face-enrollment/complete` | face_enrollment.py: enforce minimum, persist representative enrollment, set REGISTERED, audit, invalidate cache | Success only after server confirms; refetch student/dashboard; close without delayed timer race. CONNECTED. |
| Delete biometrics | remove → DELETE `/api/students/{id}/face-enrollment` | face_enrollment.py: selected student's enrollment row/files only, audit | Existing explicit confirmation, await response, refetch. CONNECTED. Tested only in temporary storage by existing tests. |
| Diagnostics refresh | health/faceEngine/activeSession → GET `/api/health`, `/api/face-engine/status`, `/api/attendance-sessions/active` | main.py, face_enrollment.py, attendance_sessions.py: DB connectivity, engine/model status, current AttendanceSession or null | Separate outcomes/timeouts; null no longer renders an active session; session fetch error distinct from none. BROKEN null contract → CONNECTED. |
| Camera diagnostics | enumerateVideoDevices/getUserMedia/stop + systemService.detectFace → POST `/api/face-engine/detect` | face_enrollment.py: detect/quality only, no identification/persistence; faceCount/boxes/quality | Device selection, stream details, camera error, detection feedback. CONNECTED; actual camera manual test pending. |
| Attendance settings | shared AttendanceSchedulePanel → getSchedule/saveSchedule → GET/PUT `/api/attendance/settings` | attendance.py + attendance_schedule.py: singleton schedule, HH:mm/order validation, configured timezone, audit; reclassify today's non-corrected present/late rows as existing backend already does | Minimal Admin integration in systems page; loading/error/retry, save then GET persistence verification. BACKEND_ONLY for Admin → CONNECTED. |
| Audit log | reportsService.getAuditLogs → GET `/api/audit-logs` | audit_logs.py: AuditLog LEFT JOIN User; timestamp/userId/username/action/entity/entityId/details | Real actor now populated; modal loading/error/empty and refresh. PARTIAL → CONNECTED. |
| Header identity/date | AuthContext session; browser Intl with Asia/Jakarta | Safe login metadata; no profile edit endpoint used | Displays actual session metadata; Jakarta date; menu and logout. CONNECTED. Profile editing NOT_IMPLEMENTED in Admin. |
| Logout | authService.logout → POST `/api/auth/logout` | auth.py: LOGOUT audit; server JWT remains stateless | Always clear local token/session even on API failure; AuthContext clears before navigation. PARTIAL → CONNECTED. |
| Navigation/dialog/table controls | React Router, local state, DataTable, Modal/Drawer/ConfirmDialog | No API for local controls | Five valid Admin routes; ADMIN_IT ProtectedRoute; pagination clamps after filter/deletion; mobile/collapse/menu/open/close handlers traced. CONNECTED in code; browser interaction not executed. |

## Admin-authorized backend features without Admin UI

These are **BACKEND_ONLY for Admin**, not fake Admin controls. Teacher pages are outside the requested UI scope and were not redesigned.

| Feature | Existing service/API | Backend/contract | Audit result |
| --- | --- | --- | --- |
| Attendance history/filtering | attendanceService.getAttendanceRecords → GET `/api/attendance` | attendance.py: Attendance joined to Student, date/today/status/class_id/student_id filters; AttendanceRecord[] | Added missing class/student filtering; TestClient compares actual query results. Staff-only access enforced. No Admin page added. |
| Summary/recent attendance | GET `/api/attendance/summary`; GET `/api/dashboard/teacher` | summary counts; teacher dashboard returns recentAttendance | API tested / code traced; no recent-attendance Admin card exists. |
| Manual check-in/out | attendanceService.recordManual → POST `/api/attendance/manual` | existing take/schedule validation, Attendance writes/audit | Existing full suite verifies check-in/out and schedule behavior; no Admin button. Recognition logic unchanged. |
| Correction/reason | submitCorrection → PATCH `/api/attendance/{id}/correction` | validates status + notes, writes Attendance, CORRECT audit | Admin API smoke verified reason in audit. No Admin correction form added. |
| Attendance CSV export | reportsService.downloadAttendanceCsv → GET `/api/reports/attendance.csv` | reports.py: filtered real CSV, attachment filename | Admin API and frontend service contract verified; staff RBAC tightened. No Admin attendance-export button exists. |
| Session open/close/list | attendanceService.startLiveSession/stopLiveSession → POST `/api/attendance-sessions/open`, POST `/{id}/close`; GET `/api/attendance-sessions` | AttendanceSession and audit | Active session is visible read-only in diagnostics; opening/closing remains operational attendance UI. |
| Administrator account creation | POST `/api/users` with ADMIN_IT | users.py allows ADMIN_IT/GURU_PIKET to be created by an Admin | Existing UI intentionally fixes creation to Guru/Piket. Changing provisioning UX needs product decision. |
| Replace guardian link | parentsService.replaceStudents → PUT `/api/guardians/{id}/students` | replace one linked student safely | Available API/service; Admin UI exposes explicit unlink then link instead. |
| Self profile | GET `/api/auth/me` | safe authenticated User projection | API-only; header uses login session metadata. |

## Exact defects fixed

1. Full paged student retrieval and deterministic backend order; validate pagination bounds.
2. DataTable clamps page when a filter or mutation reduces its row count.
3. Dashboard quick-create and enrollment refresh statistics, health, and roster together; explicit refresh; roster errors visible; unavailable metrics no longer read as zero; Jakarta date and configured API URL.
4. Student identity editing and safe deactivation connected to existing endpoints, with table refresh and explicit confirmation.
5. PATCH preserves omitted guardian/status/gender fields; duplicate NIS produces 409 instead of a 500; server rejects blank names/NIS.
6. Editing an existing student in an inactive class remains possible without permitting new assignment to that class.
7. Student creation/assignment cannot bypass the one-student rule for a guardian with a parent login account; eligible choices filtered in the form.
8. Student import advertises only supported CSV selection, displays row errors, locks file changes during requests, and refreshes the table after success.
9. Short CSV rows produce validation errors instead of AttributeError; import validates active classes, names, full phone format, and NIS length; inserted guardians are linked immediately.
10. Newly created standalone guardian is reused on student-save retry rather than recreated within that form session.
11. Class/major names trim before length validation; unchanged inactive major can be retained during class edit.
12. Class/major/user, student and guardian pages distinguish loading/error/empty and provide retry/refresh; empty actions clear stale edit selection.
13. Guardian account metrics exclude guardians with no login account; linked student count is distinct; drawer edits reset between guardians; status button matches intended action.
14. Unsupported guardian reset-password action explicitly disabled rather than appearing functional.
15. Empty guardian link request returns 422 rather than indexing an empty list.
16. User identity input trimmed; misleading “read-only” description corrected for the operational role.
17. API envelope preserves null, fixing phantom active sessions; meaningful safe validation errors and bounded default requests.
18. Enrollment awaits preparation, reads existing enrollment status, checks camera frame readiness, blocks selection/close during active capture/save, and removes delayed-close race. No recognition or quality threshold changed.
19. Admin attendance schedule connected using existing reusable panel; retry/loading and GET-after-save confirmation added.
20. Audit actor resolved from User and refresh action added.
21. Attendance class/student filters honored; attendance list and CSV constrained to ADMIN_IT/GURU_PIKET rather than arbitrary authenticated users.
22. Local logout clears AuthContext even when server logout fails; header date fixed to Asia/Jakarta.
23. Diagnostics reports session lookup failure separately from “no active session” and prefers explicit engine diagnostic state over a conflicting health fallback.

## Metrics and relationships verified

- Admin visible cards: active students; registered active students; PRESENT + LATE today; active attendance sessions. Enrollment coverage uses the same real active-student population. No fake dashboard arrays or numeric KPI constants found.
- API-only Admin counts: active classes, active duty teachers, late today, pending leaves, unenrolled active students. Counts originate in SQL, and the existing/new tests exercise empty and populated values. Not all of these are rendered as cards.
- Attendance “today” comes from `localnow()` using configured Asia/Jakarta. Header/dashboard date now explicitly uses Asia/Jakarta even on a differently configured browser.
- Class student counts include all related students; this preserves existing backend semantics rather than silently redefining them as active-only counts.
- `Student.guardian_id` is the primary guardian displayed in the student table. `GuardianStudent` holds access relationships; `GuardianAccount` associates Guardian with a PARENT User. Identity edits preserve these relationships. Linking/unlinking refreshes the selected drawer from backend data.
- Create/edit/deactivate, duplicate NIS, class/major create/edit/delete/deactivate, user activation behavior, guardian create/link/unlink/status, import/template, enrollment contract, attendance settings, filters, export and audit are covered by TestClient tests. Test data is clearly named AUDIT/TEMP and exists only in disposable SQLite.
- Enrollment endpoint tests use isolated face storage and deterministic inference fixtures. They verify minimum samples, quality rejection, replacement preservation, deletion scope and metadata; they do not substitute for a real camera enrollment test.

## Remaining classifications / decisions

- **STATIC/MOCK:** no fake Admin dashboard KPIs found. Notification “in development” notices and `notificationsActive=false` are existing capability placeholders, not delivery-state metrics; retained transparently. Unused Class fields (teacher/schedule `-`, empty activeDays) are service compatibility placeholders and are not rendered in Admin. No placeholder was promoted to a working feature.
- **PARTIAL:** browser/camera end-to-end behavior is code-traced and API-tested but still requires physical validation. Creating a new standalone guardian and student is two requests: if the student save fails and the dialog is abandoned, the guardian remains. Retry in the same dialog reuses it; an atomic combined operation would be a separate product/API decision.
- **FRONTEND_ONLY / NOT_IMPLEMENTED:** guardian temporary-password reset is explicitly disabled; Excel import and drag/drop promises removed because no corresponding implementation exists. No user/profile edit or guardian-account conversion/reset system added.
- **NEEDS PRODUCT DECISION:** Admin attendance history/correction/report navigation; broader Admin account provisioning; converting a standalone guardian to a login account; reactivating inactive students from a dedicated archive UI. Existing APIs and restrictions remain visible in this report.
- Existing policy permits an Admin to deactivate their own account via user status. No last-admin/self-deactivation policy was invented; inactive authentication is enforced. Consider an explicit account-recovery/provisioning policy before changing this behavior.
- Logout clears browser credentials and is audited; backend JWT logout remains stateless as before (documented by existing regression tests).
- No full-app redesign, Teacher dashboard changes, Parent PWA work, recognition-flow changes, threshold/model changes, schema migration, commit or push.

## Manual verification still required

1. Open each Admin route directly after login, then check unauthorized/no-session URLs, mobile sidebar, focus/escape/overlay behavior and responsive tables.
2. Try create/edit/deactivate/import, filter from later table pages, and retry after network failure in an actual browser; confirm visible refresh and file-save behavior.
3. Test camera permission denial/regrant, missing camera, device switching and disconnect, real YuNet/SFace detection, three/configured-minimum quality samples, rejected samples, completion and re-enrollment. Any real enrollment/delete must use an explicitly selected disposable test identity.
4. Confirm existing-face deletion dialog identifies the intended selection, and inspect refresh after success. No existing enrollment was deleted during this audit.
5. Test schedule save/reload and displayed Jakarta date on a browser configured to a different timezone.

No browser automation tool or Playwright/browser test dependencies were installed in this workspace, so browser clicks and visual rendering are not claimed as executed.


## Final verification

| Check | Result |
| --- | --- |
| `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider` | **154 passed**, 0 failures, 28.93s. Original 144 retained; 10 new Admin tests. |
| Frontend Admin service regression tests | **9 passed**, 0 failures. Actual services with controlled fetch responses, not browser E2E. |
| `npm run lint` | **PASS**, TypeScript noEmit. |
| `npm run build` | **PASS**, 1873 modules, 2.53s. |
| Local FaceEngine initialization | **READY**; YuNet LOADED; SFace LOADED; OpenCV/ONNX. No image enrollment performed. |
| Preservation hashes | **PASS**: existing database and both ONNX model files unchanged byte-for-byte. No files in existing backend/data/faces were present/modified; no existing biometric database rows changed (whole DB hash unchanged). |
| `git diff --check` | **PASS**, no output. |
| Commit / push | Neither performed. |

Tests initially hung in sandbox at FastAPI TestClient/AnyIO portal startup. Approved execution outside the sandbox resolved this; no application/test weakening was used. Existing conftest sets DATABASE_URL to a fresh temporary directory before app import. Existing enrollment tests redirect FACE_ROOT/PENDING_ROOT to temporary paths. No production database cleanup, reseed, migration, or biometric deletion was run.

Warnings: existing Starlette/httpx TestClient deprecation; Vite future native config-loader `__dirname` warning and >500 kB bundle warning; OpenCV target warning while successfully loading models. They did not fail verification.

Reproduce frontend regression checks using installed dependencies:

```bash
node_modules/.bin/esbuild src/services/admin-integration.test.ts --bundle --platform=node --format=esm '--define:import.meta.env={}' --outfile=/tmp/tandara-admin-integration.test.mjs
node /tmp/tandara-admin-integration.test.mjs
```

## Changed files

- `ADMIN_IT_AUDIT.md`
- `backend/app/routers/attendance.py`
- `backend/app/routers/audit_logs.py`
- `backend/app/routers/classes.py`
- `backend/app/routers/guardians.py`
- `backend/app/routers/imports.py`
- `backend/app/routers/reports.py`
- `backend/app/routers/students.py`
- `backend/app/routers/users.py`
- `backend/tests/test_admin_integration.py`
- `src/components/admin/FaceEnrollmentDrawer.tsx`
- `src/components/admin/ParentDetailDrawer.tsx`
- `src/components/admin/StudentFormModal.tsx`
- `src/components/admin/StudentImportModal.tsx`
- `src/components/admin/UserFormModal.tsx`
- `src/components/layout/TopHeader.tsx`
- `src/components/teacher/AttendanceSchedulePanel.tsx`
- `src/components/ui/DataTable.tsx`
- `src/context/AuthContext.tsx`
- `src/layouts/DashboardLayout.tsx`
- `src/pages/admin/AdminClassesUsersPage.tsx`
- `src/pages/admin/AdminDashboardPage.tsx`
- `src/pages/admin/AdminDevicesSystemPage.tsx`
- `src/pages/admin/AdminParentsPage.tsx`
- `src/pages/admin/AdminStudentsPage.tsx`
- `src/services/admin-integration.test.ts`
- `src/services/api.ts`
- `src/services/students.service.ts`

Shared changes are limited to contracts/components necessary for Admin: API client, authentication logout state, table pagination, header date/layout audit modal, and the existing attendance schedule panel now reused by Admin. Attendance router changes affect only list query filters/access, not scan/take/recognition. No model, liveness, matching, quality threshold, biometric backend algorithm, or Teacher page was edited.

## Requested Git checks

`git status --short` (including this report and new tests):

```text
 M backend/app/routers/attendance.py
 M backend/app/routers/audit_logs.py
 M backend/app/routers/classes.py
 M backend/app/routers/guardians.py
 M backend/app/routers/imports.py
 M backend/app/routers/reports.py
 M backend/app/routers/students.py
 M backend/app/routers/users.py
 M src/components/admin/FaceEnrollmentDrawer.tsx
 M src/components/admin/ParentDetailDrawer.tsx
 M src/components/admin/StudentFormModal.tsx
 M src/components/admin/StudentImportModal.tsx
 M src/components/admin/UserFormModal.tsx
 M src/components/layout/TopHeader.tsx
 M src/components/teacher/AttendanceSchedulePanel.tsx
 M src/components/ui/DataTable.tsx
 M src/context/AuthContext.tsx
 M src/layouts/DashboardLayout.tsx
 M src/pages/admin/AdminClassesUsersPage.tsx
 M src/pages/admin/AdminDashboardPage.tsx
 M src/pages/admin/AdminDevicesSystemPage.tsx
 M src/pages/admin/AdminParentsPage.tsx
 M src/pages/admin/AdminStudentsPage.tsx
 M src/services/api.ts
 M src/services/students.service.ts
?? ADMIN_IT_AUDIT.md
?? backend/tests/test_admin_integration.py
?? src/services/admin-integration.test.ts
```

`git diff --stat` (Git excludes untracked files from this statistic):

```text
 backend/app/routers/attendance.py                  |  6 ++-
 backend/app/routers/audit_logs.py                  |  6 +--
 backend/app/routers/classes.py                     | 10 ++---
 backend/app/routers/guardians.py                   |  1 +
 backend/app/routers/imports.py                     | 20 +++++++---
 backend/app/routers/reports.py                     |  4 +-
 backend/app/routers/students.py                    | 40 ++++++++++++++------
 backend/app/routers/users.py                       |  7 +++-
 src/components/admin/FaceEnrollmentDrawer.tsx      | 33 ++++++++++++-----
 src/components/admin/ParentDetailDrawer.tsx        | 10 +++--
 src/components/admin/StudentFormModal.tsx          | 22 ++++++-----
 src/components/admin/StudentImportModal.tsx        | 18 +++++----
 src/components/admin/UserFormModal.tsx             |  6 +--
 src/components/layout/TopHeader.tsx                |  1 +
 src/components/teacher/AttendanceSchedulePanel.tsx | 21 +++++++----
 src/components/ui/DataTable.tsx                    | 13 ++++---
 src/context/AuthContext.tsx                        |  3 +-
 src/layouts/DashboardLayout.tsx                    |  8 ++--
 src/pages/admin/AdminClassesUsersPage.tsx          | 24 +++++++++---
 src/pages/admin/AdminDashboardPage.tsx             | 43 ++++++++++++++--------
 src/pages/admin/AdminDevicesSystemPage.tsx         |  8 +++-
 src/pages/admin/AdminParentsPage.tsx               | 28 ++++++++------
 src/pages/admin/AdminStudentsPage.tsx              | 28 +++++++++-----
 src/services/api.ts                                | 19 ++++++++--
 src/services/students.service.ts                   | 17 ++++++++-
 25 files changed, 267 insertions(+), 129 deletions(-)
```

`git diff --check`:

```text
(no output; exit 0)
```
