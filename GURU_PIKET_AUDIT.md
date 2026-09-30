# Guru/Piket functional audit

## Inventory recorded before source edits

Role `GURU_PIKET` is mapped to frontend `TEACHER`. All five routes below use the Teacher ProtectedRoute; Admin routes retain their separate ADMIN_IT guard. Shared shell exposes identity, help and logout, not profile editing.

| Route / component | Visible features | Services and endpoints | Persistence |
| --- | --- | --- | --- |
| /teacher/dashboard / TeacherDashboardPage | Daily cards, current session, recent attendance, start session | dashboardService → GET /api/dashboard/teacher; attendanceService → POST /api/attendance-sessions/open | Attendance, Student, AttendanceSession |
| /teacher/live-attendance / TeacherLiveAttendancePage | Camera selection/start/stop, mode/session, scan, boxes, recent, manual fallback, schedule | attendanceService, sessionsService → active/open/close sessions, POST /api/attendance/scan, /manual, GET /attendance?today=true, settings GET/PUT; /ws/attendance | AttendanceSession, Attendance, AuditLog, notifications; existing face engine/tracker/liveness |
| /teacher/attendance / TeacherAttendancePage | Date/grade/class/status/search, history, correction, CSV, schedule | attendanceService/classesService/reportsService → GET /attendance, /classes, PATCH /attendance/{id}/correction, GET /reports/attendance.csv, settings GET/PUT | Attendance, Student, ClassRoom, AuditLog, settings |
| /teacher/leave-requests / TeacherLeaveRequestsPage | Counts, filters, details, approve/reject and reviewer notes | leaveService → GET /leave-requests, POST /{id}/approve or /reject | LeaveRequest, Attendance, AuditLog, notifications |
| /teacher/reports-corrections / TeacherReportsCorrectionsPage | Period/class/status, metrics/chart, CSV, correction tab/modal, disabled PDF/Excel | reportsService and attendanceService; existing attendance list/correction/CSV contracts | Attendance and correction AuditLog |

All HTTP paths above have /api prefix. Staff mutations retain backend ADMIN_IT/GURU_PIKET authorization. No standalone Teacher student CRUD or profile route exists. Student selection is the existing active-student read endpoint used by manual attendance.

Initial defects: dashboard fabricated loading zeroes and stale session; history grade/search export mismatch and unsupported PERMISSION status; unusable correction selector; report mock metrics/class names/correction requests; leave filter mismatch and incomplete detail response; ignored approval notes; yesterday's session blocks opening; staff attendance socket accepts Parent tokens; live pre-request state flicker, no explicit scan timeout, camera switch race, silent recent/session errors and no reconnect fallback.

Verification and final classifications will be recorded after implementation. No physical camera success is claimed.
