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
