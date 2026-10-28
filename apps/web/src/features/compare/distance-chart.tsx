import type { Sample, SamplePair } from '@rtk/shared';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const fmt2 = (v: number) => v.toFixed(2).replace('.', ',');

/** Distance over time with the ±sigma band and the tape distance as a reference line. */
export function DistanceChart({
  pairs,
  trueDistanceM,
}: {
  pairs: SamplePair<Sample>[];
  trueDistanceM: number | null;
}) {
  if (pairs.length < 2) {
    return <p className="text-sm text-slate-400">Cần ít nhất 2 cặp mẫu để vẽ biểu đồ.</p>;
  }
  const t0 = pairs[0]!.t;
  const data = pairs.map((p) => ({
    s: Math.round((p.t - t0) / 100) / 10,
    d: p.distanceM,
    band: [p.distanceM - p.sigmaM, p.distanceM + p.sigmaM],
  }));

  return (
    <div className="h-64 w-full" role="img" aria-label="Biểu đồ khoảng cách theo thời gian">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <CartesianGrid stroke="#1e293b" />
          <XAxis
            dataKey="s"
            type="number"
            domain={['dataMin', 'dataMax']}
            stroke="#64748b"
            unit=" s"
            fontSize={11}
          />
          <YAxis
            stroke="#64748b"
            fontSize={11}
            unit=" m"
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
            formatter={(v) =>
              Array.isArray(v)
                ? `${fmt2(Number(v[0]))} – ${fmt2(Number(v[1]))} m`
                : `${fmt2(Number(v))} m`
            }
            labelFormatter={(s) => `${s} s`}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill="#38bdf8"
            fillOpacity={0.15}
            name="± sai số"
            isAnimationActive={false}
          />
          <Line
            dataKey="d"
            stroke="#38bdf8"
            dot={false}
            strokeWidth={2}
            name="Khoảng cách"
            isAnimationActive={false}
          />
          {trueDistanceM !== null && (
            <ReferenceLine
              y={trueDistanceM}
              stroke="#34d399"
              strokeDasharray="6 4"
              label={{ value: 'Thước', fill: '#34d399', fontSize: 11, position: 'insideTopRight' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
