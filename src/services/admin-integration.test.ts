import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { apiRequest, ApiError } from './api';
import { studentsService } from './students.service';
import { parentsService } from './parents.service';
import { reportsService } from './reports.service';
import { attendanceService } from './attendance.service';
import { authService } from './auth.service';

const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}, configurable: true });
afterEach(() => { globalThis.fetch = originalFetch; storage.clear(); });
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });

test('null active-session data stays null', async () => {
  globalThis.fetch = async () => response(null);
  assert.equal(await apiRequest('/api/attendance-sessions/active'), null);
});

test('student lists include records after the first 500 and send authentication', async () => {
  storage.set('tandara_access_token', 'test-token');
  const urls: string[] = [];
  globalThis.fetch = async (url, options) => {
    urls.push(String(url));
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-token');
    return response(urls.length === 1 ? Array.from({ length: 500 }, (_, i) => ({ id: String(i) })) : [{ id: '500' }]);
  };
  const students = await studentsService.getStudents();
  assert.equal(students.length, 501);
  assert.equal(students[500].id, '500');
  assert.match(urls[1], /page=2&page_size=500/);
});

test('a failed later page rejects rather than returning a partial roster', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? response(Array.from({ length: 500 }, (_, id) => ({ id }))) : new Response(JSON.stringify({ message: 'Unavailable' }), { status: 503 });
  await assert.rejects(studentsService.getStudents(), /Layanan backend/);
});

test('editing identity preserves guardian assignment by omitting relationship fields', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/api\/students\/7$/);
    assert.equal(options?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(options?.body)), { nis: 'AUDIT-7', full_name: 'Edited Student', class_id: 3, gender: 'P' });
    return response({ id: '7' });
  };
  await studentsService.updateStudent('7', { nis: 'AUDIT-7', fullName: 'Edited Student', classId: '3', gender: 'P' });
});

test('CSV export carries current date/class/status filters and returns content', async () => {
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams;
    assert.equal(query.get('date_from'), '2026-09-01');
    assert.equal(query.get('date_to'), '2026-09-30');
    assert.equal(query.get('class_id'), '5');
    assert.equal(query.get('status'), 'LATE');
    return new Response('Tanggal,NIS\n2026-09-01,AUDIT-1\n', { headers: { 'Content-Type': 'text/csv' } });
  };
  const file = await reportsService.downloadAttendanceCsv({ startDate: '2026-09-01', endDate: '2026-09-30', classId: '5', status: 'LATE' });
  assert.match(await file.text(), /AUDIT-1/);
});

test('guardian linking sends numeric IDs and refreshable relationship contract', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/guardians\/2\/students\?relationship=Ibu$/);
    assert.equal(options?.method, 'POST');
    assert.deepEqual(JSON.parse(String(options?.body)), [7]);
    return response({ id: '2', fullName: 'Guardian', phone: '081234567899', username: 'guardian', isActive: true, students: [{ id: '7', fullName: 'Student' }] });
  };
  assert.deepEqual((await parentsService.linkStudents('2', ['7'], 'Ibu')).connectedStudentIds, ['7']);
});

test('schedule saves real contract and propagates rejection', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/api\/attendance\/settings$/);
    assert.equal(options?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(options?.body)), { checkInDeadline: '07:10', checkOutStart: '15:00' });
    return new Response(JSON.stringify({ message: 'Schedule rejected', code: 'VALIDATION_ERROR' }), { status: 422 });
  };
  await assert.rejects(attendanceService.saveSchedule({ checkInDeadline: '07:10', checkOutStart: '15:00' }), (error: unknown) => error instanceof ApiError && error.status === 422);
});

test('logout clears browser credentials even when backend fails', async () => {
  storage.set('tandara_access_token', 'old-token'); storage.set('tandara_session_v1', '{}');
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(authService.logout());
  assert.equal(storage.size, 0);
});


test('validation errors identify fields without exposing submitted secrets', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: [{ loc: ['body', 'password'], msg: 'Too short', input: 'secret-value' }] }), { status: 422 });
  await assert.rejects(apiRequest('/api/users'), (error: unknown) => error instanceof Error && error.message === 'password: Too short');
});
