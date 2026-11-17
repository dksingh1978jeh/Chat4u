import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { profiles, conversationParticipants } from '../db/schema.ts';
import { verifyBearerToken } from './auth.ts';

interface SocketMeta {
  userId: number;
  tokenId?: string;
}

const userSockets = new Map<number, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

export function getOnlineUserIds(): number[] {
  return Array.from(userSockets.keys());
}

export function isUserOnline(userId: number): boolean {
  const set = userSockets.get(userId);
  return Boolean(set && set.size > 0);
}

export function sendToUser(userId: number, event: string, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const serialized = JSON.stringify({ event, payload });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

export function sendToUsers(userIds: number[], event: string, payload: unknown) {
  const uniqueIds = new Set(userIds);
  for (const uid of uniqueIds) {
    sendToUser(uid, event, payload);
  }
}

export function broadcastToAll(event: string, payload: unknown) {
  const serialized = JSON.stringify({ event, payload });
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }
}

export function disconnectSession(userId: number, tokenId: string) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const ws of sockets) {
    const meta = socketMeta.get(ws);
    if (meta && meta.tokenId === tokenId) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'session:revoked', payload: { tokenId } }));
      }
      ws.close(4001, 'Session revoked');
    }
  }
}

async function getConversationPeerIds(conversationId: number, excludeUserId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId).filter((id) => id !== excludeUserId);
}

export function attachWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Missing token');
        return;
      }

      const authUser = await verifyBearerToken(token);
      if (!authUser) {
        ws.close(4001, 'Invalid token');
        return;
      }

      const userId = authUser.id;
      socketMeta.set(ws, { userId, tokenId: authUser.sessionTokenId });

      let set = userSockets.get(userId);
      const wasOffline = !set || set.size === 0;
      if (!set) {
        set = new Set();
        userSockets.set(userId, set);
      }
      set.add(ws);

      if (wasOffline) {
        await db
          .update(profiles)
          .set({ onlineStatus: 'online', lastSeenAt: new Date() })
          .where(eq(profiles.userId, userId));
        broadcastToAll('presence:update', {
          userId,
          onlineStatus: 'online',
          lastSeenAt: new Date().toISOString(),
        });
      }

      ws.send(
        JSON.stringify({
          event: 'ws:ready',
          payload: { userId, onlineUserIds: getOnlineUserIds() },
        })
      );

      ws.on('message', async (rawData) => {
        try {
          const parsed = JSON.parse(rawData.toString());
          const { event, payload } = parsed as { event: string; payload: any };
          if (!event) return;

          if (event === 'typing:start' || event === 'typing:stop') {
            const convId = Number(payload?.conversationId);
            if (!convId) return;
            const peers = await getConversationPeerIds(convId, userId);
            sendToUsers(peers, event, { conversationId: convId, userId });
          } else if (
            event === 'webrtc:offer' ||
            event === 'webrtc:answer' ||
            event === 'webrtc:ice' ||
            event === 'webrtc:hangup' ||
            event === 'webrtc:accept' ||
            event === 'webrtc:reject' ||
            event === 'webrtc:media-state'
          ) {
            const targetUserId = Number(payload?.targetUserId);
            if (targetUserId) {
              sendToUser(targetUserId, event, { ...payload, fromUserId: userId });
            } else if (Array.isArray(payload?.targetUserIds)) {
              const ids = payload.targetUserIds.map(Number).filter((id: number) => id && id !== userId);
              sendToUsers(ids, event, { ...payload, fromUserId: userId });
            }
          } else if (event === 'webrtc:group-join') {
            const convId = Number(payload?.conversationId);
            if (!convId) return;
            const peers = await getConversationPeerIds(convId, userId);
            sendToUsers(peers, 'webrtc:group-join', {
              ...payload,
              fromUserId: userId,
            });
          } else if (event === 'ping') {
            ws.send(JSON.stringify({ event: 'pong', payload: { ts: Date.now() } }));
          }
        } catch (err) {
          console.error('WebSocket message handling error:', err);
        }
      });

      ws.on('close', async () => {
        const currentSet = userSockets.get(userId);
        if (currentSet) {
          currentSet.delete(ws);
          if (currentSet.size === 0) {
            userSockets.delete(userId);
            const now = new Date();
            await db
              .update(profiles)
              .set({ onlineStatus: 'offline', lastSeenAt: now })
              .where(eq(profiles.userId, userId))
              .catch(() => {});
            broadcastToAll('presence:update', {
              userId,
              onlineStatus: 'offline',
              lastSeenAt: now.toISOString(),
            });
          }
        }
      });
    } catch (err) {
      console.error('WebSocket connection error:', err);
      ws.close(1011, 'Internal error');
    }
  });

  // Periodic check for conversations of disconnected users helper
  void inArray;
  return wss;
}
