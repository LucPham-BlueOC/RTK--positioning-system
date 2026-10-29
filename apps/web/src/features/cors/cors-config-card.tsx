import { GNSS_SYSTEMS, type CorsState } from '@rtk/shared';
import { Banner, Card, Stat } from '../ui';
import { DIAGNOSIS_TEXT, ERROR_TEXT, STATUS_TEXT, SYSTEM_NAME, messageName } from './cors-text';

const SUGGESTIONS_SHOWN = 8;

/** Rate of a message type over the time it has been seen. */
function rate(o: CorsState['observedMsgTypes'][number]) {
  const span = (o.lastAt - o.firstAt) / 1000;
  if (o.count < 2 || span <= 0) return '—';
  const perS = (o.count - 1) / span;
  return perS >= 0.95 ? `${perS.toFixed(1)}/s` : `1/${Math.round(1 / perS)} s`;
}

export function CorsConfigCard({ cors }: { cors: CorsState }) {
  const status = `${STATUS_TEXT[cors.status]}${cors.mock ? ' (mock)' : ''}`;
  const source = cors.mock ? 'Dữ liệu giả lập' : `${cors.host}:${cors.port}/${cors.mountpoint}`;
  const suggestions = cors.sourcetable?.withEphemeris.slice(0, SUGGESTIONS_SHOWN) ?? [];

  return (
    <Card title="Kết nối và chẩn đoán">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Trạng thái" value={status} />
        <Stat label="Nguồn" value={<span className="text-sm break-all">{source}</span>} />
        {GNSS_SYSTEMS.map((sys) => (
          <Stat
            key={sys}
            label={`Quỹ đạo ${SYSTEM_NAME[sys]}`}
            value={cors.ephemerisCount[sys] ?? 0}
            hint="Số vệ tinh có quỹ đạo còn hiệu lực"
          />
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {cors.error && <Banner tone="error">{ERROR_TEXT[cors.error]}</Banner>}
        {cors.diagnosis.map((d) => (
          <Banner key={d} tone="warn">
            {DIAGNOSIS_TEXT[d]}
          </Banner>
        ))}
      </div>

      <h3 className="mt-4 mb-2 text-xs font-semibold text-slate-400 uppercase">
        Mã RTCM đang nhận
      </h3>
      {cors.observedMsgTypes.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa nhận được message nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <tbody>
              {cors.observedMsgTypes.map((o) => (
                <tr key={o.msgType} className="border-t border-slate-800">
                  <td className="py-1 pr-3 font-mono">{o.msgType}</td>
                  <td className="py-1 pr-3 text-slate-300">{messageName(o.msgType)}</td>
                  <td className="py-1 pr-3 text-right">{o.count}</td>
                  <td className="py-1 text-right text-slate-400">{rate(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cors.sourcetable && (
        <>
          <h3 className="mt-4 mb-2 text-xs font-semibold text-slate-400 uppercase">
            Mountpoint có phát quỹ đạo (từ sourcetable)
          </h3>
          {cors.sourcetable.advertised !== null && (
            <p className="mb-2 text-xs text-slate-400">
              {cors.mountpoint} quảng cáo:{' '}
              <span className="font-mono">{cors.sourcetable.advertised}</span>
            </p>
          )}
          {suggestions.length === 0 ? (
            <p className="text-sm text-slate-400">
              Caster không có mountpoint nào quảng cáo 1019/1046/1042.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {suggestions.map((m) => (
                <li key={m.mountpoint} className="rounded-lg bg-slate-800/60 px-3 py-2">
                  <span className="font-semibold">{m.mountpoint}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {m.lat.toFixed(2)}, {m.lon.toFixed(2)}
                  </span>
                  <div className="font-mono text-xs break-all text-slate-400">
                    {m.formatDetails}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
