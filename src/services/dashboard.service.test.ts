import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { dashboardService } from './dashboard.service';

const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => 'test-token' },
  configurable: true,
});

afterEach(() => { globalThis.fetch = originalFetch; });

test('teacher dashboard requests statistics for the displayed attendance date', async () => {
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
  };

  await dashboardService.teacher('2026-09-16');

  assert.equal(new URL(requestedUrl).searchParams.get('attendance_date'), '2026-09-16');
});

test('an empty successful response normalizes to zero counts and no activity', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: null }), { status: 200 });

  assert.deepEqual(await dashboardService.teacher('2026-09-16'), {
    presentToday: 0,
    lateToday: 0,
    excusedToday: 0,
    notPresent: 0,
    faceEngine: '',
    session: null,
    recentAttendance: [],
  });
});

test('an API error remains a rejected request instead of becoming empty statistics', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Layanan backend mengalami gangguan.' }), { status: 503 });

  await assert.rejects(dashboardService.teacher('2026-09-16'), /Layanan backend mengalami gangguan/);
});
