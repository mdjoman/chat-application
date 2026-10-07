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
}

export interface ChatWidgetConfig {
  appId: string;
  userId: string;
  /**
   * Widget token issued by the host backend (HS256 JWT signed with
   * WIDGET_SHARED_SECRET). Optional — if missing or invalid and
   * `allowLogin` is true, the widget shows a login form instead.
   */
  token?: string;
  apiBaseUrl: string;
  /** Tenant slug used for the direct login flow (defaults to "default"). */
  tenantSlug?: string;
  /** If true, show login form when widget-token auth fails. */
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
