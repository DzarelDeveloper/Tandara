import { Student } from '../types';
import { studentsService } from './students.service';

// Small external store keeps tab changes, stale requests and mutation refresh testable.
export function createStudentLifecycleStore(fetchStudents = studentsService.getStudents) {
  let state = { active: true, students: [] as Student[], activeCount: null as number | null, inactiveCount: null as number | null, loading: true, error: '', mutating: false };
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const load = async () => {
    const request = ++generation;
    update({ loading: true, error: '', students: [], activeCount: null, inactiveCount: null });
    try {
      const [active, inactive] = await Promise.all([fetchStudents(true), fetchStudents(false)]);
      if (request === generation) update({ students: state.active ? active : inactive, activeCount: active.length, inactiveCount: inactive.length, loading: false });
    } catch (error) {
      if (request === generation) update({ error: error instanceof Error ? error.message : 'Gagal memuat data siswa.', loading: false });
    }
  };
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    selectView: async (active: boolean) => {
      if (state.mutating) return;
      update({ active });
      await load();
    },
    mutate: async <T,>(operation: () => Promise<T>): Promise<T> => {
      if (state.mutating) throw new Error('Perubahan sebelumnya masih diproses.');
      update({ mutating: true });
      try { const result = await operation(); await load(); return result; }
      finally { update({ mutating: false }); }
    },
  };
}
