import http from 'node:http';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { db } from './src/db/index.ts';
import { systemSettings } from './src/db/schema.ts';
import { attachWebSocketServer } from './src/server/websocket.ts';
import { authRouter } from './src/server/routes/auth.ts';
import { usersRouter } from './src/server/routes/users.ts';
import { chatsRouter } from './src/server/routes/chats.ts';
import { groupsRouter } from './src/server/routes/groups.ts';
import { statusRouter } from './src/server/routes/status.ts';
import { callsRouter } from './src/server/routes/calls.ts';
import { uploadsRouter, UPLOADS_DIR } from './src/server/routes/uploads.ts';
import { adminRouter } from './src/server/routes/admin.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded media files
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'SmartConnect' });
  });

  // Mount API routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/conversations', chatsRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/status', statusRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/admin', adminRouter);

  // Public system notice / settings check (non-sensitive only)
  app.get('/api/system/public-config', async (_req, res) => {
    try {
      const rows = await db.select().from(systemSettings);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      res.json({
        allowRegistration: map.allowRegistration !== 'false',
        maxUploadMb: Number(map.maxUploadMb || 25),
        globalNotice: map.globalNotice || '',
      });
    } catch {
      res.json({ allowRegistration: true, maxUploadMb: 25, globalNotice: '' });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartConnect server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start SmartConnect server:', err);
  process.exit(1);
});
