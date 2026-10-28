import { errorStats } from '@rtk/shared';
import { useState, type FormEvent } from 'react';
import { fmtM, fmtPercent, fmtSignedM, parseMetres } from '../../lib/format';
import { useDataset } from '../../lib/use-dataset';
import { connection } from '../../sync/room-connection';
import { Button, Card, Stat } from '../ui';
import { DistanceChart } from './distance-chart';

export function ComparePanel() {
  const data = useDataset();
  const [input, setInput] = useState('');
  const parsed = parseMetres(input);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parsed === null) return;
    connection.send({ type: 'session.truth', trueDistanceM: parsed });
    setInput('');
  };

  const stats =
    data.trueDistanceM !== null && data.pairs.length
      ? errorStats(data.pairs, data.trueDistanceM)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Khoảng cách thật (đo bằng thước)">
        <form onSubmit={submit} className="flex gap-2">
          <input
            className="tabular w-full rounded-xl bg-slate-800 px-3 py-3 text-lg outline-none ring-sky-500 focus:ring-2"
            inputMode="decimal"
            placeholder={
              data.trueDistanceM === null
                ? 'ví dụ 20,00'
                : String(data.trueDistanceM).replace('.', ',')
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Khoảng cách thật, mét"
          />
          <Button type="submit" disabled={parsed === null}>
            Lưu
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Hiện tại: <span data-testid="true-distance">{fmtM(data.trueDistanceM)}</span>. Giá trị
          được gán cho phòng và phiên đo tĩnh gần nhất; phiên mới dùng giá trị hiện tại khi bắt đầu.
        </p>
      </Card>

      <Card title={`Sai số so với thước · ${data.pairs.length} cặp mẫu`}>
        {stats ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="error-stats">
            <Stat
              label="Sai số trung bình"
              value={fmtSignedM(stats.bias)}
              hint="Dương: điện thoại đo dài hơn thước"
            />
            <Stat label="Sai số tuyệt đối TB" value={fmtM(stats.mae)} />
            <Stat label="Độ lệch chuẩn" value={fmtM(stats.std)} />
            <Stat label="RMSE" value={fmtM(stats.rmse)} />
            <Stat label="Sai số lớn nhất" value={fmtM(stats.maxAbs)} />
            <Stat
              label="Nằm trong ± sai số"
              value={fmtPercent(stats.withinSigma)}
              hint="Tỉ lệ cặp có |sai số| ≤ độ bất định do máy báo"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {data.trueDistanceM === null
              ? 'Nhập khoảng cách thật để xem thống kê.'
              : 'Chưa có cặp mẫu nào ghép được.'}
          </p>
        )}
      </Card>

      <Card title="Khoảng cách theo thời gian">
        <DistanceChart pairs={data.pairs} trueDistanceM={data.trueDistanceM} />
      </Card>
    </div>
  );
}
