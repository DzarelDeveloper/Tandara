import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TeacherDashboardStats } from './dashboard.service';
import { TeacherDashboardController, TeacherDashboardState } from './teacher-dashboard-controller';

const stats = (presentToday: number): TeacherDashboardStats => ({
  presentToday,
  lateToday: 1,
  excusedToday: 0,
  notPresent: 2,
  faceEngine: 'READY',
  session: null,
  recentAttendance: [],
});

test('dashboard loading ends and displays successful statistics', async () => {
  const states: TeacherDashboardState[] = [];
  const controller = new TeacherDashboardController(async () => stats(3), (state) => states.push(state));
  const request = controller.refresh(true);

  assert.equal(states.at(-1)?.isLoading, true);
  await request;

  assert.equal(states.at(-1)?.isLoading, false);
  assert.equal(states.at(-1)?.stats?.presentToday, 3);
  assert.equal(states.at(-1)?.error, null);
  controller.dispose();
});

test('dashboard loading ends and exposes API failure for retry', async () => {
  const states: TeacherDashboardState[] = [];
  const controller = new TeacherDashboardController(async () => { throw new Error('API unavailable'); }, (state) => states.push(state));

  await controller.refresh(true);

  assert.equal(states.at(-1)?.isLoading, false);
  assert.equal(states.at(-1)?.stats, null);
  assert.equal(states.at(-1)?.error, 'API unavailable');
  controller.dispose();
});

test('realtime attendance events refresh the current dashboard statistics', async () => {
  const states: TeacherDashboardState[] = [];
  let requests = 0;
  const controller = new TeacherDashboardController(async () => stats(++requests), (state) => states.push(state));

  await controller.refresh(true);
  await controller.handleEvent('ATTENDANCE_SUCCESS');

  assert.equal(requests, 2);
  assert.equal(states.at(-1)?.stats?.presentToday, 2);
  assert.equal(states.at(-1)?.isLoading, false);
  await controller.handleEvent('UNRELATED_EVENT');
  assert.equal(requests, 2);
  controller.dispose();
});

test('overlapping realtime events are coalesced and queued during the current request', async () => {
  const states: TeacherDashboardState[] = [];
  let requests = 0;
  let finishFirst: ((value: TeacherDashboardStats) => void) | undefined;
  const controller = new TeacherDashboardController(
    () => {
      requests += 1;
      if (requests === 1) return new Promise((resolve) => { finishFirst = resolve; });
      return Promise.resolve(stats(requests));
    },
    (state) => states.push(state),
  );
  const firstRequest = controller.refresh(true);
  const firstEvent = controller.handleEvent('SESSION_OPENED');
  const secondEvent = controller.handleEvent('SESSION_CLOSED');
  assert.equal(requests, 1);

  finishFirst?.(stats(1));
  await Promise.all([firstRequest, firstEvent, secondEvent]);

  assert.equal(requests, 2);
  assert.equal(states.at(-1)?.stats?.presentToday, 2);
  controller.dispose();
});

test('polling does not queue another refresh while a request is in flight', async () => {
  let requests = 0;
  let finish: ((value: TeacherDashboardStats) => void) | undefined;
  const controller = new TeacherDashboardController(
    () => {
      requests += 1;
      return new Promise((resolve) => { finish = resolve; });
    },
    () => undefined,
  );
  const initialRequest = controller.refresh(true);
  await controller.refreshIfIdle();
  assert.equal(requests, 1);

  finish?.(stats(1));
  await initialRequest;
  controller.dispose();
});

test('disposing the dashboard prevents late requests from updating state', async () => {
  const states: TeacherDashboardState[] = [];
  let finish: ((value: TeacherDashboardStats) => void) | undefined;
  const controller = new TeacherDashboardController(
    () => new Promise((resolve) => { finish = resolve; }),
    (state) => states.push(state),
  );
  const request = controller.refresh(true);
  controller.dispose();
  finish?.(stats(4));
  await request;

  assert.equal(states.at(-1)?.isLoading, true);
  assert.equal(states.at(-1)?.stats, null);
});
