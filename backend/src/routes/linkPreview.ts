import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { linkPreviewService } from '../services/linkPreviewService.js';
import { requireAuth } from '../plugins/auth.js';

const linkPreviewQuerySchema = z.object({
  url: z.string().url('A valid URL is required'),
});

export const linkPreviewRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/link-preview?url=...
   * Fetches or retrieves cached link preview with SSRF protection.
   */
  app.get('/link-preview', async (request, reply) => {
    const parsed = linkPreviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid URL parameter',
        details: parsed.error.format(),
      });
    }

    const { url } = parsed.data;
    const preview = await linkPreviewService.getOrFetchPreview(url);

    if (!preview || preview.status === 'failed') {
      return reply.status(404).send({ error: 'Preview not available or blocked for this URL' });
    }

    // Attach local stream URL if image is downloaded
    const imageServeUrl = preview.imagePath ? `/api/previews/${preview.imagePath}/image` : preview.imageUrl;

    return reply.send({
      preview: {
        ...preview,
        imageUrl: imageServeUrl,
      },
    });
  });

  /**
   * GET /api/previews/:filename/image
   * Streams a downloaded link preview thumbnail image from disk.
   */
  app.get('/previews/:filename/image', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeFilename = path.basename(filename);
    const filePath = path.join(linkPreviewService.getStorageDirectory(), safeFilename);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Preview image not found' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    let mime = 'image/jpeg';
    if (ext === '.png') mime = 'image/png';
    else if (ext === '.webp') mime = 'image/webp';
    else if (ext === '.gif') mime = 'image/gif';

    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=604800, immutable'); // 7 days cache

    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });
};
