import Fastify from 'fastify';
import cors from '@fastify/cors';

export async function createServer(opts?: { testing?: boolean }) {
  const app = Fastify({
    logger: opts?.testing ? false : {
      transport: { target: 'pino-pretty' },
    },
  });

  await app.register(cors);

  app.get('/', async () => ({
    name: 'renderforge',
    version: '0.1.0',
    status: 'ok',
  }));

  if (!opts?.testing) {
    await app.ready();
  }

  return app;
}
