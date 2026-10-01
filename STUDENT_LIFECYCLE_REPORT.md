# Admin student lifecycle implementation

Implemented on the existing uncommitted Admin audit changes. No commit, push, seed, reset, schema migration, production deletion, or Teacher/Parent UI edit was performed. This report supersedes the earlier audit's “student reactivation UI needs product decision” item.

## Relationship analysis and deletion policy

| Relationship | Archive / reactivate | Eligible permanent deletion |
| --- | --- | --- |
| Student identity, NIS, class, gender | Preserve same row/ID; only is_active changes | Delete the selected Student row |
| Attendance | Preserve all dates, check-in/out and corrections | **BLOCK 409** if any row exists |
| Attendance corrections | Stored in Attendance notes/status/times plus AuditLog | Attendance blocks deletion; historical audit entries are never removed |
| LeaveRequest | Preserve permission/sick requests, review and evidence references | **BLOCK 409** for any request, regardless of status |
| Notification | Preserve notification, recipient, payload and read history | **BLOCK 409** for any notification referencing this student; no history nullification |
| GuardianStudent | Preserve all links | Remove only links whose student_id matches the selected student |
| Student.guardian_id | Preserve primary guardian assignment | Student reference disappears with Student row; Guardian remains |
| Guardian / GuardianAccount / User | Preserve | Preserve accounts and all other relationships; do not delete an unlinked account automatically |
| FaceEnrollment | Preserve metadata, model name, sample count and embedding | Remove selected enrollment row and exclusively owned files |
| Pending face samples | Preserve on archive/reactivate | Remove only selected student's pending directory |
| AuditLog | Preserve existing records; add DEACTIVATE/REACTIVATE | Preserve existing records; add PERMANENT_DELETE with student_id, NIS and name before row removal |
| AttendanceSession | No Student FK | Preserve sessions; no deletion |
| ClassRoom | Preserve | Preserve class; count naturally changes on next read |
| Student.photo_path | Preserve | Nonempty legacy photo reference blocks deletion because ownership/storage is not established |
| Other/future mapped Student FKs | Preserve | Fail closed: inspect mapped FK references, block except explicitly disposable enrollment/guardian links |

No cascade deletion or SET NULL policy was introduced. Unknown database constraints also cause rollback/409; they are not bypassed.

## API design

- `GET /api/students` remains active-only for existing consumers.
- `GET /api/students?is_active=true` explicitly selects active students.
- `GET /api/students?is_active=false` selects inactive students and requires ADMIN_IT. Other roles receive 403; anonymous requests receive 401.
- Existing q/class_id/face_status/page/page_size filters and deterministic Student.id ordering remain intact. Frontend walks all pages for each status and obtains real counts from complete results.
- Existing `DELETE /api/students/{id}` remains soft deletion, preserving rows/history/files and recording DEACTIVATE.
- New `PATCH /api/students/{id}/status` accepts `{ "is_active": true }` (or false), changes only activity, audits REACTIVATE/DEACTIVATE and invalidates recognition caches.
- Existing identity PATCH required the full name/NIS/class payload, so a dedicated status operation avoids resending or overwriting identity/relationship fields. Legacy PATCH status changes remain supported and now also record lifecycle audit/invalidate both directions.
- New `DELETE /api/students/{id}/permanent` is separate and ADMIN_IT-only. Missing ID returns 404; protected history returns 409 with an actionable Nonaktifkan explanation. No force flag or bypass exists.
- Successful permanent deletion returns `{ id, action: "PERMANENT_DELETE", cleanupPending: false }` in the usual data envelope. A post-commit filesystem purge failure returns `cleanupPending: true`, explicitly surfaced in the UI rather than claiming all files were removed.

Reactivation intentionally preserves the existing class relationship even if that class is inactive; it does not silently move the student, alter enrollment, or rewrite historical data.

## Biometric cleanup and concurrency

`services/biometric_cleanup.py` is shared by permanent student deletion and the existing selected-student face deletion endpoint. Cleanup logic is not duplicated.

Only `FACE_ROOT/<student_id>` and `PENDING_ROOT/<student_id>` are eligible. Before touching files, ownership checks reject symbolic links, unexpected subdirectories/non-file entries, enrollment pointers outside the selected student's final directory, and pointers from other students into the selected directories. No global face-directory deletion or ONNX/model deletion is performed.

Selected directories are renamed to unique per-student staging directories below `FACE_ROOT/.deleting`. If staging or SQL commit fails, SQL rolls back and staged files are restored. After commit, only those staged directories are purged. Their names encode student ID and enrollment/pending kind, supporting targeted operational recovery.

