import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('message_reactions', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('message_id').unsigned().notNullable()
      .references('id').inTable('messages').onDelete('CASCADE');
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('reaction', 16).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['message_id', 'user_id', 'reaction'], { indexName: 'uq_reaction' });
    t.index(['message_id'], 'idx_reaction_message');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_reactions');
}
