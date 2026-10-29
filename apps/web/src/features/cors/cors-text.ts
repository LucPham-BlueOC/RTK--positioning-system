import type { CorsDiagnosis, CorsError, CorsState, GnssSystem } from '@rtk/shared';

export const SYSTEM_NAME: Record<GnssSystem, string> = { G: 'GPS', E: 'Galileo', C: 'BeiDou' };

/** One hue per system; satellites of a system share it at different lightness. */
export const SYSTEM_COLORS: Record<GnssSystem, readonly string[]> = {
  G: ['#38bdf8', '#7dd3fc', '#0ea5e9', '#bae6fd', '#0284c7', '#e0f2fe', '#0369a1', '#93c5fd'],
  E: ['#fbbf24', '#fcd34d', '#f59e0b', '#fde68a', '#d97706', '#fef3c7', '#b45309', '#fdba74'],
  C: ['#34d399', '#6ee7b7', '#10b981', '#a7f3d0', '#059669', '#d1fae5', '#047857', '#86efac'],
};

export const STATUS_TEXT: Record<CorsState['status'], string> = {
  off: 'Đang tắt',
  connecting: 'Đang kết nối',
  connected: 'Đã kết nối',
  reconnecting: 'Đang kết nối lại',
  error: 'Lỗi',
};

export const ERROR_TEXT: Record<CorsError, string> = {
  'auth-failed': 'Caster từ chối tài khoản. RTK2go cần email thật làm tên đăng nhập.',
  'mountpoint-not-found': 'Không thấy mountpoint trên caster (trạm có thể đang tắt).',
  'connect-failed': 'Không kết nối được tới caster.',
  'stream-timeout': 'Caster không gửi dữ liệu trong 30 giây.',
};

export const DIAGNOSIS_TEXT: Record<CorsDiagnosis, string> = {
  'no-station-position': 'Trạm chưa phát vị trí anten (1005/1006/1032), chưa tính được sai số.',
  'no-ephemeris': 'Trạm không phát quỹ đạo vệ tinh, không tính được sai số.',
  'no-msm': 'Stream không có dữ liệu đo MSM của GPS, Galileo hay BeiDou.',
  'too-few-sats': 'Có hệ vệ tinh dưới 4 vệ tinh, không ước lượng được đồng hồ máy thu của hệ đó.',
};

/** What each RTCM message number carries, for the diagnostics list. */
export function messageName(type: number) {
  const named: Record<number, string> = {
    1005: 'Vị trí anten trạm',
    1006: 'Vị trí anten trạm + chiều cao',
    1007: 'Tên anten',
    1008: 'Tên + serial anten',
    1032: 'Vị trí trạm vật lý (mạng)',
    1033: 'Anten, máy thu, firmware',
    1019: 'Quỹ đạo GPS',
    1020: 'Quỹ đạo GLONASS (chưa dùng)',
    1042: 'Quỹ đạo BeiDou',
    1044: 'Quỹ đạo QZSS (chưa dùng)',
    1045: 'Quỹ đạo Galileo F/NAV (chưa dùng)',
    1046: 'Quỹ đạo Galileo I/NAV',
    1230: 'Độ lệch code GLONASS (chưa dùng)',
  };
  if (named[type]) return named[type];
  const family: Record<number, string> = {
    1070: 'MSM GPS',
    1080: 'MSM GLONASS (chưa dùng)',
    1090: 'MSM Galileo',
    1100: 'MSM SBAS (chưa dùng)',
    1110: 'MSM QZSS (chưa dùng)',
    1120: 'MSM BeiDou',
  };
  const base = type - (type % 10);
  return family[base] ? `${family[base]} ${type % 10}` : 'Khác';
}
