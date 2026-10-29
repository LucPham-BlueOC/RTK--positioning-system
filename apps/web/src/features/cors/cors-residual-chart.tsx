import { GNSS_SYSTEMS, type CorsEpoch, type GnssSystem } from '@rtk/shared';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtM, fmtSignedM, fmtTime } from '../../lib/format';
import { useRoomStore } from '../../sync/room-store';
import { Card, Stat } from '../ui';
import { DIAGNOSIS_TEXT, SYSTEM_COLORS, SYSTEM_NAME } from './cors-text';

/** Points drawn per line; older epochs are thinned so 600 × 25 lines stay smooth. */
const MAX_POINTS = 200;

type Filter = 'all' | GnssSystem;
const satKey = (sys: GnssSystem, prn: number) => `${sys}${String(prn).padStart(2, '0')}`;

/** Residuals of the selected system(s), with their RMS and largest magnitude. */
function summarize(sats: CorsEpoch['sats'], filter: Filter) {
  const picked = filter === 'all' ? sats : sats.filter((s) => s.sys === filter);
  const sq = picked.reduce((sum, s) => sum + s.residualM ** 2, 0);
  return {
    sats: picked,
    rmsM: picked.length ? Math.sqrt(sq / picked.length) : 0,
    maxAbsM: picked.reduce((m, s) => Math.max(m, Math.abs(s.residualM)), 0),
  };
}

function thin(epochs: CorsEpoch[]) {
  const step = Math.max(1, Math.ceil(epochs.length / MAX_POINTS));
  return epochs.filter((_, i) => (epochs.length - 1 - i) % step === 0);
}

export function CorsResidualChart() {
  const epochs = useRoomStore((s) => s.corsEpochs);
  const diagnosis = useRoomStore((s) => s.cors?.diagnosis ?? []);
  const [filter, setFilter] = useState<Filter>('all');

  const { data, lines } = useMemo(() => {
    const shown = thin(epochs);
    const keys = new Map<string, GnssSystem>();
    const rows = shown.map((e) => {
      const { sats, rmsM } = summarize(e.sats, filter);
      const row: Record<string, number> = { t: e.at, rms: rmsM };
      for (const s of sats) {
        const key = satKey(s.sys, s.prn);
        keys.set(key, s.sys);
        row[key] = s.residualM;
      }
      return row;
    });
    const sorted = [...keys.entries()].sort(([a], [b]) => a.localeCompare(b));
    const perSys: Record<string, number> = {};
    const lineDefs = sorted.map(([key, sys]) => {
      const i = (perSys[sys] = (perSys[sys] ?? -1) + 1);
      const palette = SYSTEM_COLORS[sys];
      return { key, color: palette[i % palette.length]! };
    });
    return { data: rows, lines: lineDefs };
  }, [epochs, filter]);

  const latest = epochs.at(-1);
  const current = latest && summarize(latest.sats, filter);

  return (
    <Card title="Sai số trạm theo vệ tinh">
      <p className="-mt-2 mb-3 text-xs text-slate-400">
        Sai số tổng của từng vệ tinh tại trạm (gồm khí quyển, đã trừ đồng hồ máy thu của từng hệ).
      </p>
      {!latest || !current ? (
        <div className="flex flex-col gap-2 text-sm text-slate-400">
          {diagnosis.length ? (
            diagnosis.map((d) => <p key={d}>{DIAGNOSIS_TEXT[d]}</p>)
          ) : (
            <p>Chưa có epoch nào được tính.</p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="RMS hiện tại" value={fmtM(current.rmsM)} />
            <Stat label="Lớn nhất" value={fmtM(current.maxAbsM)} />
            <Stat label="Số vệ tinh dùng" value={current.sats.length} />
            <Stat label="Epoch" value={fmtTime(latest.at)} />
          </div>
          <div className="mb-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Lọc hệ vệ tinh">
            {(['all', ...GNSS_SYSTEMS] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1 text-sm ring-1 ${
                  filter === f ? 'bg-sky-500/15 ring-sky-400' : 'bg-slate-800 ring-transparent'
                }`}
              >
                {f === 'all' ? 'Tất cả' : SYSTEM_NAME[f]}
              </button>
            ))}
          </div>
          <div
            className="h-72 w-full"
            role="img"
            aria-label="Biểu đồ sai số từng vệ tinh theo thời gian"
          >
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(t: number) => fmtTime(t)}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  unit=" m"
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
                  labelFormatter={(t) => fmtTime(Number(t))}
                  formatter={(v) => fmtSignedM(Number(v))}
                />
                {lines.map((l) => (
                  <Line
                    key={l.key}
                    dataKey={l.key}
                    stroke={l.color}
                    dot={false}
                    strokeWidth={1}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
                <Line
                  dataKey="rms"
                  name="RMS"
                  stroke="#f8fafc"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h3 className="mt-4 mb-2 text-xs font-semibold text-slate-400 uppercase">
            Epoch mới nhất
          </h3>
          <div className="max-h-72 overflow-auto">
            <table className="tabular w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="py-1 pr-3">Vệ tinh</th>
                  <th className="py-1 pr-3 text-right">Góc ngẩng</th>
                  <th className="py-1 pr-3 text-right">CNR</th>
                  <th className="py-1 text-right">Sai số</th>
                </tr>
              </thead>
              <tbody>
                {[...current.sats]
                  .sort((a, b) => satKey(a.sys, a.prn).localeCompare(satKey(b.sys, b.prn)))
                  .map((s) => (
                    <tr key={satKey(s.sys, s.prn)} className="border-t border-slate-800">
                      <td className="py-1 pr-3 font-mono">{satKey(s.sys, s.prn)}</td>
                      <td className="py-1 pr-3 text-right">{s.elevationDeg.toFixed(0)}°</td>
                      <td className="py-1 pr-3 text-right">
                        {s.cn0 === null ? '—' : `${s.cn0.toFixed(0)} dB-Hz`}
                      </td>
                      <td className="py-1 text-right">{fmtSignedM(s.residualM)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {latest.skipped.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Bỏ qua {latest.skipped.length} vệ tinh (thiếu quỹ đạo, góc ngẩng thấp, không khỏe hoặc
              hệ dưới 4 vệ tinh).
            </p>
          )}
        </>
      )}
    </Card>
  );
}
