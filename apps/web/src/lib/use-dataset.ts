import {
  DEFAULT_PAIRING_WINDOW_MS,
  pairSamples,
  type DeviceState,
  type Sample,
  type SamplePair,
  type SessionState,
} from '@rtk/shared';
import { useMemo } from 'react';
import { useRoomStore, type DatasetId } from '../sync/room-store';
import { useNow } from './use-now';

/** The live view covers this many recent minutes. */
export const LIVE_WINDOW_MS = 10 * 60 * 1000;

export interface Dataset {
  id: DatasetId;
  session: SessionState | null;
  deviceA: DeviceState | undefined;
  deviceB: DeviceState | undefined;
  samplesA: Sample[];
  samplesB: Sample[];
  pairs: SamplePair<Sample>[];
  trueDistanceM: number | null;
  from: number;
  to: number;
}

/** Devices in join order: the first is "A", the second "B". */
export function useDevices() {
  const devices = useRoomStore((s) => s.room?.devices);
  return useMemo(() => [...(devices ?? [])].sort((a, b) => a.joinedAt - b.joinedAt), [devices]);
}

/**
 * Samples and pairs for the selected dataset: one static session (by its time
 * window) or the live window. Both screens and the CSV use the same pairing code.
 */
export function useDataset(): Dataset {
  const id = useRoomStore((s) => s.dataset);
  const room = useRoomStore((s) => s.room);
  const samples = useRoomStore((s) => s.samples);
  const [deviceA, deviceB] = useDevices();
  // The live window slides, so refresh it every few seconds.
  const now = useNow(id === 'live' ? 2000 : 0);

  return useMemo(() => {
    const session = room?.sessions.find((s) => s.id === id) ?? null;
    const from = session ? session.startedAt : now - LIVE_WINDOW_MS;
    const to = session ? (session.endedAt ?? session.endsAt) : Infinity;
    const pick = (d?: DeviceState) =>
      d ? (samples[d.id] ?? []).filter((s) => s.tServer >= from && s.tServer <= to) : [];
    const samplesA = pick(deviceA);
    const samplesB = pick(deviceB);
    return {
      id,
      session,
      deviceA,
      deviceB,
      samplesA,
      samplesB,
      pairs: pairSamples(samplesA, samplesB, DEFAULT_PAIRING_WINDOW_MS),
      trueDistanceM: session ? session.trueDistanceM : (room?.trueDistanceM ?? null),
      from,
      to,
    };
  }, [id, room, samples, deviceA, deviceB, now]);
}
