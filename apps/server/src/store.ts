import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { Sample, SampleInput, SessionState } from '@rtk/shared';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export interface RoomRow {
  code: string;
  createdAt: number;
  expiresAt: number;
  trueDistanceM: number | null;
}

export interface DeviceRow {
  id: string;
  name: string;
  joinedAt: number;
}

type Row = Record<string, unknown>;

const toSample = (r: Row): Sample => ({
  deviceId: r.device_id as string,
  sessionId: (r.session_id as string | null) ?? null,
  seq: Number(r.seq),
  tDevice: Number(r.t_device),
  tServer: Number(r.t_server),
  tReceived: Number(r.t_received),
  lat: r.lat as number,
  lon: r.lon as number,
  alt: (r.alt as number | null) ?? null,
  accuracy: r.accuracy as number,
  altAccuracy: (r.alt_accuracy as number | null) ?? null,
  speed: (r.speed as number | null) ?? null,
  heading: (r.heading as number | null) ?? null,
  source: r.source as Sample['source'],
});

/** Sessions past their planned end count as ended, so a restart never leaves one dangling. */
const toSession = (r: Row, now: number): SessionState => {
  const endsAt = Number(r.ends_at);
  const endedAt = r.ended_at === null ? (now >= endsAt ? endsAt : null) : Number(r.ended_at);
  return {
    id: r.id as string,
    mode: 'static',
    startedAt: Number(r.started_at),
    endsAt,
    endedAt,
    durationS: Number(r.duration_s),
    trueDistanceM: (r.true_distance_m as number | null) ?? null,
  };
};

export class Store {
  readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    const current = Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    files.forEach((file, i) => {
      if (i < current) return;
      this.db.exec('BEGIN');
      try {
        this.db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        this.db.exec(`PRAGMA user_version = ${i + 1}`);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    });
  }

  close() {
    this.db.close();
  }

  createRoom(code: string, now: number, expiresAt: number): boolean {
    const r = this.db
      .prepare('INSERT OR IGNORE INTO rooms (code, created_at, expires_at) VALUES (?, ?, ?)')
      .run(code, now, expiresAt);
    return r.changes === 1;
  }

  getRoom(code: string): RoomRow | null {
    const r = this.db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as Row | undefined;
    if (!r) return null;
    return {
      code: r.code as string,
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      trueDistanceM: (r.true_distance_m as number | null) ?? null,
    };
  }

  deleteRoom(code: string) {
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
  }

  /** Remove rooms (and, by cascade, all their data) created before `before`. */
  purgeRoomsCreatedBefore(before: number): number {
    return Number(this.db.prepare('DELETE FROM rooms WHERE created_at < ?').run(before).changes);
  }

  /** Add a device, or bring back one that left (it rejoins at the end of the A/B order). */
  upsertDevice(code: string, id: string, name: string, userAgent: string | null, now: number) {
    this.db
      .prepare(
        `INSERT INTO devices (room_code, id, name, user_agent, joined_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (room_code, id) DO UPDATE SET
           name = excluded.name,
           user_agent = excluded.user_agent,
           joined_at = CASE WHEN left_at IS NULL THEN joined_at ELSE excluded.joined_at END,
           left_at = NULL`,
      )
      .run(code, id, name, userAgent, now);
  }

  /** True when this device once held a slot in the room and has since given it up or been kicked. */
  hasLeft(code: string, id: string): boolean {
    const r = this.db
      .prepare('SELECT left_at FROM devices WHERE room_code = ? AND id = ?')
      .get(code, id) as Row | undefined;
    return r !== undefined && r.left_at !== null;
  }

  markDeviceLeft(code: string, id: string, now: number) {
    this.db
      .prepare('UPDATE devices SET left_at = ? WHERE room_code = ? AND id = ?')
      .run(now, code, id);
  }

