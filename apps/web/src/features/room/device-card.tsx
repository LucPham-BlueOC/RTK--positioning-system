import type { DeviceState, Sample } from '@rtk/shared';
import { fmtCoord, fmtM } from '../../lib/format';
import { DEVICE_COLORS } from '../ui';

/** No fix for this long counts as lost signal. */
const SIGNAL_TIMEOUT_MS = 5000;

type Signal = 'ok' | 'lost' | 'paused' | 'offline' | 'waiting';

const SIGNAL_TEXT: Record<Signal, [string, string]> = {
  ok: ['Có tín hiệu', 'bg-emerald-500'],
  lost: ['Mất tín hiệu', 'bg-rose-500'],
  paused: ['Tạm dừng (màn hình tắt)', 'bg-amber-500'],
  offline: ['Mất kết nối', 'bg-slate-500'],
  waiting: ['Đang chờ vị trí', 'bg-slate-500'],
};

export function signalOf(device: DeviceState, last: Sample | undefined, now: number): Signal {
  if (!device.online) return 'offline';
  if (!device.visible) return 'paused';
  if (!last) return 'waiting';
  return now - last.tServer <= SIGNAL_TIMEOUT_MS ? 'ok' : 'lost';
}

export function DeviceCard({
  device,
  index,
  samples,
  isMe,
  now,
  onKick,
}: {
  device: DeviceState | undefined;
  index: 0 | 1;
  samples: Sample[];
  isMe: boolean;
  now: number;
  /** Shown to viewers only: removes this device from the room immediately. */
  onKick?: () => void;
}) {
  if (!device) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
        Đang chờ điện thoại vào phòng để đo…
      </div>
    );
  }
  const last = samples.at(-1);
  const signal = signalOf(device, last, now);
  const [label, dot] = SIGNAL_TEXT[signal];

  return (
    <div
      className="rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800"
      data-testid={`device-${index}`}
    >
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: DEVICE_COLORS[index] }} />
        <span className="font-semibold">{device.name}</span>
        {isMe && (
          <span className="rounded bg-slate-800 px-1.5 text-xs text-slate-400">máy này</span>
        )}
        {onKick && (
          <button
            className="ml-auto rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500"
            onClick={onKick}
          >
            Kick
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <dl className="tabular mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
        <dt className="text-slate-400">Sai số</dt>
        <dd>{fmtM(last?.accuracy)}</dd>
        <dt className="text-slate-400">Số mẫu</dt>
        <dd>{samples.length}</dd>
        <dt className="text-slate-400">Nguồn</dt>
        <dd>
          {last ? (last.source === 'gnss-inferred' ? 'GPS (ước đoán)' : 'Mạng (ước đoán)') : '—'}
        </dd>
        <dt className="text-slate-400">Vĩ / kinh</dt>
        <dd className="text-xs leading-5">
          {fmtCoord(last?.lat)}
          <br />
          {fmtCoord(last?.lon)}
        </dd>
      </dl>
    </div>
  );
}
