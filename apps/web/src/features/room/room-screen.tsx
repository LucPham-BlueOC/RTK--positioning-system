import { useState } from 'react';
import { useDataset, useDevices } from '../../lib/use-dataset';
import { fmtM } from '../../lib/format';
import { useNow } from '../../lib/use-now';
import { connection } from '../../sync/room-connection';
import { setStore, useRoomStore } from '../../sync/room-store';
import { ComparePanel } from '../compare/compare-panel';
import { ExportLinks } from '../export/export-links';
import { LiveDistance } from '../live/live-distance';
import { EnuScatter } from '../map/enu-scatter';
import { PositionMap } from '../map/position-map';
import { StaticPanel } from '../static-session/static-panel';
import { Banner, Button, Card } from '../ui';
import { DatasetPicker } from './dataset-picker';
import { DeviceCard } from './device-card';
import { SharePanel } from './share-panel';

const TABS = [
  ['map', 'Bản đồ'],
  ['scatter', 'Phân tán'],
  ['static', 'Đo tĩnh'],
  ['compare', 'So sánh'],
] as const;
type Tab = (typeof TABS)[number][0];

export function RoomScreen() {
  const room = useRoomStore((s) => s.room)!;
  const me = useRoomStore((s) => s.deviceId);
  const viewer = useRoomStore((s) => s.role) === 'viewer';
  const samples = useRoomStore((s) => s.samples);
  const link = useRoomStore((s) => s.link);
  const locationError = useRoomStore((s) => s.locationError);
  const wakeLock = useRoomStore((s) => s.wakeLock);
  const notice = useRoomStore((s) => s.notice);
  const pendingCount = useRoomStore((s) => s.pendingCount);
  const clockRttMs = useRoomStore((s) => s.clockRttMs);
  const [deviceA, deviceB] = useDevices();
  const [tab, setTab] = useState<Tab>('map');
  const [showShare, setShowShare] = useState(room.devices.length < 2);
  const now = useNow(1000);
  const data = useDataset();

  const listA = deviceA ? (samples[deviceA.id] ?? []) : [];
  const listB = deviceB ? (samples[deviceB.id] ?? []) : [];
  const names: [string, string] = [deviceA?.name ?? 'Máy A', deviceB?.name ?? 'Máy B'];

  const leave = () => {
    if (
      viewer ||
      confirm(
        'Rời phòng sẽ nhường chỗ đo cho máy khác. Dữ liệu đã thu vẫn còn trong CSV. Tiếp tục?',
      )
    )
      connection.leave();
  };

  const kick = (deviceId: string) => connection.send({ type: 'device.kick', deviceId });

  const deleteRoom = () => {
    if (confirm(`Xóa phòng ${room.code} và toàn bộ dữ liệu đã thu?`))
      connection.send({ type: 'room.delete' });
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 pb-12">
      <header className="flex items-center gap-2">
        <button
          className="tabular rounded-xl bg-slate-900 px-3 py-2 text-xl font-bold tracking-[0.3em] ring-1 ring-slate-800"
          onClick={() => setShowShare((v) => !v)}
          aria-expanded={showShare}
          data-testid="room-code"
        >
          {room.code}
        </button>
        <span
          className={`text-xs ${link === 'online' ? 'text-emerald-400' : 'text-amber-300'}`}
          title={clockRttMs === null ? undefined : `Độ trễ mạng ${Math.round(clockRttMs)} ms`}
        >
          {link === 'online' ? 'Đã kết nối' : 'Đang kết nối lại…'}
          {viewer && ' · chỉ xem'}
          {pendingCount > 0 && ` · chờ gửi ${pendingCount}`}
          {room.viewerCount > 0 && ` · ${room.viewerCount} máy đang xem`}
        </span>
        <Button variant="secondary" className="ml-auto" onClick={leave}>
          Rời phòng
        </Button>
      </header>

      {showShare && <SharePanel code={room.code} />}
      {viewer && room.devices.length < 2 && (
        <Banner tone="info">
          Máy này chỉ xem. Mở camera trên hai điện thoại, quét mã QR để vào phòng làm máy đo.
        </Banner>
      )}
      {!viewer && locationError && <Banner tone="error">{locationError}</Banner>}
      {!viewer && wakeLock !== 'active' && (
        <Banner tone="warn">
          {wakeLock === 'unsupported'
            ? 'Trình duyệt không hỗ trợ giữ màn hình sáng. Hãy tắt tự khóa màn hình trong lúc đo.'
            : 'Màn hình có thể tự tắt. Chạm vào trang để giữ sáng, và tắt tự khóa nếu cần.'}
        </Banner>
      )}
      {notice && (
        <button className="text-left" onClick={() => setStore({ notice: null })}>
          <Banner tone="info">{notice} (chạm để đóng)</Banner>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <DeviceCard
          device={deviceA}
          index={0}
          samples={listA}
          isMe={deviceA?.id === me}
          onKick={viewer && deviceA ? () => kick(deviceA.id) : undefined}
          now={now}
        />
        <DeviceCard
          device={deviceB}
          index={1}
          samples={listB}
          isMe={deviceB?.id === me}
          onKick={viewer && deviceB ? () => kick(deviceB.id) : undefined}
          now={now}
        />
      </div>

      <LiveDistance lastA={listA.at(-1)} lastB={listB.at(-1)} trueDistanceM={room.trueDistanceM} />

      <nav
        className="grid grid-cols-4 gap-1 rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800"
        role="tablist"
      >
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`min-h-11 rounded-lg text-sm font-semibold ${tab === id ? 'bg-slate-700' : 'text-slate-400'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <DatasetPicker />

      {tab === 'map' && <PositionMap clouds={[data.samplesA, data.samplesB]} names={names} />}
      {tab === 'scatter' && <EnuScatter clouds={[data.samplesA, data.samplesB]} />}
      {tab === 'static' && <StaticPanel />}
      {tab === 'compare' && <ComparePanel />}

      <Card title="Xuất dữ liệu">
        <ExportLinks code={room.code} />
      </Card>

      <footer className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Phòng hết hạn lúc {new Date(room.expiresAt).toLocaleString('vi-VN')} · {data.pairs.length}{' '}
          cặp · {fmtM(data.trueDistanceM)} thật
        </span>
        <button className="text-rose-400 underline" onClick={deleteRoom}>
          Xóa phòng
        </button>
      </footer>
    </main>
  );
}
