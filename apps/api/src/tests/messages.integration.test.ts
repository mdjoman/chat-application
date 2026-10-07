import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

let app: FastifyInstance;
const uniq = Date.now();

async function register(username: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      tenantSlug: 'default',
      username,
      email: `${username}@test.local`,
      password: 'Passw0rd!234',
      displayName: username,
    },
  });
  return res.json();
}

async function login(username: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { tenantSlug: 'default', identifier: username, password: 'Passw0rd!234' },
  });
  return res.json();
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

describe('messages REST', () => {
  const a = `alice_m_${uniq}`;
  const b = `bob_m_${uniq}`;
  let alice: any;
  let bob: any;
  let convId: number;

  it('setup: register two users', async () => {
    alice = await register(a);
    bob = await register(b);
    expect(alice.accessToken).toBeTruthy();
    expect(bob.accessToken).toBeTruthy();
  });

  it('creates direct conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { type: 'direct', peerId: bob.user.id },
    });
    expect(res.statusCode).toBe(201);
    convId = res.json().id;
  });

  it('sends a message via REST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { content: 'Hello from REST', type: 'text' },
    });
    expect(res.statusCode).toBe(201);
    const msg = res.json();
    expect(msg.content).toBe('Hello from REST');
    expect(msg.senderId).toBe(alice.user.id);
  });

  it('bob reads history (cursor-paginated)', async () => {
    // Send a few more so pagination matters
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${convId}/messages`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { content: `msg #${i}` },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}/messages?limit=2`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(2);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();
  });

  it('edits a message', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { content: 'before edit' },
    });
    const id = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/${id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { content: 'after edit' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe('after edit');
    expect(res.json().editedAt).toBeTruthy();
  });

  it('bob cannot edit alice’s message', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { content: 'owned by alice' },
    });
    const id = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/${id}`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { content: 'hijacked' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('reacts to a message', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { content: 'react to me' },
    });
    const id = created.json().id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/${id}/reactions`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { reaction: '👍' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('deletes a message (soft)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { content: 'goodbye' },
    });
    const id = created.json().id;

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    // History should still contain it, content is null, deletedAt set
    const hist = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}/messages?limit=50`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    const found = hist.json().items.find((m: any) => m.id === id);
    expect(found).toBeTruthy();
    expect(found.content).toBeNull();
    expect(found.deletedAt).toBeTruthy();
  });

  it('search returns matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}/messages/search?q=after`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThan(0);
  });

  it('marks messages as read', async () => {
    const hist = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}/messages?limit=5`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    const ids = hist.json().items.map((m: any) => m.id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convId}/read`,
      headers: { authorization: `Bearer ${bob.accessToken}` },
      payload: { messageIds: ids },
    });
    expect(res.statusCode).toBe(204);
  });

  it('non-member cannot read history', async () => {
    const carol = await register(`carol_${uniq}`);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${carol.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
