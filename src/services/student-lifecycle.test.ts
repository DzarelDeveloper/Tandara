import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { studentsService } from './students.service';
import { createStudentLifecycleStore } from './student-lifecycle.store';
import { Student } from '../types';
import { ApiError } from './api';

const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => 'test-token' }, configurable: true });
afterEach(() => { globalThis.fetch = originalFetch; });
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
const student = (id: string, status: 'ACTIVE' | 'INACTIVE') => ({ id, status, fullName: 'Test Student' } as Student);

test('active/inactive query and backward-compatible default', async () => {
  const urls: URL[] = [];
  globalThis.fetch = async (url) => { urls.push(new URL(String(url))); return response([]); };
  await studentsService.getStudents(); await studentsService.getStudents(true); await studentsService.getStudents(false);
  assert.equal(urls[0].searchParams.has('is_active'), false);
  assert.equal(urls[1].searchParams.get('is_active'), 'true');
  assert.equal(urls[2].searchParams.get('is_active'), 'false');
});

test('deactivate, reactivate and permanent-delete are separate real requests', async () => {
  const calls: { path: string; method?: string; body?: unknown }[] = [];
  globalThis.fetch = async (url, options) => { calls.push({ path: new URL(String(url)).pathname, method: options?.method, body: options?.body ? JSON.parse(String(options.body)) : undefined }); return response({}); };
  await studentsService.deactivateStudent('7'); await studentsService.reactivateStudent('7'); await studentsService.permanentlyDeleteStudent('7');
  assert.deepEqual(calls, [
    { path: '/api/students/7', method: 'DELETE', body: undefined },
    { path: '/api/students/7/status', method: 'PATCH', body: { is_active: true } },
    { path: '/api/students/7/permanent', method: 'DELETE', body: undefined },
  ]);
});

test('protected-history conflict retains backend explanation with no force retry', async () => {
  let calls = 0;
  const message = 'Siswa memiliki riwayat presensi. Gunakan Nonaktifkan agar riwayat tetap tersimpan.';
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ message, code: 'STUDENT_HISTORY_PROTECTED' }), { status: 409 }); };
  await assert.rejects(studentsService.permanentlyDeleteStudent('7'), (error: unknown) => error instanceof ApiError && error.status === 409 && error.message === message);
  assert.equal(calls, 1);
});

test('tab switch clears stale rows, loads both counts, and ignores outdated requests', async () => {
  const pending: { active?: boolean; resolve: (rows: Student[]) => void }[] = [];
  const store = createStudentLifecycleStore((active) => new Promise((resolve) => pending.push({ active, resolve })));
  const first = store.load();
  assert.equal(store.snapshot().active, true);
  const switched = store.selectView(false);
  assert.equal(store.snapshot().active, false);
  assert.equal(store.snapshot().loading, true);
  assert.deepEqual(store.snapshot().students, []);
  pending[2].resolve([student('new-active', 'ACTIVE')]); pending[3].resolve([student('archive', 'INACTIVE')]);
  await switched;
  pending[0].resolve([student('stale', 'ACTIVE')]); pending[1].resolve([]);
  await first;
  assert.equal(store.snapshot().students[0].id, 'archive');
  assert.equal(store.snapshot().activeCount, 1); assert.equal(store.snapshot().inactiveCount, 1);
});

test('each lifecycle mutation refreshes both lists and counts after confirmation', async () => {
  let active = [student('7', 'ACTIVE')]; let inactive: Student[] = [];
  let fetches = 0;
  const store = createStudentLifecycleStore(async (isActive) => { fetches++; return isActive ? active : inactive; });
  await store.load();
  await store.mutate(async () => { inactive = [student('7', 'INACTIVE')]; active = []; });
  assert.equal(store.snapshot().students.length, 0);
  assert.equal(store.snapshot().inactiveCount, 1);
  await store.selectView(false);
  assert.equal(store.snapshot().students[0].id, '7');
  await store.mutate(async () => { active = [student('7', 'ACTIVE')]; inactive = []; });
  assert.equal(store.snapshot().students.length, 0);
  assert.equal(store.snapshot().activeCount, 1);
  await store.selectView(true);
  await store.mutate(async () => { active = []; });
  assert.equal(store.snapshot().activeCount, 0);
  assert.equal(fetches, 12);
});

test('failed mutation keeps existing rows and loading errors support retry', async () => {
  let failLoad = false;
  const store = createStudentLifecycleStore(async (active) => { if (failLoad) throw new Error('Offline'); return active ? [student('7', 'ACTIVE')] : []; });
  await store.load();
  await assert.rejects(store.mutate(async () => { throw new Error('Protected history'); }), /Protected history/);
  assert.equal(store.snapshot().students[0].id, '7');
  assert.equal(store.snapshot().mutating, false);
  failLoad = true; await store.selectView(false);
  assert.equal(store.snapshot().error, 'Offline'); assert.equal(store.snapshot().loading, false);
  failLoad = false; await store.load();
  assert.equal(store.snapshot().error, ''); assert.deepEqual(store.snapshot().students, []);
});
