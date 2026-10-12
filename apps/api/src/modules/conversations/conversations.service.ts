import type { Knex } from 'knex';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { directKey } from '../../utils/ids.js';
import { buildPage, decodeCursor, type CursorPage } from '../../utils/pagination.js';
import { ConversationsRepository, type MemberRow } from './conversations.repository.js';

export interface MemberDTO {
  userId: number;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  lastReadAt: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface LastMessageDTO {
  id: number;
  senderId: number | null;
  type: string;
  content: string | null;
  deleted: boolean;
  createdAt: string;
}

export interface ConversationDTO {
  id: number;
  type: 'direct' | 'group';
  name: string | null;
  avatarUrl: string | null;
  createdBy: number | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  members: MemberDTO[];
  myRole?: string;
  lastMessage: LastMessageDTO | null;
  unreadCount: number;
}

export class ConversationsService {
  private readonly repo: ConversationsRepository;
  constructor(private readonly db: Knex) {
    this.repo = new ConversationsRepository(db);
  }

  async listForUser(
    tenantId: number,
    userId: number,
    limit = 20,
    cursor?: string,
  ): Promise<CursorPage<ConversationDTO>> {
    const cursorId = cursor ? Number(decodeCursor(cursor)) : null;
    const rows = await this.repo.listForUser(tenantId, userId, limit, cursorId);
    const page = buildPage(rows, limit);

    const ids = page.items.map((r) => r.id);
    if (ids.length === 0) {
      return { ...page, items: [] };
    }

    // Load members
    const members = await this.db('conversation_members')
      .whereIn('conversation_id', ids)
      .whereNull('left_at')
      .select('conversation_id', 'user_id', 'role', 'joined_at', 'last_read_at');

    // Load user profiles for those members
    const userIds = Array.from(new Set(members.map((m) => m.user_id)));
    const users = await this.repo.usersByIds(tenantId, userIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Load last message per conversation
    const latest = await this.repo.latestMessagesForConversations(tenantId, ids);

    // Compute unread counts — messages after each member's last_read_at
    const unreadMap = new Map<number, number>();
    await Promise.all(
      page.items.map(async (r) => {
        const lr = r.last_read_at ? new Date(r.last_read_at) : null;
        const q = this.db('messages')
          .where({ tenant_id: tenantId, conversation_id: r.id })
          .whereNot('sender_id', userId)
          .count<{ c: string }>({ c: '*' });
        if (lr) q.andWhere('created_at', '>', lr);
        const [row] = await q;
        unreadMap.set(r.id, Number(row?.c ?? 0));
      }),
    );

    const membersByConv = new Map<number, MemberDTO[]>();
    for (const m of members) {
      const list = membersByConv.get(m.conversation_id) ?? [];
      const u = userMap.get(m.user_id);
      list.push({
        userId: m.user_id,
        role: m.role,
        joinedAt: new Date(m.joined_at).toISOString(),
        lastReadAt: m.last_read_at ? new Date(m.last_read_at).toISOString() : null,
        username: u?.username ?? `user${m.user_id}`,
        displayName: u?.display_name ?? `User #${m.user_id}`,
        avatarUrl: u?.avatar_url ?? null,
      });
      membersByConv.set(m.conversation_id, list);
    }

    return {
      ...page,
      items: page.items.map((r) => {
        const lm = latest.get(r.id);
        return {
          id: r.id,
          type: r.type,
          name: r.name,
          avatarUrl: r.avatar_url,
          createdBy: r.created_by,
          lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          members: membersByConv.get(r.id) ?? [],
          myRole: r.role,
          lastMessage: lm
            ? {
                id: lm.id,
                senderId: lm.sender_id,
                type: lm.type,
                content: lm.deleted_at ? null : lm.content,
                deleted: Boolean(lm.deleted_at),
                createdAt: new Date(lm.created_at).toISOString(),
              }
            : null,
          unreadCount: unreadMap.get(r.id) ?? 0,
        };
      }),
    };
  }

  async getById(tenantId: number, userId: number, id: number): Promise<ConversationDTO> {
    const conv = await this.repo.findById(tenantId, id);
    if (!conv) throw new NotFoundError('Conversation not found');
    const membership = await this.repo.getMember(id, userId);
    if (!membership) throw new ForbiddenError('Not a member');

    const members = await this.repo.listMembers(id);
    const userIds = members.map((m) => m.user_id);
    const users = await this.repo.usersByIds(tenantId, userIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const latest = await this.repo.latestMessagesForConversations(tenantId, [id]);
    const lm = latest.get(id);

    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      avatarUrl: conv.avatar_url,
      createdBy: conv.created_by,
      lastMessageAt: conv.last_message_at ? new Date(conv.last_message_at).toISOString() : null,
      createdAt: new Date(conv.created_at).toISOString(),
      updatedAt: new Date(conv.updated_at).toISOString(),
      members: members.map((m) => ({
        userId: m.user_id,
        role: m.role,
        joinedAt: new Date(m.joined_at).toISOString(),
        lastReadAt: m.last_read_at ? new Date(m.last_read_at).toISOString() : null,
        username: userMap.get(m.user_id)?.username ?? `user${m.user_id}`,
        displayName: userMap.get(m.user_id)?.display_name ?? `User #${m.user_id}`,
        avatarUrl: userMap.get(m.user_id)?.avatar_url ?? null,
      })),
      myRole: membership.role,
      lastMessage: lm
        ? {
            id: lm.id,
            senderId: lm.sender_id,
            type: lm.type,
            content: lm.deleted_at ? null : lm.content,
            deleted: Boolean(lm.deleted_at),
            createdAt: new Date(lm.created_at).toISOString(),
          }
        : null,
      unreadCount: 0,
    };
  }

  async createDirect(
    tenantId: number,
    currentUserId: number,
    peerId: number,
  ): Promise<ConversationDTO> {
    if (peerId === currentUserId) throw new ConflictError('Cannot create a direct chat with yourself');

    const peer = await this.db('users')
      .where({ tenant_id: tenantId, id: peerId, is_active: 1 })
      .first();
    if (!peer) throw new NotFoundError('Peer user not found');

    const key = directKey(currentUserId, peerId);
    const existing = await this.repo.findDirectByKey(tenantId, key);
    if (existing) return this.getById(tenantId, currentUserId, existing.id);

    const convId = await this.db.transaction(async (trx) => {
      const newId = await this.repo.create(trx, {
        tenantId,
        type: 'direct',
        createdBy: currentUserId,
        directKey: key,
      });
      await this.repo.addMember(trx, { conversationId: newId, userId: currentUserId, role: 'member' });
      await this.repo.addMember(trx, { conversationId: newId, userId: peerId, role: 'member' });
      return newId;
    });

    return this.getById(tenantId, currentUserId, convId);
  }

  async createGroup(
    tenantId: number,
    currentUserId: number,
    input: { name: string; memberIds: number[]; avatarUrl?: string | null },
  ): Promise<ConversationDTO> {
    const unique = Array.from(new Set(input.memberIds.filter((id) => id !== currentUserId)));
    if (unique.length < 1) throw new ConflictError('Group needs at least one other member');

    const found = await this.db('users')
      .where({ tenant_id: tenantId, is_active: 1 })
      .whereIn('id', unique)
      .select('id');
    if (found.length !== unique.length) throw new NotFoundError('One or more members not found');

    const id = await this.db.transaction(async (trx) => {
      const convId = await this.repo.create(trx, {
        tenantId,
        type: 'group',
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
        createdBy: currentUserId,
      });
      await this.repo.addMember(trx, { conversationId: convId, userId: currentUserId, role: 'owner' });
      for (const uid of unique) {
        await this.repo.addMember(trx, { conversationId: convId, userId: uid, role: 'member' });
      }
      return convId;
    });

    return this.getById(tenantId, currentUserId, id);
  }

  async update(
    tenantId: number,
    userId: number,
    id: number,
    patch: { name?: string | null; avatarUrl?: string | null },
  ): Promise<ConversationDTO> {
    const conv = await this.repo.findById(tenantId, id);
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'group') throw new ConflictError('Only group conversations can be edited');

    const member = await this.repo.getMember(id, userId);
    if (!member) throw new ForbiddenError('Not a member');
    if (member.role !== 'owner' && member.role !== 'admin') {
      throw new ForbiddenError('Only owners or admins can edit this group');
    }

    await this.repo.updateConversation(tenantId, id, {
      name: patch.name,
      avatar_url: patch.avatarUrl,
    });
    return this.getById(tenantId, userId, id);
  }

