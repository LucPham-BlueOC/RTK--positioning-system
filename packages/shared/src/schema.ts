import { z } from 'zod';

/** Room codes avoid look-alike characters (0/O, 1/I/L) so they can be read aloud. */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const MAX_DEVICES_PER_ROOM = 2;
export const MAX_SAMPLES_PER_BATCH = 600;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), 'Mã phòng không hợp lệ');

export const deviceIdSchema = z.string().uuid();
export const deviceNameSchema = z.string().trim().min(1).max(24);

export const sampleSourceSchema = z.enum(['gnss-inferred', 'network-inferred']);
export type SampleSource = z.infer<typeof sampleSourceSchema>;

/** One position fix as sent by a device. Times are epoch milliseconds. */
export const sampleInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  tDevice: z.number().int().positive(),
  tServer: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  alt: z.number().nullable(),
  accuracy: z.number().nonnegative(),
  altAccuracy: z.number().nonnegative().nullable(),
  speed: z.number().nullable(),
  heading: z.number().nullable(),
  source: sampleSourceSchema,
});
export type SampleInput = z.infer<typeof sampleInputSchema>;

export const sampleSchema = sampleInputSchema.extend({
  deviceId: deviceIdSchema,
  sessionId: z.string().nullable(),
  tReceived: z.number().int().positive(),
});
export type Sample = z.infer<typeof sampleSchema>;

export const deviceStateSchema = z.object({
  id: deviceIdSchema,
  name: deviceNameSchema,
  online: z.boolean(),
  visible: z.boolean(),
  joinedAt: z.number().int(),
});
export type DeviceState = z.infer<typeof deviceStateSchema>;

export const sessionModeSchema = z.enum(['static']);

export const sessionStateSchema = z.object({
  id: z.string(),
  mode: sessionModeSchema,
  startedAt: z.number().int(),
  /** Planned end; equals the actual end once `endedAt` is set. */
  endsAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  durationS: z.number().int(),
  trueDistanceM: z.number().nullable(),
});
export type SessionState = z.infer<typeof sessionStateSchema>;

export const roomStateSchema = z.object({
  code: roomCodeSchema,
  expiresAt: z.number().int(),
  trueDistanceM: z.number().nullable(),
  /** Measuring devices still in the room, at most MAX_DEVICES_PER_ROOM. */
  devices: z.array(deviceStateSchema),
  /** Connected watch-only clients (e.g. the laptop); they never take a slot. */
  viewerCount: z.number().int().nonnegative(),
  sessions: z.array(sessionStateSchema),
});
export type RoomState = z.infer<typeof roomStateSchema>;

/** A device measures and sends its position; a viewer only watches. */
export const roleSchema = z.enum(['device', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

export const STATIC_MIN_S = 60;
export const STATIC_MAX_S = 300;
export const TRUE_DISTANCE_MAX_M = 100_000;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('room.create'),
    deviceId: deviceIdSchema,
    name: deviceNameSchema,
    role: roleSchema.default('device'),
  }),
  z.object({
    type: z.literal('room.join'),
    code: roomCodeSchema,
    deviceId: deviceIdSchema,
    name: deviceNameSchema,
    role: roleSchema.default('device'),
    /** Set by automatic reconnects, which must not take back a slot the device lost. */
    resume: z.boolean().default(false),
  }),
  /** Leave on purpose: a device gives its slot back. */
  z.object({ type: z.literal('room.leave') }),
  z.object({ type: z.literal('room.delete') }),
  /** A viewer removes a measuring device from the room, freeing its slot. */
  z.object({ type: z.literal('device.kick'), deviceId: deviceIdSchema }),
  z.object({ type: z.literal('device.status'), visible: z.boolean() }),
  z.object({ type: z.literal('clock.ping'), t0: z.number() }),
  z.object({
    type: z.literal('sample.batch'),
    samples: z.array(sampleInputSchema).min(1).max(MAX_SAMPLES_PER_BATCH),
  }),
  z.object({
    type: z.literal('session.start'),
    durationS: z.number().int().min(STATIC_MIN_S).max(STATIC_MAX_S),
  }),
  z.object({ type: z.literal('session.stop') }),
  z.object({
    type: z.literal('session.truth'),
    trueDistanceM: z.number().positive().max(TRUE_DISTANCE_MAX_M),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
/** What a client sends; defaulted fields such as `role` may be omitted. */
export type ClientMessageInput = z.input<typeof clientMessageSchema>;

export const errorCodeSchema = z.enum([
  'bad-message',
  'room-not-found',
  'room-full',
  'rate-limited',
  'not-in-room',
  'session-active',
  'viewer-only',
  'viewer-required',
  'kicked',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.state'), room: roomStateSchema }),
  z.object({ type: z.literal('room.deleted') }),
  z.object({ type: z.literal('room.kicked') }),
  z.object({ type: z.literal('clock.pong'), t0: z.number(), ts: z.number() }),
  z.object({ type: z.literal('sample.history'), samples: z.array(sampleSchema) }),
  z.object({ type: z.literal('sample.ack'), maxSeq: z.number().int() }),
  z.object({ type: z.literal('sample.broadcast'), samples: z.array(sampleSchema) }),
  z.object({ type: z.literal('error'), code: errorCodeSchema, message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
