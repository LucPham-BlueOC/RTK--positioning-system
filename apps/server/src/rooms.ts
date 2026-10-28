import { randomInt, randomUUID } from 'node:crypto';
import {
  MAX_DEVICES_PER_ROOM,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type ErrorCode,
  type Role,
  type RoomState,
  type ServerMessage,
} from '@rtk/shared';
import type { Config } from './config';
import type { Store } from './store';

/** Samples older than this are not replayed on join (session samples always are). */
const HISTORY_WINDOW_MS = 2 * 60 * 60 * 1000;
const JOIN_FAILURES_PER_WINDOW = 20;
const JOIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;

/** WebSocket close codes the client acts on. */
export const CLOSE_REPLACED = 4000;
export const CLOSE_KICKED = 4001;

export interface Peer {
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

interface Member {
  peer: Peer;
  deviceId: string;
  role: Role;
  visible: boolean;
}

interface Connection {
  peer: Peer;
  ip: string;
  userAgent: string | null;
  room?: { code: string; deviceId: string; role: Role };
}

export class RoomHub {
  private members = new Map<string, Map<string, Member>>();
  private sessionTimers = new Map<string, NodeJS.Timeout>();
  private joinFailures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private store: Store,
    private config: Config,
    private now: () => number = Date.now,
  ) {}

  connect(peer: Peer, ip: string, userAgent: string | null): Connection {
    return { peer, ip, userAgent };
  }

  handle(conn: Connection, msg: ClientMessage) {
    switch (msg.type) {
      case 'clock.ping':
        return conn.peer.send({ type: 'clock.pong', t0: msg.t0, ts: this.now() });
      case 'room.create':
        return this.create(conn, msg.deviceId, msg.name, msg.role);
      case 'room.join':
        return this.join(conn, msg.code, msg.deviceId, msg.name, msg.role, msg.resume);
    }

    const room = conn.room;
    if (!room) return this.fail(conn, 'not-in-room', 'Chưa vào phòng');

    if ((msg.type === 'sample.batch' || msg.type === 'device.status') && room.role === 'viewer') {
      return this.fail(conn, 'viewer-only', 'Máy ở chế độ chỉ xem không gửi vị trí');
    }

    switch (msg.type) {
      case 'room.leave':
        if (room.role === 'device') this.store.markDeviceLeft(room.code, room.deviceId, this.now());
        this.disconnect(conn);
        conn.room = undefined;
        return;
      case 'room.delete':
        return this.deleteRoom(room.code);
      case 'device.kick':
        if (room.role !== 'viewer') {
          return this.fail(conn, 'viewer-required', 'Chỉ máy xem mới kick được máy đo');
        }
        return this.kick(room.code, msg.deviceId);
      case 'device.status': {
        const m = this.members.get(room.code)?.get(room.deviceId);
        if (m) m.visible = msg.visible;
        return this.broadcastState(room.code);
      }
      case 'sample.batch': {
        const inserted = this.store.insertSamples(
          room.code,
          room.deviceId,
          msg.samples,
          this.now(),
        );
        conn.peer.send({ type: 'sample.ack', maxSeq: Math.max(...msg.samples.map((s) => s.seq)) });
        if (inserted.length) {
          this.broadcast(room.code, { type: 'sample.broadcast', samples: inserted }, room.deviceId);
        }
        return;
      }
      case 'session.start':
        return this.startSession(conn, room.code, msg.durationS);
      case 'session.stop':
        return this.stopSession(room.code);
      case 'session.truth':
        this.store.setTrueDistance(room.code, msg.trueDistanceM);
        return this.broadcastState(room.code);
    }
  }

  disconnect(conn: Connection) {
    const room = conn.room;
    if (!room) return;
    const members = this.members.get(room.code);
    if (members?.get(room.deviceId)?.peer !== conn.peer) return;
    members.delete(room.deviceId);
    if (!members.size) this.members.delete(room.code);
    this.broadcastState(room.code);
  }

  roomState(code: string): RoomState | null {
    const room = this.store.getRoom(code);
    if (!room) return null;
    const members = this.members.get(code);
    const device = (id: string) => {
      const m = members?.get(id);
      return m?.role === 'device' ? m : undefined;
    };
    return {
      code,
      expiresAt: room.expiresAt,
      trueDistanceM: room.trueDistanceM,
      devices: this.store.listDevices(code).map((d) => ({
        ...d,
        online: !!device(d.id),
        visible: device(d.id)?.visible ?? false,
      })),
      viewerCount: [...(members?.values() ?? [])].filter((m) => m.role === 'viewer').length,
      sessions: this.store.listSessions(code, this.now()),
    };
  }

  /** Drop rooms past the retention period and tell anyone still connected. */
  purge() {
    const before = this.now() - this.config.dataRetentionDays * 24 * 60 * 60 * 1000;
    for (const code of this.members.keys()) {
      const room = this.store.getRoom(code);
      if (room && room.createdAt < before) this.deleteRoom(code);
    }
    return this.store.purgeRoomsCreatedBefore(before);
  }

  shutdown() {
    for (const t of this.sessionTimers.values()) clearTimeout(t);
    this.sessionTimers.clear();
  }

