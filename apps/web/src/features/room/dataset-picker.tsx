import { fmtTime } from '../../lib/format';
import { setStore, useRoomStore } from '../../sync/room-store';

/** Choose which data the map, scatter plot, comparison and CSV refer to. */
export function DatasetPicker() {
  const dataset = useRoomStore((s) => s.dataset);
  const sessions = useRoomStore((s) => s.room?.sessions ?? []);

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-slate-400">Dữ liệu</span>
      <select
        className="w-full rounded-lg bg-slate-800 px-2 py-2"
        value={dataset}
        onChange={(e) => setStore({ dataset: e.target.value })}
      >
        <option value="live">Trực tiếp (10 phút gần nhất)</option>
        {[...sessions].reverse().map((s) => (
          <option key={s.id} value={s.id}>
            Đo tĩnh {fmtTime(s.startedAt)} · {Math.round(s.durationS / 60)} phút
            {s.endedAt === null ? ' (đang đo)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
