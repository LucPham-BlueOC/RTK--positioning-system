import { inferSource } from '@rtk/shared';
import { useEffect } from 'react';
import { connection } from '../sync/room-connection';
import { setStore } from '../sync/room-store';

/** OSes may deliver fixes faster than 1 Hz; keep roughly one per second. */
const MIN_INTERVAL_MS = 900;

const PERMISSION_HELP =
  'Ứng dụng chưa được phép dùng vị trí. iPhone: Cài đặt → Quyền riêng tư → Dịch vụ định vị → Safari → "Khi dùng ứng dụng" và bật "Vị trí chính xác". Android: chạm biểu tượng ổ khóa cạnh địa chỉ web → Quyền → Vị trí → Cho phép. Sau đó tải lại trang.';

/** Watch the device position while in a room and keep the screen awake. */
export function useLocationTracking(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (!('geolocation' in navigator)) {
      setStore({ locationError: 'Trình duyệt này không hỗ trợ định vị.' });
      return;
    }
    if (!window.isSecureContext) {
      setStore({
        locationError: 'Định vị chỉ chạy qua HTTPS. Hãy mở trang bằng địa chỉ https://.',
      });
      return;
    }

    let lastAccepted = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.timestamp - lastAccepted < MIN_INTERVAL_MS) return;
        lastAccepted = pos.timestamp;
        const c = pos.coords;
        setStore({ locationError: null });
        connection.addFix({
          tDevice: Math.round(pos.timestamp),
          lat: c.latitude,
          lon: c.longitude,
          alt: c.altitude,
          accuracy: c.accuracy,
          altAccuracy: c.altitudeAccuracy,
          speed: c.speed,
          heading: c.heading,
          source: inferSource(c.altitude, c.accuracy),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStore({ locationError: PERMISSION_HELP });
        else if (err.code === err.POSITION_UNAVAILABLE)
          setStore({ locationError: 'Chưa lấy được vị trí. Hãy ra chỗ thoáng, bật GPS.' });
        // TIMEOUT: the watch keeps running; the signal card already shows the gap.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );

    let lock: WakeLockSentinel | null = null;
    const requestLock = async () => {
      if (!('wakeLock' in navigator)) return setStore({ wakeLock: 'unsupported' });
      try {
        lock = await navigator.wakeLock.request('screen');
        setStore({ wakeLock: 'active' });
        lock.addEventListener('release', () => setStore({ wakeLock: 'released' }));
      } catch {
        setStore({ wakeLock: 'released' });
      }
    };
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      connection.send({ type: 'device.status', visible });
      if (visible) void requestLock();
    };

    void requestLock();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release();
    };
  }, [active]);
}
