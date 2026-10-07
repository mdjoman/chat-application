import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  app = await buildApp();
  await app.ready();
});

describe('auth + conversations', () => {
  const tenantSlug = 'default';
  const uniq = Date.now();
  const alice = {
    tenantSlug,
    username: `alice_${uniq}`,
    email: `alice_${uniq}@test.local`,
    password: 'Passw0rd!234',
  };
  const bob = {
    tenantSlug,
    username: `bob_${uniq}`,
    email: `bob_${uniq}@test.local`,
    password: 'Passw0rd!234',
  };
  let aliceTokens: any;
  let bobTokens: any;

  it('registers alice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: alice,
    });
    expect(res.statusCode).toBe(201);
    aliceTokens = res.json();
    expect(aliceTokens.user.username).toBe(alice.username.toLowerCase());
    expect(aliceTokens.accessToken).toBeTruthy();
    expect(aliceTokens.refreshToken).toBeTruthy();
  });

  it('registers bob', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: bob,
    });
    expect(res.statusCode).toBe(201);
    bobTokens = res.json();
  });

  it('rejects duplicate username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: alice,
    });
    expect(res.statusCode).toBe(409);
  });

  it('logs in alice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantSlug, identifier: alice.username, password: alice.password },
    });
    expect(res.statusCode).toBe(200);
    aliceTokens = res.json();
  });

  it('rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantSlug, identifier: alice.username, password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /auth/me with access token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${aliceTokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe(alice.username.toLowerCase());
  });

  it('GET /auth/me without token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('refreshes tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: aliceTokens.refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const next = res.json();
    expect(next.accessToken).toBeTruthy();
    expect(next.refreshToken).toBeTruthy();
    expect(next.refreshToken).not.toBe(aliceTokens.refreshToken);
    aliceTokens = next;
  });

  it('creates a direct conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${aliceTokens.accessToken}` },
      payload: { type: 'direct', peerId: bobTokens.user.id },
    });
    expect(res.statusCode).toBe(201);
    const conv = res.json();
    expect(conv.type).toBe('direct');
    expect(conv.members.length).toBe(2);
  });

  it('creates a group conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${aliceTokens.accessToken}` },
      payload: { type: 'group', name: 'Team', memberIds: [bobTokens.user.id] },
    });
    expect(res.statusCode).toBe(201);
    const conv = res.json();
    expect(conv.type).toBe('group');
    expect(conv.name).toBe('Team');
    expect(conv.myRole).toBe('owner');
  });

  it('lists conversations for alice', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${aliceTokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('bob cannot read alice’s group if not a member (isolation)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${aliceTokens.accessToken}` },
      payload: { type: 'group', name: 'Private', memberIds: [bobTokens.user.id] },
    });
    const conv = created.json();
    // Remove bob to simulate non-member
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/conversations/${conv.id}/members/${bobTokens.user.id}`,
      headers: { authorization: `Bearer ${aliceTokens.accessToken}` },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conv.id}`,
      headers: { authorization: `Bearer ${bobTokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('logout revokes refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${aliceTokens.accessToken}` },
      payload: { refreshToken: aliceTokens.refreshToken },
    });
    expect(res.statusCode).toBe(204);

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: aliceTokens.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });
});