  async addMembers(
    tenantId: number,
    userId: number,
    id: number,
    memberIds: number[],
  ): Promise<ConversationDTO> {
    const conv = await this.repo.findById(tenantId, id);
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'group') throw new ConflictError('Only group conversations support members');

    const me = await this.repo.getMember(id, userId);
    if (!me) throw new ForbiddenError('Not a member');
    if (me.role === 'member') throw new ForbiddenError('Insufficient permissions');

    const unique = Array.from(new Set(memberIds));
    if (unique.length === 0) return this.getById(tenantId, userId, id);

    const found = await this.db('users')
      .where({ tenant_id: tenantId, is_active: 1 })
      .whereIn('id', unique)
      .select('id');
    if (found.length !== unique.length) throw new NotFoundError('One or more members not found');

    await this.db.transaction(async (trx) => {
      for (const uid of unique) {
        await this.repo.addMember(trx, { conversationId: id, userId: uid, role: 'member' });
      }
    });

    return this.getById(tenantId, userId, id);
  }

  async removeMember(
    tenantId: number,
    userId: number,
    id: number,
    targetUserId: number,
  ): Promise<void> {
    const conv = await this.repo.findById(tenantId, id);
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'group') throw new ConflictError('Only group conversations support this');

    const me = await this.repo.getMember(id, userId);
    if (!me) throw new ForbiddenError('Not a member');

