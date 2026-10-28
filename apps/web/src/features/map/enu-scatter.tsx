import { pointCloudStats, toEnu, type LatLon, type Sample } from '@rtk/shared';
import { fmtM } from '../../lib/format';
import { DEVICE_COLORS } from '../ui';

const SIZE = 320;
const PAD = 28;

/** Pick a round grid step giving roughly 4–8 lines across the span. */
function gridStep(span: number) {
  const raw = span / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

/**
 * Scatter of both point clouds in metres east/north of device A's first
 * point, with equal axis scales so spreads compare honestly. Ring = CEP50.
 */
export function EnuScatter({ clouds }: { clouds: [Sample[], Sample[]] }) {
  const origin: LatLon | undefined = clouds[0][0] ?? clouds[1][0];
  if (!origin) {
    return (
      <div className="grid h-80 place-items-center rounded-2xl bg-slate-900 text-slate-400">
        Chưa có dữ liệu.
      </div>
    );
  }
  const enu = clouds.map((c) => c.map((s) => toEnu(s, origin)));
  const stats = clouds.map((c) => pointCloudStats(c, origin));
  const all = enu.flat();
  const xs = all.map((p) => p.east);
  const ys = all.map((p) => p.north);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half =
    Math.max(2, (Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2) *
    1.15;
  const scale = (SIZE - 2 * PAD) / (2 * half);
  const px = (e: number) => PAD + (e - (cx - half)) * scale;
  const py = (n: number) => SIZE - PAD - (n - (cy - half)) * scale;
  const step = gridStep(2 * half);
  const lines: number[] = [];
  for (let v = Math.ceil((cx - half) / step) * step; v <= cx + half; v += step) lines.push(v);
  const hlines: number[] = [];
  for (let v = Math.ceil((cy - half) / step) * step; v <= cy + half; v += step) hlines.push(v);

  return (
    <figure className="rounded-2xl bg-slate-900 p-3 ring-1 ring-slate-800">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto w-full max-w-md"
        role="img"
        aria-label="Biểu đồ phân tán vị trí theo mét"
      >
        {lines.map((v) => (
          <g key={`x${v}`}>
            <line x1={px(v)} x2={px(v)} y1={PAD} y2={SIZE - PAD} stroke="#1e293b" />
            <text x={px(v)} y={SIZE - 8} fill="#64748b" fontSize="10" textAnchor="middle">
              {Math.round(v * 100) / 100}
            </text>
          </g>
        ))}
        {hlines.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD} x2={SIZE - PAD} y1={py(v)} y2={py(v)} stroke="#1e293b" />
            <text x={4} y={py(v) + 3} fill="#64748b" fontSize="10">
              {Math.round(v * 100) / 100}
            </text>
          </g>
        ))}
        {enu.map((pts, i) =>
          pts.map((p, j) => (
            <circle
              key={`${i}-${j}`}
              cx={px(p.east)}
              cy={py(p.north)}
              r={2.2}
              fill={DEVICE_COLORS[i]}
              opacity={0.55}
            />
          )),
        )}
        {stats.map((s, i) => {
          if (!s) return null;
          const m = toEnu(s.mean, origin);
          return (
            <g key={`m${i}`}>
              <circle
                cx={px(m.east)}
                cy={py(m.north)}
                r={s.cep50 * scale}
                fill="none"
                stroke={DEVICE_COLORS[i]}
                strokeDasharray="4 3"
              />
              <circle
                cx={px(m.east)}
                cy={py(m.north)}
                r={5}
                fill={DEVICE_COLORS[i]}
                stroke="#0f172a"
                strokeWidth={2}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-xs text-slate-400">
        Trục: mét về phía đông (ngang) và bắc (dọc). Chấm lớn là vị trí trung bình, vòng nét đứt
        chứa 50% số điểm
        {stats.map((s, i) => (s ? ` · máy ${i ? 'B' : 'A'}: ${fmtM(s.cep50)}` : '')).join('')}.
      </figcaption>
    </figure>
  );
}
