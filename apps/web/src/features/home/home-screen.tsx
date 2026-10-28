import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomCodeSchema, type Role } from '@rtk/shared';
import { useState, type FormEvent } from 'react';
import { getSavedName } from '../../lib/device-identity';
import { connection } from '../../sync/room-connection';
import { useRoomStore } from '../../sync/room-store';
import { Banner, Button, Card } from '../ui';

const codeFromUrl = () => location.pathname.match(/^\/r\/([^/]+)/)?.[1]?.toUpperCase() ?? '';

/** Phones have a touch screen and GPS; anything else (a laptop) defaults to watching only. */
const defaultRole = (): Role =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'device' : 'viewer';

const ROLES: [Role, string, string][] = [
  ['device', 'Máy đo', 'Điện thoại dùng GPS để đo. Mỗi phòng tối đa 2 máy đo.'],
  ['viewer', 'Chỉ xem', 'Máy tính chỉ theo dõi và hiển thị QR, không chiếm chỗ đo.'],
];

export function HomeScreen() {
  const phase = useRoomStore((s) => s.phase);
  const error = useRoomStore((s) => s.error);
  const notice = useRoomStore((s) => s.notice);
  const [code, setCode] = useState(codeFromUrl);
  const [role, setRole] = useState<Role>(defaultRole);
  const [name, setName] = useState(
    () =>
      getSavedName() ??
      (defaultRole() === 'viewer' ? 'Máy tính' : codeFromUrl() ? 'Máy B' : 'Máy A'),
  );
  const busy = phase === 'connecting';
  const validCode = roomCodeSchema.safeParse(code).success;
  const trimmedName = name.trim();

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (validCode && trimmedName)
      connection.start({ kind: 'join', code: code.toUpperCase(), name: trimmedName, role });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Đo khoảng cách GPS</h1>
        <p className="mt-1 text-sm text-slate-400">
          Hai điện thoại vào cùng một phòng để đo khoảng cách giữa chúng và so với khoảng cách thật.
        </p>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="info">{notice}</Banner>}

      <Card title="Máy này dùng để">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Vai trò của máy này">
          {ROLES.map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              onClick={() => setRole(value)}
              className={`rounded-xl p-3 text-left ring-1 ${
                role === value ? 'bg-sky-500/15 ring-sky-400' : 'bg-slate-800 ring-transparent'
              }`}
            >
              <div className="font-semibold">{label}</div>
              <div className="mt-1 text-xs text-slate-400">{hint}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Tên máy này">
        <input
          className="w-full rounded-xl bg-slate-800 px-3 py-3 text-lg outline-none ring-sky-500 focus:ring-2"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          aria-label="Tên máy"
        />
      </Card>

      <Card title="Vào phòng có sẵn">
        <form onSubmit={join} className="flex gap-2">
          <input
            className="tabular w-full rounded-xl bg-slate-800 px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] uppercase outline-none ring-sky-500 focus:ring-2"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="A7K2"
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(new RegExp(`[^${ROOM_CODE_ALPHABET}]`, 'g'), ''),
              )
            }
            aria-label="Mã phòng"
          />
          <Button type="submit" disabled={!validCode || !trimmedName || busy}>
            Vào
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Hoặc quét mã QR trên máy kia bằng camera.</p>
      </Card>

      <Button
        variant="secondary"
        disabled={!trimmedName || busy}
        onClick={() => connection.start({ kind: 'create', name: trimmedName, role })}
      >
        {busy ? 'Đang kết nối…' : 'Tạo phòng mới'}
      </Button>

      <p className="mt-auto text-xs text-slate-500">
        Khi đo: ra chỗ trời thoáng, giữ màn hình sáng và không chuyển sang ứng dụng khác. iPhone
        ngừng gửi vị trí khi tắt màn hình.
      </p>
    </main>
  );
}
