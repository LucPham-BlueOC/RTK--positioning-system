import { pairSamples, pairsToCsv, roomCodeSchema, samplesToCsv } from '@rtk/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from './config';
import type { Store } from './store';

const querySchema = z.object({
  kind: z.enum(['samples', 'pairs']).default('samples'),
  session: z.string().optional(),
});

export function registerExport(app: FastifyInstance, store: Store, config: Config) {
  app.get('/api/rooms/:code/export.csv', async (req, reply) => {
    const code = roomCodeSchema.safeParse((req.params as { code: string }).code);
    const query = querySchema.safeParse(req.query);
    if (!code.success || !query.success) return reply.code(400).send({ error: 'bad-request' });

    const room = store.getRoom(code.data);
    if (!room) return reply.code(404).send({ error: 'room-not-found' });

    const { kind, session: sessionId } = query.data;
    const session = sessionId
      ? store.listSessions(room.code, Date.now()).find((s) => s.id === sessionId)
      : undefined;
    if (sessionId && !session) return reply.code(404).send({ error: 'session-not-found' });

    const devices = store.listDevices(room.code);
    const samples = store.listSamples(room.code, { sessionId });
    let body: string;
    if (kind === 'samples') {
      // Devices that left still own samples, so name them too.
      const everyone = store.listDevices(room.code, { includeLeft: true });
      body = samplesToCsv(samples, new Map(everyone.map((d) => [d.id, d.name])));
    } else {
      const [a, b] = devices;
      const pairs =
        a && b
          ? pairSamples(
              samples.filter((s) => s.deviceId === a.id),
              samples.filter((s) => s.deviceId === b.id),
              config.pairingWindowMs,
            )
          : [];
      body = pairsToCsv(pairs, session ? session.trueDistanceM : room.trueDistanceM);
    }

    const suffix = session ? `-${session.id.slice(0, 8)}` : '';
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="rtk-${room.code}-${kind}${suffix}.csv"`)
      .send(body);
  });
}
