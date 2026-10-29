import { useEffect } from 'react';
import { connection } from '../../sync/room-connection';
import { setStore, useRoomStore } from '../../sync/room-store';
import { Banner, Button, Card } from '../ui';
import { CorsConfigCard } from './cors-config-card';
import { CorsQuickTest } from './cors-quick-test';
import { CorsResidualChart } from './cors-residual-chart';
import { CorsStationMap } from './cors-station-map';

const ENV_HELP = `CORS_NTRIP_HOST=rtk2go.com
CORS_NTRIP_MOUNTPOINT=<mountpoint có 1019/1046/1042>
CORS_NTRIP_USER=<email thật>
# hoặc dữ liệu giả để thử: CORS_MOCK=1`;

/** Reference-station page: reachable at /cors without joining a room. */
export function CorsPage() {
  const link = useRoomStore((s) => s.link);
  const cors = useRoomStore((s) => s.cors);

  useEffect(() => {
    connection.watchCors();
  }, []);

  const back = () => {
    connection.leave(false);
    setStore({ corsView: false });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Trạm CORS</h1>
          <p className="mt-1 text-sm text-slate-400">
            Sai số của trạm tham chiếu theo từng vệ tinh, tính từ chính dữ liệu trạm phát.
          </p>
        </div>
        <Button variant="secondary" onClick={back}>
          Về màn chính
        </Button>
      </header>

      {link !== 'online' && !cors && <Banner tone="info">Đang kết nối tới máy chủ…</Banner>}
      {link === 'online' && !cors && (
        <Card title="Module CORS đang tắt">
          <p className="text-sm text-slate-300">
            Máy chủ chưa cấu hình trạm CORS. Đặt biến môi trường rồi khởi động lại server:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
            {ENV_HELP}
          </pre>
        </Card>
      )}
      {cors && (
        <>
          <CorsConfigCard cors={cors} />
          <CorsStationMap station={cors.station} />
          <CorsResidualChart />
          <CorsQuickTest station={cors.station} />
        </>
      )}
    </main>
  );
}
