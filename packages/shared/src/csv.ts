import type { SamplePair } from './pairing';
import type { Sample } from './schema';

type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly Cell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

const iso = (t: number) => new Date(t).toISOString();

export const SAMPLE_CSV_HEADER = [
  'session_id',
  'device_id',
  'device_name',
  'seq',
  't_device_iso',
  't_server_iso',
  't_received_iso',
  'lat',
  'lon',
  'alt',
  'accuracy_m',
  'alt_accuracy_m',
  'speed',
  'heading',
  'source',
] as const;

export function samplesToCsv(samples: readonly Sample[], names: ReadonlyMap<string, string>) {
  return toCsv(
    SAMPLE_CSV_HEADER,
    samples.map((s) => [
      s.sessionId,
      s.deviceId,
      names.get(s.deviceId),
      s.seq,
      iso(s.tDevice),
      iso(s.tServer),
      iso(s.tReceived),
      s.lat,
      s.lon,
      s.alt,
      s.accuracy,
      s.altAccuracy,
      s.speed,
      s.heading,
      s.source,
    ]),
  );
}

export const PAIR_CSV_HEADER = [
  't_server_iso',
  'dt_ms',
  'lat_a',
  'lon_a',
  'acc_a',
  'lat_b',
  'lon_b',
  'acc_b',
  'distance_m',
  'sigma_m',
  'true_distance_m',
  'error_m',
] as const;

export function pairsToCsv(pairs: readonly SamplePair<Sample>[], trueDistanceM: number | null) {
  return toCsv(
    PAIR_CSV_HEADER,
    pairs.map((p) => [
      iso(p.t),
      p.dtMs,
      p.a.lat,
      p.a.lon,
      p.a.accuracy,
      p.b.lat,
      p.b.lon,
      p.b.accuracy,
      p.distanceM,
      p.sigmaM,
      trueDistanceM,
      trueDistanceM === null ? null : p.distanceM - trueDistanceM,
    ]),
  );
}
