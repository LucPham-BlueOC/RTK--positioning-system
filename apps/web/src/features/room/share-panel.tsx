import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** QR holds the full room URL so the other phone's camera opens it directly. */
export function SharePanel({ code }: { code: string }) {
  const url = `${location.origin}/r/${code}`;
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 240 }).then(setDataUrl, () => setDataUrl(null));
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-slate-900">
      {dataUrl ? (
        <img src={dataUrl} alt={`Mã QR vào phòng ${code}`} width={240} height={240} />
      ) : null}
      <div className="tabular text-3xl font-bold tracking-[0.3em]">{code}</div>
      <div className="text-center text-xs break-all text-slate-600">{url}</div>
    </div>
  );
}
