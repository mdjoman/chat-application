import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('messages', (t) => {
    t.bigIncrements('id').primary();
    t.string('uuid', 36).notNullable().unique();
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.bigInteger('conversation_id').unsigned().notNullable()
      .references('id').inTable('conversations').onDelete('CASCADE');
    t.bigInteger('sender_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');

    t.string('type', 16).notNullable(); // text | image | video | audio | file | voice | system
    t.text('content').nullable();       // text body or caption
    t.bigInteger('reply_to_id').unsigned().nullable()
      .references('id').inTable('messages').onDelete('SET NULL');
    t.bigInteger('forwarded_from_id').unsigned().nullable()
      .references('id').inTable('messages').onDelete('SET NULL');

    t.timestamp('edited_at').nullable();
    t.timestamp('deleted_at').nullable();
    t.bigInteger('deleted_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');

    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Conversation-scoped history: most recent first
    t.index(['conversation_id', 'id'], 'idx_messages_conv_id');
    t.index(['conversation_id', 'created_at'], 'idx_messages_conv_created');
    t.index(['sender_id', 'created_at'], 'idx_messages_sender');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('messages');
}