    const target = await this.repo.getMember(id, targetUserId);
    if (!target) throw new NotFoundError('Member not found');

    if (me.role === 'owner') {
      if (targetUserId === userId) throw new ConflictError('Use /leave to remove yourself');
    } else if (me.role === 'admin') {
      if (target.role !== 'member') throw new ForbiddenError('Admins can only remove members');
    } else {
      throw new ForbiddenError('Insufficient permissions');
    }

    await this.db.transaction(async (trx) => {
      await this.repo.removeMember(trx, id, targetUserId);
    });
  }

  async leave(tenantId: number, userId: number, id: number): Promise<void> {
    const conv = await this.repo.findById(tenantId, id);
    if (!conv) throw new NotFoundError('Conversation not found');
    if (conv.type !== 'group') throw new ConflictError('Direct conversations cannot be left');

    const me = await this.repo.getMember(id, userId);
    if (!me) throw new ForbiddenError('Not a member');

    await this.db.transaction(async (trx) => {
      await this.repo.removeMember(trx, id, userId);

      if (me.role === 'owner') {
        const remaining = await trx('conversation_members')
          .where({ conversation_id: id })
          .whereNull('left_at')
          .orderBy('joined_at', 'asc')
          .first();
        if (remaining) {
          await trx('conversation_members')
            .where({ id: remaining.id })
            .update({ role: 'owner' });
        }
      }
    });
  }

  async promote(
    tenantId: number,
    userId: number,
    id: number,
    targetUserId: number,
    role: 'admin' | 'member',
  ): Promise<void> {
    const conv = await this.repo.findById(tenantId, id);
    if (!conv || conv.type !== 'group') throw new NotFoundError('Group not found');

    const me = await this.repo.getMember(id, userId);
    if (!me) throw new ForbiddenError('Not a member');
    if (me.role !== 'owner') throw new ForbiddenError('Only owner can change roles');

    const target = await this.repo.getMember(id, targetUserId);
    if (!target) throw new NotFoundError('Member not found');
    if (target.user_id === userId) {
      throw new ConflictError('Cannot change own role');
    }
    await this.db.transaction(async (trx) => {
      await this.repo.updateMemberRole(trx, id, targetUserId, role);
    });
  }
}
