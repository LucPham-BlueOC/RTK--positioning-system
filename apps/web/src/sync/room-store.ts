import type { CorsEpoch, CorsState, Role, RoomState, Sample } from '@rtk/shared';
import { create } from 'zustand';

export type Phase = 'home' | 'connecting' | 'in-room';
export type LinkState = 'online' | 'reconnecting' | 'offline';

/** 'live' means the most recent minutes outside any static session. */
export type DatasetId = 'live' | string;

export interface RoomStore {
  phase: Phase;
  link: LinkState;
  error: string | null;
  notice: string | null;
  deviceId: string;
  /** 'viewer' watches only (laptop) and never sends its position. */
  role: Role;
  room: RoomState | null;
  /** Samples per device, sorted by server time, unique by seq. */
  samples: Record<string, Sample[]>;
  clockOffsetMs: number | null;
  clockRttMs: number | null;
  pendingCount: number;
  locationError: string | null;
  wakeLock: 'active' | 'unsupported' | 'released';
  dataset: DatasetId;
  /** The standalone /cors page is open. */
  corsView: boolean;
  /** Null until the server reports a CORS module; it never does when the module is off. */
  cors: CorsState | null;
  corsEpochs: CorsEpoch[];
}

/** Epochs kept for the chart, about ten minutes at 1 Hz. */
export const CORS_EPOCH_LIMIT = 600;

export const useRoomStore = create<RoomStore>(() => ({
  phase: 'home',
  link: 'offline',
  error: null,
  notice: null,
  deviceId: '',
  role: 'device',
  room: null,
  samples: {},
  clockOffsetMs: null,
  clockRttMs: null,
  pendingCount: 0,
  locationError: null,
  wakeLock: 'released',
  dataset: 'live',
  corsView: location.pathname === '/cors',
  cors: null,
  corsEpochs: [],
}));

export const setStore = useRoomStore.setState;

/** Merge samples into the per-device lists, dropping duplicates by (device, seq). */
export function mergeSamples(incoming: readonly Sample[], replace = false) {
  setStore((s) => {
    const next: Record<string, Sample[]> = replace ? {} : { ...s.samples };
    const byDevice = new Map<string, Sample[]>();
    for (const x of incoming) {
      const list = byDevice.get(x.deviceId) ?? [];
      list.push(x);
      byDevice.set(x.deviceId, list);
    }
    for (const [deviceId, list] of byDevice) {
      const seen = new Map((next[deviceId] ?? []).map((x) => [x.seq, x]));
      for (const x of list) seen.set(x.seq, x);
      next[deviceId] = [...seen.values()].sort((a, b) => a.tServer - b.tServer || a.seq - b.seq);
    }
    return { samples: next };
  });
}

/** Current time on the server's clock. */
export const serverNow = () => Date.now() + (useRoomStore.getState().clockOffsetMs ?? 0);
