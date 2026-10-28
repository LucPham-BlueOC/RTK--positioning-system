const ID_KEY = 'rtk.deviceId';
const NAME_KEY = 'rtk.deviceName';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the id just won't survive a reload.
  }
}

let cachedId: string | null = null;

/** Stable per-browser id so a reload rejoins the room as the same device. */
export function getDeviceId(): string {
  cachedId ??= read(ID_KEY) ?? crypto.randomUUID();
  write(ID_KEY, cachedId);
  return cachedId;
}

export const getSavedName = () => read(NAME_KEY);
export const saveName = (name: string) => write(NAME_KEY, name);
