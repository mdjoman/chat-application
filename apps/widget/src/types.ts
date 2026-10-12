export interface ChatWidgetFeatures {
  chat: boolean;
  groupChat: boolean;
  audioCall: boolean;
  videoCall: boolean;
  groupCall: boolean;
  fileUpload: boolean;
  voiceMessage: boolean;
  screenShare: boolean;
  messageReaction: boolean;
  messageReply: boolean;
  messageForward: boolean;
  messageEdit: boolean;
  messageDelete: boolean;
  messagePin: boolean;
}

export interface ChatWidgetConfig {
  appId: string;
  userId: string;
  token?: string;
  apiBaseUrl: string;
  tenantSlug?: string;
  allowLogin?: boolean;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'bottom-right' | 'bottom-left';
  features?: Partial<ChatWidgetFeatures>;
  primaryColor?: string;
}

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'needs-auth';

export interface CurrentUser {
  id: number;
  tenantId: number;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
}

export interface ConversationMember {
  userId: number;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  lastReadAt: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface LastMessagePreview {
  id: number;
  senderId: number | null;
  type: string;
  content: string | null;
  deleted: boolean;
  createdAt: string;
}

export interface Conversation {
  id: number;
  type: 'direct' | 'group';
  name: string | null;
  avatarUrl: string | null;
  createdBy: number | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  members: ConversationMember[];
  myRole?: string;
  lastMessage: LastMessagePreview | null;
  unreadCount: number;
}

export interface MessageReaction {
  reaction: string;
  userId: number;
  createdAt: string;
}

export interface Message {
  id: number;
  uuid: string;
  conversationId: number;
  senderId: number | null;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice' | 'system';
  content: string | null;
  replyToId: number | null;
  forwardedFromId: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  pinnedAt?: string | null;
  createdAt: string;
  clientId?: string;
  reactions?: MessageReaction[];
  attachments?: unknown[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  user: CurrentUser;
}

export type WidgetEvent =
  | 'ready'
  | 'authenticated'
  | 'needsAuth'
  | 'message'
  | 'messageSent'
  | 'messageReceived'
  | 'callIncoming'
  | 'callStarted'
  | 'callConnected'
  | 'callEnded'
  | 'callFailed'
  | 'userOnline'
  | 'userOffline'
  | 'error';
