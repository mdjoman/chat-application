/**
 * Shared constants across apps (api, widget).
 * Keep this package dependency-free.
 */

export const APP_NAME = 'chat-platform';

export const API_VERSION = 'v1';

export const ROUTES = {
  health: '/health',
  healthReady: '/health/ready',
  api: `/api/${API_VERSION}`,
} as const;

export const SOCKET_EVENTS = {
  // messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ: 'message:read',
  MESSAGE_REACTION: 'message:reaction',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',

  // typing / presence
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  TYPING_UPDATE: 'typing:update',
  PRESENCE_PING: 'presence:ping',
  PRESENCE_UPDATE: 'presence:update',

  // calls
  CALL_INITIATE: 'call:initiate',
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPT: 'call:accept',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECT: 'call:reject',
  CALL_REJECTED: 'call:rejected',
  CALL_CANCEL: 'call:cancel',
  CALL_CANCELLED: 'call:cancelled',
  CALL_END: 'call:end',
  CALL_ENDED: 'call:ended',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE: 'call:ice',
  CALL_FAILED: 'call:failed',
  CALL_TIMEOUT: 'call:timeout',
} as const;

export const CALL_TIMEOUT_MS = 45_000;
export const PRESENCE_TTL_SECONDS = 60;
export const TYPING_TTL_SECONDS = 5;
export const CALL_STATE_TTL_SECONDS = 2 * 60 * 60;
