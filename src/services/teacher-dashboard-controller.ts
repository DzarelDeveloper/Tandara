import { TeacherDashboardStats } from './dashboard.service';

export interface TeacherDashboardState {
  stats: TeacherDashboardStats | null;
  isLoading: boolean;
  error: string | null;
}

const refreshEvents = new Set([
  'ATTENDANCE_SUCCESS',
  'ATTENDANCE_CORRECTED',
  'SESSION_OPENED',
  'SESSION_CLOSED',
]);

export class TeacherDashboardController {
  private state: TeacherDashboardState = { stats: null, isLoading: true, error: null };
  private inFlight: Promise<void> | null = null;
  private refreshQueued = false;
  private disposed = false;
  private abortController: AbortController | null = null;

  constructor(
    private readonly load: (signal: AbortSignal) => Promise<TeacherDashboardStats>,
    private readonly onState: (state: TeacherDashboardState) => void,
  ) {}

  refresh(showLoading = false): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.inFlight) {
      this.refreshQueued = true;
      if (showLoading) this.update({ isLoading: true, error: null });
      return this.inFlight;
    }
    this.update({ ...(showLoading ? { isLoading: true } : {}), error: null });
    this.inFlight = this.drainRefreshQueue();
    return this.inFlight;
  }

  handleEvent(event: string): Promise<void> {
    return refreshEvents.has(event) ? this.refresh() : Promise.resolve();
  }

  refreshIfIdle(): Promise<void> {
    return this.inFlight ? Promise.resolve() : this.refresh();
  }

  dispose(): void {
    this.disposed = true;
    this.refreshQueued = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  private async drainRefreshQueue(): Promise<void> {
    try {
      do {
        this.refreshQueued = false;
        this.abortController = new AbortController();
        try {
          const stats = await this.load(this.abortController.signal);
          if (!this.disposed) this.update({ stats, error: null });
        } catch (error) {
          if (!this.disposed) {
            this.update({
              stats: null,
              error: error instanceof Error ? error.message : 'Gagal memuat statistik kehadiran.',
            });
          }
        } finally {
          this.abortController = null;
        }
      } while (this.refreshQueued && !this.disposed);
    } finally {
      this.inFlight = null;
      if (!this.disposed) this.update({ isLoading: false });
    }
  }

  private update(patch: Partial<TeacherDashboardState>): void {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
}
