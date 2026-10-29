import { ecefToEnu, geodeticToEcef, type CorsStation } from '@rtk/shared';
import { useEffect, useRef, useState } from 'react';
import { fmtCoord, fmtM, fmtSignedM } from '../../lib/format';
import { useRoomStore } from '../../sync/room-store';
import { Banner, Button, Card, Stat } from '../ui';

const TEST_SECONDS = 10;

interface Fix {
  lat: number;
  lon: number;
  alt: number | null;
  accuracy: number;
}

/** One short look at this device's own fix next to the station's current error. */
export function CorsQuickTest({ station }: { station: CorsStation | undefined }) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rms = useRoomStore((s) => s.corsEpochs.at(-1)?.rmsM ?? null);

  const stop = () => {
    clearTimeout(timer.current);
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setRunning(false);
  };

  useEffect(() => stop, []);

  const start = () => {
    if (!('geolocation' in navigator)) {
      setError('Trình duyệt không hỗ trợ định vị.');
      return;
    }
    setError(null);
    setRunning(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) =>
        setFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          alt: p.coords.altitude,
          accuracy: p.coords.accuracy,
        }),
      (e) => {
        setError(e.code === e.PERMISSION_DENIED ? 'Chưa cho phép truy cập vị trí.' : e.message);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    timer.current = setTimeout(stop, TEST_SECONDS * 1000);
  };

  const enu =
    fix && station
      ? ecefToEnu(
          geodeticToEcef({ lat: fix.lat, lon: fix.lon, alt: fix.alt ?? station.alt }),
          station.ecef,
        )
      : null;

  return (
    <Card title="Đo thử máy này">
      <p className="-mt-2 mb-3 text-xs text-slate-400">
        Vị trí thô của máy đang mở trang (không hiệu chỉnh) và khoảng cách tới trạm, đặt cạnh sai số
        hiện tại của trạm.
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      <Button onClick={running ? stop : start} className="mt-2">
        {running ? 'Dừng' : `Đo ${TEST_SECONDS} giây`}
      </Button>
      {fix && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Vĩ độ" value={fmtCoord(fix.lat)} />
          <Stat label="Kinh độ" value={fmtCoord(fix.lon)} />
          <Stat label="Độ chính xác máy báo" value={fmtM(fix.accuracy)} />
          <Stat label="RMS sai số trạm" value={fmtM(rms)} />
          {enu && (
            <>
              <Stat label="Cách trạm" value={fmtM(Math.hypot(enu.east, enu.north))} />
              <Stat label="Đông" value={fmtSignedM(enu.east)} />
              <Stat label="Bắc" value={fmtSignedM(enu.north)} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}