Permanent deletion takes a database write lock before checking history. Enrollment sample/complete/discard/delete operations use the same student write lock before file changes, serializing these operations across application workers. SQLite foreign-key enforcement is enabled per connection, so a late insert referencing a deleted student is rejected instead of creating orphaned history. No existing schema was rebuilt or modified. The existing database was inspected read-only and has zero foreign-key violations.

As with any filesystem plus database operation, this is not a distributed crash-atomic transaction: abrupt process/power loss during staging can leave isolated directories requiring recovery. A post-commit purge error also requires targeted Admin cleanup. Inspect the surviving Student/FaceEnrollment and audit state before restoring or purging a specific `<id>-enrollment-*` / `<id>-pending-*` staging directory; never sweep the whole face root. Normal exception rollback and explicit post-commit cleanup reporting are tested. The implementation does not claim automatic recovery from sudden process/power loss.

Inactive students continue to be excluded by the unchanged recognition query. Reactivation invalidates cached vectors and tracked identities; valid preserved YuNet+SFace enrollment becomes eligible on reload. Recognition, quality, similarity and liveness algorithms/thresholds are unchanged.

## Admin UI

- `/admin/students` defaults to **Siswa Aktif** and adds **Siswa Nonaktif**, both with real counts.
- Name/NIS search, class and face filters work against each selected status. Pagination resets when status/filter changes and retains the earlier clamping behavior.
- Tab changes clear selected edit/enrollment/delete dialogs; stale in-flight list responses cannot replace the current view. Loading, errors/retry, empty results and successful refresh are supported for both views.
- Archive rows retain name, NIS, class, gender, primary guardian, face status and an explicit Nonaktif status.
- Active rows keep Edit, face management and Nonaktifkan. Inactive rows allow Edit and Aktifkan Kembali; they do not offer enrollment until active again.
- Deactivation confirmation explicitly explains preservation and future reactivation. Reactivation also asks for confirmation.
- **Hapus Permanen** is under a separated secondary “Tindakan lainnya” disclosure, not a primary row button.
- Its modal shows name/NIS, irreversible-action and protected-history explanations, and requires exact typed `HAPUS`. The submit button is disabled otherwise and during submission. Escape/close is blocked while deletion is in flight.
- Backend 409 text is retained in the modal; no generic replacement or force-delete offer is shown.
- Every successful lifecycle mutation refetches both status lists and counts. Protected/failing mutations retain current rows. List refresh errors remain visible after a confirmed mutation.

## Files changed for this request

Existing audit changes were preserved. These are this request's additions/extensions, not the entire pre-existing dirty tree:

- `backend/app/database.py` — SQLite FK enforcement.
- `backend/app/routers/students.py` — active filter, status operation, separate history-protected permanent deletion, legacy status audit/cache handling.
- `backend/app/routers/face_enrollment.py` — shared scoped cleanup and serialization of file mutations.
- `backend/app/services/biometric_cleanup.py` — new ownership validation, staging, rollback and purge reporting.
- `backend/tests/test_student_lifecycle.py` — 19 new backend regression cases.
- `src/pages/admin/AdminStudentsPage.tsx` — status tabs/counts, archive actions, refresh/state reset, secondary permanent action.
- `src/components/admin/PermanentDeleteStudentModal.tsx` — new typed-confirmation modal.
- `src/services/students.service.ts` — optional is_active query, reactivation and distinct permanent deletion calls.
- `src/services/face-enrollment.service.ts` — expose cleanupPending for honest cleanup feedback.
- `src/services/student-lifecycle.store.ts` — lightweight testable loading/tab/mutation state, race handling and counts.
- `src/services/student-lifecycle.test.ts` — six new frontend tests using existing Node/esbuild conventions.
- `STUDENT_LIFECYCLE_REPORT.md` — this report.

## Test coverage and results

The new backend tests cover active/default/archive queries and filters/pagination; deactivation/reactivation; same ID/NIS, guardian links, enrollment metadata/files and corrected attendance preservation; recognition candidates/cache before and after lifecycle changes; eligible deletion; other student's files/links and parent accounts surviving; attendance/leave/notification 409; Admin versus teacher/parent/anonymous RBAC; all three audit actions and deletion metadata; archive editing; missing records; staging failure; SQL commit failure; symlink and shared-file rejection; legacy photo rejection; explicit cleanupPending; late historical FK rejection; legacy PATCH cache handling; and enrollment calls after permanent deletion.

The six frontend tests cover optional/default status parameters, all three distinct mutation requests, preservation of 409 history explanations with no force retry, tab switching and stale responses, both-list/count refresh after each mutation, and failure/empty/retry state. No new testing framework was installed.

