import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('messages', (t) => {
    t.timestamp('pinned_at').nullable();
    t.bigInteger('pinned_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.index(['conversation_id', 'pinned_at'], 'idx_messages_pinned');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('messages', (t) => {
    t.dropIndex(['conversation_id', 'pinned_at'], 'idx_messages_pinned');
    t.dropColumn('pinned_by');
    t.dropColumn('pinned_at');
  });
}
