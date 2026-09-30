import assert from 'node:assert/strict';
import test from 'node:test';
import { fromScanAttendance, fromAttendanceEvent, fromStoredAttendance, mergeRecentAttendance } from './recent-attendance';
import type { FaceScanResult } from '../services/attendance.service';

const scan: FaceScanResult = {
  id: '11', studentId: '7', studentName: 'Dzarel', nis: '007', className: 'XII-A',
  date: '2026-09-30', mode: 'CHECK_IN', status: 'PRESENT', method: 'FACE',
  similarity: .8, faceBox: null, recordedAt: '2026-09-30T07:00:00+07:00',
  checkInTime: '2026-09-30T07:00:00+07:00', checkOutTime: null,
};
const socket = {
  attendance_id: 11, student_id: 7, student_name: 'Dzarel', nis: '007', class_name: 'XII-A',
  mode: 'CHECK_IN', status: 'PRESENT', recorded_at: scan.recordedAt,
};

test('scan success immediately produces a complete recent attendance entry', () => {
  const recent = mergeRecentAttendance([], fromScanAttendance(scan));
  assert.equal(recent.length, 1);
  assert.equal(recent[0].studentName, 'Dzarel');
  assert.equal(recent[0].nis, '007');
  assert.equal(recent[0].className, 'XII-A');
  assert.equal(recent[0].eventType, 'CHECK_IN');
  assert.equal(recent[0].attendanceStatus, 'PRESENT');
  assert.equal(recent[0].timestamp, scan.recordedAt);
});

test('HTTP and delayed WebSocket deduplicate in either arrival order', () => {
  const http = fromScanAttendance(scan);
  const ws = fromAttendanceEvent(socket, '2026-09-30T07:01:00+07:00')!;
  for (const [first, second] of [[http, ws], [ws, http]]) {
    const recent = mergeRecentAttendance(mergeRecentAttendance([], first), second);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].attendanceId, '11');
    assert.equal(recent[0].similarityScore, .8);
  }
});

test('later student is prepended and replay of older entry does not reorder it', () => {
  let recent = mergeRecentAttendance([], fromScanAttendance(scan));
  const later = { ...scan, id: '12', studentId: '8', studentName: 'Azzam', recordedAt: '2026-09-30T07:00:03+07:00' };
  recent = mergeRecentAttendance(recent, fromScanAttendance(later));
  recent = mergeRecentAttendance(recent, fromAttendanceEvent(socket, scan.recordedAt)!);
  assert.deepEqual(recent.map((item) => item.studentName), ['Azzam', 'Dzarel']);
});

test('check-out is retained separately from check-in for the same attendance ID', () => {
  const recent = mergeRecentAttendance(
    [fromScanAttendance(scan)],
    fromScanAttendance({ ...scan, mode: 'CHECK_OUT', recordedAt: '2026-09-30T15:00:00+07:00' }),
  );
  assert.deepEqual(recent.map((item) => item.eventType), ['CHECK_OUT', 'CHECK_IN']);
});

test('stored attendance restores both modes after reload without duplicating live results', () => {
  const rows = fromStoredAttendance({
    ...scan, status: 'LATE', isCorrected: false, parentNotified: false,
    checkInTime: scan.checkInTime ?? undefined, checkOutTime: '2026-09-30T15:30:00+07:00',
  });
  const recent = rows.reduce(mergeRecentAttendance, [fromScanAttendance(scan)]);
  assert.equal(recent.length, 2);
  assert.deepEqual(recent.map((item) => item.eventType), ['CHECK_OUT', 'CHECK_IN']);
  assert.equal(recent[1].attendanceStatus, 'LATE');
  assert.equal(recent[1].similarityScore, .8);
});

test('records without a check-in or check-out do not become scan successes', () => {
  const rows = fromStoredAttendance({ ...scan, status: 'SICK', isCorrected: false, parentNotified: false, checkInTime: undefined, checkOutTime: undefined });
  assert.deepEqual(rows, []);
});
