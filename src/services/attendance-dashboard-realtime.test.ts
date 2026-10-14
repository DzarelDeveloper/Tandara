import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { attendanceService } from './attendance.service';

type SocketMessage = { data: string };

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: SocketMessage) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalLocalStorage = globalThis.localStorage;
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => 'test-token' },
  configurable: true,
});
Object.defineProperty(globalThis, 'WebSocket', { value: MockWebSocket, configurable: true });

afterEach(() => {
  for (const socket of MockWebSocket.instances) {
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
  }
  MockWebSocket.instances = [];
  Object.defineProperty(globalThis, 'WebSocket', { value: originalWebSocket, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true });
});

test('attendance websocket dispatches attendance and session events to dashboard subscribers', () => {
  const events: string[] = [];
  const disconnects: boolean[] = [];
  const unsubscribe = attendanceService.subscribeWithDisconnect(
    (message) => events.push(message.event),
    (disconnected) => disconnects.push(disconnected),
  );
  const socket = MockWebSocket.instances[0];
  assert.ok(socket);
  assert.match(socket.url, /\/ws\/attendance\?token=test-token$/);
  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ event: 'ATTENDANCE_SUCCESS', timestamp: '2026-10-14T10:00:00+07:00', data: {} }) });
  socket.onmessage?.({ data: JSON.stringify({ event: 'SESSION_OPENED', timestamp: '2026-10-14T10:00:00+07:00', data: {} }) });

  assert.deepEqual(events, ['ATTENDANCE_SUCCESS', 'SESSION_OPENED']);
  socket.onclose?.();
  assert.deepEqual(disconnects, [true]);
  unsubscribe();
});
