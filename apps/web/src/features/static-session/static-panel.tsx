import {
  DEFAULT_STATIC_FILTER,
  filterForStatic,
  staticResult,
  type PointCloudStats,
} from '@rtk/shared';
import { useState } from 'react';
import { fmtDuration, fmtM, fmtSignedM, fmtTime } from '../../lib/format';
import { useDataset } from '../../lib/use-dataset';
import { useNow } from '../../lib/use-now';
import { connection } from '../../sync/room-connection';
import { setStore, useRoomStore } from '../../sync/room-store';
import { Button, Card, Stat } from '../ui';

const DURATIONS = [60, 120, 180, 240, 300];
function CloudStats({ name, s }: { name: string; s: PointCloudStats }) {
  return (
    <div className="tabular text-sm">
      <div className="font-semibold">{name}</div>
      <div className="text-slate-400">
        {s.n} mẫu · lệch chuẩn Đ {fmtM(s.stdEast)} / B {fmtM(s.stdNorth)} · bán kính 50%{' '}
        {fmtM(s.cep50)}
      </div>
    </div>
  );
}

export function StaticPanel() {
  const sessions = useRoomStore((s) => s.room?.sessions ?? []);
  const deviceCount = useRoomStore((s) => s.room?.devices.length ?? 0);
  const [duration, setDuration] = useState(300);
  const now = useNow(500);
  const active = sessions.find((s) => s.endedAt === null && s.endsAt > now);
  const data = useDataset();

  const start = () => {
    connection.send({ type: 'session.start', durationS: duration });
    // Follow the new session once the server announces it.
    const unsub = useRoomStore.subscribe((s) => {
      const fresh = s.room?.sessions.find((x) => x.endedAt === null);
      if (fresh) {
        setStore({ dataset: fresh.id });
        unsub();
      }
    });
    setTimeout(unsub, 5000);
  };

  const session = data.session;
  const filtered = session
    ? {
        a: filterForStatic(data.samplesA, session.startedAt),
        b: filterForStatic(data.samplesB, session.startedAt),
      }
    : null;
  const result = filtered
    ? staticResult(filtered.a.samples, filtered.b.samples)
    : null;
  const fellBack = filtered ? filtered.a.fellBack || filtered.b.fellBack : false;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Đo tĩnh (lấy trung bình)">
        <p className="mb-3 text-sm text-slate-400">
          Đặt hai máy nằm yên, cùng độ cao, màn hình hướng lên trời. Cả hai máy cùng thu trong thời
          gian đã chọn rồi lấy vị trí trung bình. Bỏ {DEFAULT_STATIC_FILTER.warmupS} giây đầu và
          các mẫu có sai số trên {DEFAULT_STATIC_FILTER.maxAccuracyM} m; nếu hết
          {DEFAULT_STATIC_FILTER.timeoutS} giây vẫn chưa có mẫu đạt chuẩn thì dùng fix tốt nhất đã
          thấy.
        </p>
        {active ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-400">Đang đo, còn lại</div>
              <div className="tabular text-4xl font-bold" data-testid="static-countdown">
                {fmtDuration(active.endsAt - now)}
              </div>
            </div>
            <Button variant="danger" onClick={() => connection.send({ type: 'session.stop' })}>
              Dừng
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              className="rounded-xl bg-slate-800 px-3"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              aria-label="Thời lượng đo"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d / 60} phút
                </option>
              ))}
            </select>
            <Button className="flex-1" disabled={deviceCount < 2} onClick={start}>
              Bắt đầu đo
            </Button>
          </div>
        )}
        {deviceCount < 2 && !active && (
          <p className="mt-2 text-xs text-amber-300">Cần đủ 2 máy trong phòng.</p>
        )}
      </Card>

      {session ? (
        <Card title={`Kết quả phiên ${fmtTime(session.startedAt)}`}>
          {result ? (
            <div className="flex flex-col gap-3">
              {fellBack && (
                <p className="text-xs text-amber-300">
                  Chưa có mẫu nào đạt chuẩn {DEFAULT_STATIC_FILTER.maxAccuracyM} m trong{' '}
                  {DEFAULT_STATIC_FILTER.timeoutS} s đầu — kết quả dùng fix tốt nhất đã thấy.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="Khoảng cách trung bình"
                  value={<span data-testid="static-distance">{fmtM(result.distanceM)}</span>}
                />
                <Stat
                  label="Lệch so với thước"
                  value={
                    data.trueDistanceM === null
                      ? 'Chưa nhập'
                      : fmtSignedM(result.distanceM - data.trueDistanceM)
                  }
                />
              </div>
              <CloudStats name={data.deviceA?.name ?? 'Máy A'} s={result.a} />
              <CloudStats name={data.deviceB?.name ?? 'Máy B'} s={result.b} />
              <p className="text-xs text-slate-500">
                Các mẫu GPS liên tiếp phụ thuộc nhau nên độ chính xác của vị trí trung bình không
                tốt lên theo √N. Hãy đánh giá bằng độ lệch so với thước.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Chưa đủ mẫu hợp lệ trên cả hai máy.</p>
          )}
        </Card>
      ) : (
        sessions.length > 0 && (
          <p className="text-sm text-slate-400">
            Chọn một phiên đo tĩnh ở ô "Dữ liệu" phía trên để xem kết quả.
          </p>
        )
      )}
    </div>
  );
}
