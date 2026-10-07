import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('conversation_members', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('conversation_id').unsigned().notNullable()
      .references('id').inTable('conversations').onDelete('CASCADE');
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('role', 16).notNullable().defaultTo('member'); // owner | admin | member
    t.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('left_at').nullable();
    t.timestamp('last_read_at').nullable();
    t.timestamp('muted_until').nullable();

    t.unique(['conversation_id', 'user_id'], { indexName: 'uq_conv_user' });
    t.index(['user_id', 'left_at'], 'idx_member_user_active');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('conversation_members');
}