  /** Devices holding a measuring slot, in join order; `includeLeft` adds past ones (for CSV names). */
  listDevices(code: string, opts: { includeLeft?: boolean } = {}): DeviceRow[] {
    const where = opts.includeLeft ? '' : ' AND left_at IS NULL';
    return (
      this.db
        .prepare(
          `SELECT id, name, joined_at FROM devices WHERE room_code = ?${where} ORDER BY joined_at, id`,
        )
        .all(code) as Row[]
    ).map((r) => ({ id: r.id as string, name: r.name as string, joinedAt: Number(r.joined_at) }));
  }

  listSessions(code: string, now: number): SessionState[] {
    return (
      this.db
        .prepare('SELECT * FROM sessions WHERE room_code = ? ORDER BY started_at')
        .all(code) as Row[]
    ).map((r) => toSession(r, now));
  }

  createSession(
    code: string,
    id: string,
    now: number,
    durationS: number,
    trueDistanceM: number | null,
  ) {
    this.db
      .prepare(
        `INSERT INTO sessions (id, room_code, mode, started_at, ends_at, duration_s, true_distance_m)
         VALUES (?, ?, 'static', ?, ?, ?, ?)`,
      )
      .run(id, code, now, now + durationS * 1000, durationS, trueDistanceM);
  }

  stopSession(id: string, now: number) {
    this.db.prepare('UPDATE sessions SET ended_at = ?, ends_at = ? WHERE id = ?').run(now, now, id);
  }

  /** Store the tape distance on the room and on its most recent session. */
  setTrueDistance(code: string, trueDistanceM: number) {
    this.db.prepare('UPDATE rooms SET true_distance_m = ? WHERE code = ?').run(trueDistanceM, code);
    this.db
      .prepare(
        `UPDATE sessions SET true_distance_m = ? WHERE id = (
           SELECT id FROM sessions WHERE room_code = ? ORDER BY started_at DESC LIMIT 1)`,
      )
      .run(trueDistanceM, code);
  }

  /**
   * Insert samples, ignoring ones already stored (same device and seq), and
   * return only the newly stored rows. Each sample is tagged with the session
   * whose time window contains it, so late resends still land in the right session.
   */
  insertSamples(
    code: string,
    deviceId: string,
    samples: SampleInput[],
    tReceived: number,
  ): Sample[] {
    const sessions = this.listSessions(code, tReceived);
    const sessionFor = (t: number) =>
      sessions.find((s) => t >= s.startedAt && t <= (s.endedAt ?? s.endsAt))?.id ?? null;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO samples (room_code, device_id, session_id, seq, t_device, t_server,
         t_received, lat, lon, alt, accuracy, alt_accuracy, speed, heading, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const inserted: Sample[] = [];
    this.db.exec('BEGIN');
    try {
      for (const s of samples) {
        const sessionId = sessionFor(s.tServer);
        const r = stmt.run(
          code,
          deviceId,
          sessionId,
          s.seq,
          s.tDevice,
          s.tServer,
          tReceived,
          s.lat,
          s.lon,
          s.alt,
          s.accuracy,
          s.altAccuracy,
          s.speed,
          s.heading,
          s.source,
        );
        if (r.changes === 1) inserted.push({ ...s, deviceId, sessionId, tReceived });
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return inserted;
  }

  /** Samples of a room, optionally limited to one session or to everything since `since`. */
  listSamples(code: string, opts: { sessionId?: string; since?: number } = {}): Sample[] {
    let sql = 'SELECT * FROM samples WHERE room_code = ?';
    const args: (string | number)[] = [code];
    if (opts.sessionId) {
      sql += ' AND session_id = ?';
      args.push(opts.sessionId);
    }
    if (opts.since !== undefined) {
      sql += ' AND (t_server >= ? OR session_id IS NOT NULL)';
      args.push(opts.since);
    }
    sql += ' ORDER BY t_server, id';
    return (this.db.prepare(sql).all(...args) as Row[]).map(toSample);
  }
}
