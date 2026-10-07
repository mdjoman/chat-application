export type CallType = 'audio' | 'video';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'accepted'
  | 'connecting'
  | 'connected'
  | 'rejected'
  | 'missed'
  | 'cancelled'
  | 'failed'
  | 'ended';

export type CallEndReason =
  | 'completed'
  | 'rejected'
  | 'busy'
  | 'timeout'
  | 'network_error'
  | 'user_cancelled'
  | 'remote_ended'
  | 'server_error';

export type ConversationType = 'direct' | 'group';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'voice'
  | 'system';

export type PresenceStatus =
  | 'online'
  | 'offline'
  | 'away'
  | 'typing'
  | 'recording'
  | 'calling'
  | 'in_call';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiError;
}
// ---- Messages ----
export interface MessageDTO {
  id: number;
  uuid: string;
  conversationId: number;
  senderId: number | null;
  type: MessageType;
  content: string | null;
  replyToId: number | null;
  forwardedFromId: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  clientId?: string;
  reactions?: MessageReactionDTO[];
  attachments?: AttachmentDTO[];
}

export interface MessageReactionDTO {
  reaction: string;
  userId: number;
  createdAt: string;
}

export interface AttachmentDTO {
  id: number;
  messageId: number | null;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  url: string;
  metadata: Record<string, unknown> | null;
}

// ---- Socket payloads ----
export interface SendMessagePayload {
  conversationId: number;
  type?: MessageType;
  content?: string | null;
  replyToId?: number | null;
  clientId?: string;
}

export interface TypingPayload {
  conversationId: number;
}

export interface ReadPayload {
  conversationId: number;
  messageIds: number[];
}

export interface ReactionPayload {
  messageId: number;
  reaction: string;
}