| Verification | Result |
| --- | --- |
| `PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider` | **173 passed**, 0 failures, 33.60 seconds; all previous 154 retained + 19 new |
| Existing frontend Admin regression tests | **9 passed** |
| New frontend lifecycle tests | **6 passed** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS**, 1875 modules |
| `git diff --check` | **PASS**, no output |
| Existing database/model hashes and file set | **UNCHANGED**, all 3 existing files checked |
| Existing database `PRAGMA foreign_key_check` (read-only connection) | **0 violations** |

All destructive tests used conftest's disposable SQLite and isolated temporary face storage. No deletion/lifecycle request was made against the existing local database. No biometric files existed under the local face root at snapshot time, no local biometric files were added/removed, and the entire existing database hash remained unchanged.

Warnings remain non-failing: Starlette/httpx TestClient deprecation and existing Vite config/bundle-size warnings. No threshold/model or Teacher/Parent UI modifications were needed.

Frontend verification exercises actual services and the state store, not browser clicks. Manual browser checks remain appropriate for the confirmation typing, dialog focus/keyboard behavior, tab presentation and responsive layout. No physical camera operation was required or performed.

Reproduce frontend tests:

```bash
node_modules/.bin/esbuild src/services/admin-integration.test.ts --bundle --platform=node --format=esm '--define:import.meta.env={}' --outfile=/tmp/tandara-admin-integration.test.mjs
node /tmp/tandara-admin-integration.test.mjs
node_modules/.bin/esbuild src/services/student-lifecycle.test.ts --bundle --platform=node --format=esm '--define:import.meta.env={}' --outfile=/tmp/tandara-student-lifecycle.test.mjs
node /tmp/tandara-student-lifecycle.test.mjs
```

## Requested Git output

These outputs include the prior uncommitted Admin audit changes. Git diff --stat excludes untracked files. No commit or push.

`git status --short`

```text
 M backend/app/database.py
 M backend/app/routers/attendance.py
 M backend/app/routers/audit_logs.py
 M backend/app/routers/classes.py
 M backend/app/routers/face_enrollment.py
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
 M src/services/face-enrollment.service.ts
 M src/services/students.service.ts
?? ADMIN_IT_AUDIT.md
?? STUDENT_LIFECYCLE_REPORT.md
?? backend/app/services/biometric_cleanup.py
?? backend/tests/test_admin_integration.py
?? backend/tests/test_student_lifecycle.py
?? src/components/admin/PermanentDeleteStudentModal.tsx
?? src/services/admin-integration.test.ts
?? src/services/student-lifecycle.store.ts
?? src/services/student-lifecycle.test.ts
```

`git diff --stat`

```text
 backend/app/database.py                            |   7 +-
 backend/app/routers/attendance.py                  |   6 +-
 backend/app/routers/audit_logs.py                  |   6 +-
 backend/app/routers/classes.py                     |  10 +-
 backend/app/routers/face_enrollment.py             |  28 +++---
 backend/app/routers/guardians.py                   |   1 +
 backend/app/routers/imports.py                     |  20 ++--
 backend/app/routers/reports.py                     |   4 +-
 backend/app/routers/students.py                    | 109 ++++++++++++++++++---
 backend/app/routers/users.py                       |   7 +-
 src/components/admin/FaceEnrollmentDrawer.tsx      |  33 +++++--
 src/components/admin/ParentDetailDrawer.tsx        |  10 +-
 src/components/admin/StudentFormModal.tsx          |  22 +++--
 src/components/admin/StudentImportModal.tsx        |  18 ++--
 src/components/admin/UserFormModal.tsx             |   6 +-
 src/components/layout/TopHeader.tsx                |   1 +
 src/components/teacher/AttendanceSchedulePanel.tsx |  21 ++--
 src/components/ui/DataTable.tsx                    |  13 ++-
 src/context/AuthContext.tsx                        |   3 +-
 src/layouts/DashboardLayout.tsx                    |   8 +-
 src/pages/admin/AdminClassesUsersPage.tsx          |  24 +++--
 src/pages/admin/AdminDashboardPage.tsx             |  43 +++++---
 src/pages/admin/AdminDevicesSystemPage.tsx         |   8 +-
 src/pages/admin/AdminParentsPage.tsx               |  28 +++---
 src/pages/admin/AdminStudentsPage.tsx              |  79 +++++++++++----
 src/services/api.ts                                |  19 +++-
 src/services/face-enrollment.service.ts            |   4 +-
 src/services/students.service.ts                   |  27 ++++-
 28 files changed, 405 insertions(+), 160 deletions(-)
```

`git diff --check`

```text
(no output; exit 0)
```
