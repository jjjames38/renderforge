// src/api/extended/ecosystem.ts — ProfileCore + CubeInsight API endpoints
//
// Extended API routes that expose ecosystem integrations.
// All routes are under /x/v1/profiles/* and /x/v1/trends/*.
// Returns 503 when the respective service is disabled.

import { FastifyInstance } from 'fastify';
import { config } from '../../config/index.js';
import { ProfileCoreProvider } from '../../create/providers/profilecore.js';
import { CubeInsightProvider } from '../../create/providers/cubeinsight.js';

export async function ecosystemRoutes(app: FastifyInstance) {
  // ── ProfileCore endpoints ──

  const profilecore = config.profilecore.enabled
    ? new ProfileCoreProvider({
        host: config.profilecore.host,
        port: config.profilecore.port,
        mode: config.profilecore.mode,
        cliPath: config.profilecore.cliPath,
      })
    : null;

  const cubeinsight = config.cubeinsight.enabled
    ? new CubeInsightProvider({
        host: config.cubeinsight.host,
        port: config.cubeinsight.port,
        apiKey: config.cubeinsight.apiKey,
      })
    : null;

  // ── Profiles ──

  app.post('/x/v1/profiles/launch', async (req, reply) => {
    if (!profilecore) return reply.status(503).send({ success: false, message: 'ProfileCore is not enabled' });
    const body = req.body as { profileId: string; url?: string };
    if (!body.profileId) return reply.status(400).send({ success: false, message: 'profileId is required' });
    const result = await profilecore.launchProfile(body.profileId, body.url);
    return { success: true, response: result };
  });

  app.post('/x/v1/profiles/close', async (req, reply) => {
    if (!profilecore) return reply.status(503).send({ success: false, message: 'ProfileCore is not enabled' });
    const body = req.body as { profileId: string };
    if (!body.profileId) return reply.status(400).send({ success: false, message: 'profileId is required' });
    await profilecore.closeProfile(body.profileId);
    return { success: true, message: 'Profile closed' };
  });

  app.get('/x/v1/profiles/health', async (req, reply) => {
    if (!profilecore) return reply.status(503).send({ success: false, message: 'ProfileCore is not enabled' });
    const query = req.query as { tier?: string };
    const result = await profilecore.getHealth(query.tier);
    return { success: true, response: result };
  });

  app.get('/x/v1/profiles/list', async (req, reply) => {
    if (!profilecore) return reply.status(503).send({ success: false, message: 'ProfileCore is not enabled' });
    const query = req.query as { tier?: string };
    const result = await profilecore.listProfiles(query.tier);
    return { success: true, response: result };
  });

  // ── Trends (CubeInsight) ──

  app.get('/x/v1/trends/topics', async (req, reply) => {
    if (!cubeinsight) return reply.status(503).send({ success: false, message: 'CubeInsight is not enabled' });
    const query = req.query as { tier?: string; region?: string; limit?: string };
    if (!query.tier) return reply.status(400).send({ success: false, message: 'tier query parameter is required' });
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const result = await cubeinsight.getTrendingTopics(query.tier, query.region, limit);
    return { success: true, response: result };
  });

  app.get('/x/v1/trends/sentiment', async (req, reply) => {
    if (!cubeinsight) return reply.status(503).send({ success: false, message: 'CubeInsight is not enabled' });
    const query = req.query as { video_id?: string };
    if (!query.video_id) return reply.status(400).send({ success: false, message: 'video_id query parameter is required' });
    const result = await cubeinsight.analyzeVideo(query.video_id);
    return { success: true, response: result };
  });

  app.get('/x/v1/trends/channels', async (req, reply) => {
    if (!cubeinsight) return reply.status(503).send({ success: false, message: 'CubeInsight is not enabled' });
    const query = req.query as { q?: string };
    if (!query.q) return reply.status(400).send({ success: false, message: 'q query parameter is required' });
    const result = await cubeinsight.searchChannels(query.q);
    return { success: true, response: result };
  });
}
