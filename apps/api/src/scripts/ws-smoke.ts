/* eslint-disable no-console */
/**
 * End-to-end WebSocket smoke test.
 * Run with: pnpm --filter @chat/api ws:test
 *
 * Requires the API to be running on http://localhost:3000
 */
import { io, type Socket } from 'socket.io-client';

const API = process.env.API_BASE_URL ?? 'http://localhost:3000';
const uniq = Date.now();

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function waitFor<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      clearTimeout(t);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });
}

async function main() {
  console.log('→ Register Alice + Bob (idempotent)');

  await post('/auth/register', {
    tenantSlug: 'default',
    username: `alice_ws_${uniq}`,
    email: `alice_ws_${uniq}@test.local`,
    password: 'Passw0rd!234',
    displayName: 'Alice WS',
  }).catch(() => null);

  const alice = await post('/auth/login', {
    tenantSlug: 'default',
    identifier: `alice_ws_${uniq}`,
    password: 'Passw0rd!234',
  });

  const bob = await post('/auth/register', {
    tenantSlug: 'default',
    username: `bob_ws_${uniq}`,
    email: `bob_ws_${uniq}@test.local`,
    password: 'Passw0rd!234',
    displayName: 'Bob WS',
  });

  console.log('  Alice id:', alice.user.id, '— Bob id:', bob.user.id);

  console.log('→ Alice creates direct conversation with Bob');
  const conv = await post(
    '/conversations',
    { type: 'direct', peerId: bob.user.id },
    alice.accessToken,
  );
  console.log('  conversationId:', conv.id);

  console.log('→ Connecting sockets for Alice and Bob');
  const aliceSocket = io(API, {
    auth: { token: alice.accessToken },
    transports: ['polling', 'websocket'],
  });
  const bobSocket = io(API, {
    auth: { token: bob.accessToken },
    transports: ['polling', 'websocket'],
  });

  await Promise.all([
    new Promise<void>((r, j) => aliceSocket.on('connect', () => r()).on('connect_error', j)),
    new Promise<void>((r, j) => bobSocket.on('connect', () => r()).on('connect_error', j)),
  ]);

  // Bob joins the conversation room
  await new Promise<void>((resolve, reject) => {
    bobSocket.emit('conversation:join', { conversationId: conv.id }, (res: any) => {
      if (res?.ok) resolve();
      else reject(new Error(JSON.stringify(res)));
    });
  });

  console.log('→ Bob subscribes to typing:update and presence:update');
  bobSocket.on('typing:update', (p) => console.log('   [Bob] typing:update', p));
  bobSocket.on('presence:update', (p) => console.log('   [Bob] presence:update', p));

  console.log('→ Alice sends typing:start');
  await new Promise<void>((resolve) =>
    aliceSocket.emit('typing:start', { conversationId: conv.id }, () => resolve()),
  );

  console.log('→ Alice sends a message via socket');
  const incoming = waitFor<{ id: number; content: string }>(bobSocket, 'message:new');
  const ack = await new Promise<any>((resolve) =>
    aliceSocket.emit(
      'message:send',
      { conversationId: conv.id, content: 'Hello Bob from socket!', clientId: 'c1' },
      resolve,
    ),
  );
  console.log('   ack:', ack.ok ? 'ok' : ack);
  const msg = await incoming;
  console.log('   Bob received message:', { id: msg.id, content: msg.content });

  console.log('→ Bob marks the message as read');
  await new Promise<void>((resolve) =>
    bobSocket.emit(
      'message:read',
      { conversationId: conv.id, messageIds: [msg.id] },
      () => resolve(),
    ),
  );

  console.log('→ Bob sends typing:stop');
  await new Promise<void>((resolve) =>
    bobSocket.emit('typing:stop', { conversationId: conv.id }, () => resolve()),
  );

  console.log('→ Waiting 1.5s to flush events, then disconnecting');
  await new Promise((r) => setTimeout(r, 1500));

  aliceSocket.close();
  bobSocket.close();

  console.log('✅ WebSocket smoke test passed');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