  private create(conn: Connection, deviceId: string, name: string, role: Role) {
    const now = this.now();
    const expiresAt = now + this.config.roomTtlHours * 60 * 60 * 1000;
    let code: string;
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
      ).join('');
    } while (!this.store.createRoom(code, now, expiresAt));
    this.enter(conn, code, deviceId, name, role);
  }

  private join(
    conn: Connection,
    code: string,
    deviceId: string,
    name: string,
    role: Role,
    resume: boolean,
  ) {
    if (this.isRateLimited(conn.ip)) {
      return this.fail(conn, 'rate-limited', 'Thử mã quá nhiều lần, hãy đợi vài phút');
    }
    const room = this.store.getRoom(code);
    if (!room || room.expiresAt <= this.now()) {
      this.recordJoinFailure(conn.ip);
      return this.fail(
        conn,
        'room-not-found',
        `Không tìm thấy phòng ${code} hoặc phòng đã hết hạn`,
      );
    }
    if (role === 'device' && resume && this.store.hasLeft(code, deviceId)) {
      return this.fail(conn, 'kicked', `Máy này đã bị kick khỏi phòng ${code}`);
    }
    const known = this.store.listDevices(code);
    if (
      role === 'device' &&
      !known.some((d) => d.id === deviceId) &&
      known.length >= MAX_DEVICES_PER_ROOM
    ) {
      return this.fail(conn, 'room-full', `Phòng ${code} đã đủ ${MAX_DEVICES_PER_ROOM} máy đo`);
    }
    this.enter(conn, code, deviceId, name, role);
  }

  private enter(conn: Connection, code: string, deviceId: string, name: string, role: Role) {
    if (conn.room) this.disconnect(conn);
    const members = this.members.get(code) ?? new Map<string, Member>();
    this.members.set(code, members);
    // A device reconnecting from a new socket replaces its stale one.
    const previous = members.get(deviceId);
    if (previous && previous.peer !== conn.peer) previous.peer.close(CLOSE_REPLACED, 'replaced');

    if (role === 'device') {
      this.store.upsertDevice(code, deviceId, name, conn.userAgent, this.now());
    } else {
      // A browser that measured before and now only watches gives its slot back.
      this.store.markDeviceLeft(code, deviceId, this.now());
    }
    members.set(deviceId, { peer: conn.peer, deviceId, role, visible: true });
    conn.room = { code, deviceId, role };

    this.broadcastState(code);
    conn.peer.send({
      type: 'sample.history',
      samples: this.store.listSamples(code, { since: this.now() - HISTORY_WINDOW_MS }),
    });
  }

  private startSession(conn: Connection, code: string, durationS: number) {
    const now = this.now();
    if (this.store.listSessions(code, now).some((s) => s.endedAt === null)) {
      return this.fail(conn, 'session-active', 'Đang có phiên đo, hãy dừng phiên cũ trước');
    }
    const id = randomUUID();
    this.store.createSession(
      code,
      id,
      now,
      durationS,
      this.store.getRoom(code)?.trueDistanceM ?? null,
    );
    this.sessionTimers.set(
      id,
      setTimeout(
        () => {
          this.sessionTimers.delete(id);
          this.broadcastState(code);
        },
        durationS * 1000 + 50,
      ),
    );
    this.broadcastState(code);
  }

  private stopSession(code: string) {
    const active = this.store.listSessions(code, this.now()).find((s) => s.endedAt === null);
    if (!active) return;
    this.store.stopSession(active.id, this.now());
    clearTimeout(this.sessionTimers.get(active.id));
    this.sessionTimers.delete(active.id);
    this.broadcastState(code);
  }

  /** Free a device's slot at once; if it is connected, tell it and drop its socket. */
  private kick(code: string, deviceId: string) {
    this.store.markDeviceLeft(code, deviceId, this.now());
    const members = this.members.get(code);
    const target = members?.get(deviceId);
    if (target?.role === 'device') {
      members!.delete(deviceId);
      target.peer.send({ type: 'room.kicked' });
      target.peer.close(CLOSE_KICKED, 'kicked');
    }
    this.broadcastState(code);
  }

  private deleteRoom(code: string) {
    this.broadcast(code, { type: 'room.deleted' });
    this.store.deleteRoom(code);
    this.members.delete(code);
  }

  private broadcastState(code: string) {
    const room = this.roomState(code);
    if (room) this.broadcast(code, { type: 'room.state', room });
  }

  private broadcast(code: string, msg: ServerMessage, exceptDeviceId?: string) {
    for (const m of this.members.get(code)?.values() ?? []) {
      if (m.deviceId !== exceptDeviceId) m.peer.send(msg);
    }
  }

  private fail(conn: Connection, code: ErrorCode, message: string) {
    conn.peer.send({ type: 'error', code, message });
  }

  private isRateLimited(ip: string) {
    const f = this.joinFailures.get(ip);
    if (!f || f.resetAt <= this.now()) return false;
    return f.count >= JOIN_FAILURES_PER_WINDOW;
  }

  private recordJoinFailure(ip: string) {
    const now = this.now();
    const f = this.joinFailures.get(ip);
    if (!f || f.resetAt <= now) {
      this.joinFailures.set(ip, { count: 1, resetAt: now + JOIN_FAILURE_WINDOW_MS });
    } else {
      f.count++;
    }
  }
}
