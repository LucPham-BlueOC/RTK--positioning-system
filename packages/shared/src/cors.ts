import { z } from 'zod';

/** GPS, Galileo, BeiDou. GLONASS needs per-satellite frequencies and is not handled yet. */
export const gnssSystemSchema = z.enum(['G', 'E', 'C']);
export type GnssSystem = z.infer<typeof gnssSystemSchema>;
export const GNSS_SYSTEMS = gnssSystemSchema.options;

const perSystem = <T extends z.ZodType>(value: T) => z.partialRecord(gnssSystemSchema, value);

export const ecefSchema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Ecef = z.infer<typeof ecefSchema>;

/** Antenna reference point and equipment as broadcast by the reference station. */
export const corsStationSchema = z.object({
  ecef: ecefSchema,
  lat: z.number(),
  lon: z.number(),
  alt: z.number(),
  /** Only message 1006 carries it. */
  antennaHeightM: z.number().nullable(),
  msgType: z.union([z.literal(1005), z.literal(1006), z.literal(1032)]),
  stationId: z.number().int(),
  /** Descriptors from message 1033. */
  antenna: z.string().optional(),
  receiver: z.string().optional(),
  firmware: z.string().optional(),
  at: z.number(),
});
export type CorsStation = z.infer<typeof corsStationSchema>;

export const corsSatResidualSchema = z.object({
  sys: gnssSystemSchema,
  prn: z.number().int().min(1).max(64),
  /** Total error: receiver clock of the system removed, atmosphere kept. */
  residualM: z.number(),
  elevationDeg: z.number(),
  cn0: z.number().nullable(),
});
export type CorsSatResidual = z.infer<typeof corsSatResidualSchema>;

export const corsSkipReasonSchema = z.enum([
  'no-ephemeris',
  'unhealthy',
  'low-elevation',
  'no-signal',
  'too-few-sats',
]);
export type CorsSkipReason = z.infer<typeof corsSkipReasonSchema>;

export const corsEpochSchema = z.object({
  /** Receiver epoch, Unix milliseconds. */
  at: z.number(),
  sats: z.array(corsSatResidualSchema),
  /** Estimated receiver clock bias of each system, metres. */
  clockBiasM: perSystem(z.number()),
  rmsM: z.number(),
  maxAbsM: z.number(),
  skipped: z.array(
    z.object({ sys: gnssSystemSchema, prn: z.number().int(), reason: corsSkipReasonSchema }),
  ),
});
export type CorsEpoch = z.infer<typeof corsEpochSchema>;

export const corsDiagnosisSchema = z.enum([
  'no-station-position',
  'no-ephemeris',
  'no-msm',
  'too-few-sats',
]);
export type CorsDiagnosis = z.infer<typeof corsDiagnosisSchema>;

export const corsErrorSchema = z.enum([
  'auth-failed',
  'mountpoint-not-found',
  'connect-failed',
  'stream-timeout',
]);
export type CorsError = z.infer<typeof corsErrorSchema>;

export const sourcetableMountSchema = z.object({
  mountpoint: z.string(),
  lat: z.number(),
  lon: z.number(),
  formatDetails: z.string(),
});
export type SourcetableMount = z.infer<typeof sourcetableMountSchema>;

export const corsStateSchema = z.object({
  status: z.enum(['off', 'connecting', 'connected', 'reconnecting', 'error']),
  mock: z.boolean(),
  /** The password is never part of the state. */
  host: z.string(),
  port: z.number().int(),
  mountpoint: z.string(),
  station: corsStationSchema.optional(),
  observedMsgTypes: z.array(
    z.object({
      msgType: z.number().int(),
      count: z.number().int(),
      firstAt: z.number(),
      lastAt: z.number(),
    }),
  ),
  ephemerisCount: perSystem(z.number().int()),
  sourcetable: z
    .object({
      /** Format details the caster advertises for the configured mountpoint. */
      advertised: z.string().nullable(),
      /** Mountpoints that advertise ephemeris messages, nearest first when positions are known. */
      withEphemeris: z.array(sourcetableMountSchema),
    })
    .optional(),
  diagnosis: z.array(corsDiagnosisSchema),
  error: corsErrorSchema.optional(),
});
export type CorsState = z.infer<typeof corsStateSchema>;
