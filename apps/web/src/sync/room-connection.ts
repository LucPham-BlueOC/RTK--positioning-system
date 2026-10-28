import {
  serverMessageSchema,
  type ClientMessageInput,
  type Role,
  type Sample,
  type SampleInput,
  type ServerMessage,
} from '@rtk/shared';
import { getDeviceId, saveName } from '../lib/device-identity';
import { ClockSync } from './clock-sync';
import { mergeSamples, setStore, useRoomStore } from './room-store';

const INITIAL_PINGS = 5;
const PING_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 5_000;
const MAX_BATCH = 600;

type Intent = { name: string; role: Role } & ({ kind: 'create' } | { kind: 'join'; code: string });
export type LocalFix = Omit<SampleInput, 'seq' | 'tServer'>;

const ERROR_TEXT: Record<string, string> = {
  'room-not-found': 'Không tìm thấy phòng hoặc phòng đã hết hạn.',
  'room-full': 'Phòng đã đủ 2 máy đo. Máy tính nên vào bằng chế độ "Chỉ xem".',
  'rate-limited': 'Thử quá nhiều lần, hãy đợi vài phút.',
  kicked: 'Máy này đã bị kick khỏi phòng. Bấm "Vào" nếu muốn tham gia lại.',
};

const KICKED_TEXT = 'Máy này đã bị kick khỏi phòng.';

/**
 * Owns the WebSocket: joins the room, keeps the clock offset fresh, and holds
 * every sample in a queue until the server acknowledges it, so a dropped
 * connection loses nothing and a resend never duplicates (the server ignores
 * a repeated device+seq).
 */
class RoomConnection {
  private ws: WebSocket | null = null;
  private intent: Intent | null = null;
  private code: string | null = null;
  private clock = new ClockSync();
  private pending: LocalFix[] = [];
  private queue: SampleInput[] = [];
  private lastSeq = 0;
  private backoff = 1000;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private joined = false;

  start(intent: Intent) {
    this.stop();
    this.intent = intent;
    saveName(intent.name);
    setStore({
      phase: 'connecting',
      role: intent.role,
      error: null,
      notice: null,
      deviceId: getDeviceId(),
    });
    window.addEventListener('online', this.reconnectNow);
    this.open();
  }

  /** Leave the room; `giveUpSlot` tells the server so another phone can take this place. */
  leave(giveUpSlot = true) {
    if (giveUpSlot && this.joined) this.send({ type: 'room.leave' });
    this.stop();
    setStore({ phase: 'home', room: null, samples: {}, pendingCount: 0, dataset: 'live' });
    history.replaceState(null, '', '/');
  }

  send(msg: ClientMessageInput) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Queue a position fix; it is stamped with server time once the clock is known. */
  addFix(fix: LocalFix) {
    this.pending.push(fix);
    this.stampPending();
  }

  private stop() {
    this.intent = null;
    this.code = null;
    this.joined = false;
    this.queue = [];
    this.pending = [];
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    window.removeEventListener('online', this.reconnectNow);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => this.onOpen();
    ws.onmessage = (e) => {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(e.data)));
      if (parsed.success) this.onMessage(parsed.data);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.joined = false;
      if (e.code === 4001) {
        this.leave(false);
        setStore({ notice: KICKED_TEXT });
        return;
      }
      if (e.code === 4000) {
        // Another tab or window took over this device.
        this.stop();
        setStore({ phase: 'home', link: 'offline', error: 'Thiết bị này đã mở phòng ở tab khác.' });
        return;
      }
      if (!this.intent) return;
      setStore({ link: 'reconnecting' });
      this.timers.push(setTimeout(() => this.intent && this.open(), this.backoff));
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    };
  }

  private reconnectNow = () => {
    if (this.intent && !this.ws) {
      this.backoff = 1000;
      this.open();
    }
  };

  private onOpen() {
    const intent = this.intent;
    if (!intent) return;
    const who = { deviceId: getDeviceId(), name: intent.name, role: intent.role };
    // A reconnect must not reclaim a slot this device was kicked from.
    if (this.code) this.send({ type: 'room.join', code: this.code, ...who, resume: true });
    else if (intent.kind === 'create') this.send({ type: 'room.create', ...who });
    else this.send({ type: 'room.join', code: intent.code, ...who });

    for (let i = 0; i < INITIAL_PINGS; i++) {
      this.timers.push(setTimeout(() => this.ping(), i * 200));
    }
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL_MS);
  }

  private ping() {
    this.send({ type: 'clock.ping', t0: Date.now() });
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'clock.pong': {
        const best = this.clock.add(msg.t0, msg.ts, Date.now());
        setStore({ clockOffsetMs: best.offsetMs, clockRttMs: best.rttMs });
        this.stampPending();
        return;
      }
      case 'room.state': {
        const first = !this.code;
        const rejoined = !this.joined;
        this.code = msg.room.code;
        this.joined = true;
        this.backoff = 1000;
        setStore({ phase: 'in-room', link: 'online', room: msg.room, error: null });
        if (first) history.replaceState(null, '', `/r/${msg.room.code}`);
        if (rejoined) this.resendQueue();
        return;
      }
      case 'sample.history':
        mergeSamples(msg.samples, true);
        // Our own unacknowledged samples are not on the server yet; keep showing them.
        mergeSamples(this.queue.map((s) => this.asSample(s)));
        return;
      case 'sample.broadcast':
        mergeSamples(msg.samples);
        return;
      case 'sample.ack':
        this.queue = this.queue.filter((s) => s.seq > msg.maxSeq);
        setStore({ pendingCount: this.queue.length + this.pending.length });
        return;
      case 'room.kicked':
        this.leave(false);
        setStore({ notice: KICKED_TEXT });
        return;
      case 'room.deleted':
        this.leave(false);
        setStore({ notice: 'Phòng đã bị xóa.' });
        return;
      case 'error':
        if (!this.joined && ERROR_TEXT[msg.code]) {
          this.stop();
          setStore({ phase: 'home', link: 'offline', error: ERROR_TEXT[msg.code] });
        } else {
          setStore({ notice: msg.message });
        }
        return;
    }
  }

  /** Give queued fixes a sequence number and server time, show them, and send them. */
  private stampPending() {
    const offset = useRoomStore.getState().clockOffsetMs;
    if (offset === null || !this.pending.length) {
      setStore({ pendingCount: this.queue.length + this.pending.length });
      return;
    }
    const stamped = this.pending.map((fix) => {
      // Time-based sequence stays unique across page reloads of the same device.
      this.lastSeq = Math.max(this.lastSeq + 1, fix.tDevice);
      return { ...fix, seq: this.lastSeq, tServer: Math.round(fix.tDevice + offset) };
    });
    this.pending = [];
    this.queue.push(...stamped);
    mergeSamples(stamped.map((s) => this.asSample(s)));
    setStore({ pendingCount: this.queue.length });
    if (this.joined) this.send({ type: 'sample.batch', samples: stamped });
  }

  /** After (re)joining, resend everything not yet acknowledged. */
  private resendQueue() {
    for (let i = 0; i < this.queue.length; i += MAX_BATCH) {
      this.send({ type: 'sample.batch', samples: this.queue.slice(i, i + MAX_BATCH) });
    }
  }

  private asSample(s: SampleInput): Sample {
    return { ...s, deviceId: getDeviceId(), sessionId: null, tReceived: s.tServer };
  }
}

export const connection = new RoomConnection();
