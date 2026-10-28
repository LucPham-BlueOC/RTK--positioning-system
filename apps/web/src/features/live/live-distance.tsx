import {
  DEFAULT_PAIRING_WINDOW_MS,
  distanceUncertainty,
  haversine,
  type Sample,
} from '@rtk/shared';
import { fmtM, fmtSignedM } from '../../lib/format';

/**
 * Distance from the newest sample of each device. When their times are more
 * than the pairing window apart the reading is shown but flagged, because one
 * phone may have moved since its last fix.
 */
export function LiveDistance({
  lastA,
  lastB,
  trueDistanceM,
}: {
  lastA: Sample | undefined;
  lastB: Sample | undefined;
  trueDistanceM: number | null;
}) {
  if (!lastA || !lastB) {
    return (
      <div className="rounded-2xl bg-slate-900 p-6 text-center text-slate-400 ring-1 ring-slate-800">
        Cần vị trí của cả hai máy để tính khoảng cách.
      </div>
    );
  }
  const d = haversine(lastA, lastB);
  const sigma = distanceUncertainty(lastA.accuracy, lastB.accuracy);
  const dt = Math.abs(lastA.tServer - lastB.tServer);
  const stale = dt >= DEFAULT_PAIRING_WINDOW_MS;

  return (
    <div className="rounded-2xl bg-slate-900 p-6 text-center ring-1 ring-slate-800">
      <div className="text-sm text-slate-400">Khoảng cách</div>
      <div className="tabular text-5xl font-bold" data-testid="live-distance">
        {fmtM(d)}
      </div>
      <div className="tabular mt-1 text-lg text-slate-300">± {fmtM(sigma)}</div>
      {trueDistanceM !== null && (
        <div className="tabular mt-2 text-sm text-slate-400">
          Thật {fmtM(trueDistanceM)} · lệch {fmtSignedM(d - trueDistanceM)}
        </div>
      )}
      <div className={`mt-2 text-xs ${stale ? 'text-amber-300' : 'text-slate-500'}`}>
        Hai mẫu cách nhau {(dt / 1000).toFixed(1).replace('.', ',')} giây
        {stale && ' — chưa ghép được, kết quả có thể cũ'}
      </div>
    </div>
  );
}
