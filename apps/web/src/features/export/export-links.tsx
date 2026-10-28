import { useRoomStore } from '../../sync/room-store';

/** CSV is generated server-side so it always holds the full stored data. */
export function ExportLinks({ code }: { code: string }) {
  const dataset = useRoomStore((s) => s.dataset);
  const session = dataset === 'live' ? '' : `&session=${encodeURIComponent(dataset)}`;
  const href = (kind: string) => `/api/rooms/${code}/export.csv?kind=${kind}${session}`;
  const cls =
    'flex-1 rounded-xl bg-slate-800 px-3 py-3 text-center text-sm font-semibold hover:bg-slate-700';

  return (
    <div>
      <div className="flex gap-2">
        <a className={cls} href={href('samples')} download>
          CSV mẫu vị trí
        </a>
        <a className={cls} href={href('pairs')} download>
          CSV cặp khoảng cách
        </a>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {dataset === 'live'
          ? 'Xuất toàn bộ dữ liệu của phòng.'
          : 'Xuất dữ liệu của phiên đo tĩnh đang chọn.'}
      </p>
    </div>
  );
}
