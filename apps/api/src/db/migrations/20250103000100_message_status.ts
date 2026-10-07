import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('message_status', (t) => {
    t.bigInteger('message_id').unsigned().notNullable()
      .references('id').inTable('messages').onDelete('CASCADE');
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('status', 16).notNullable().defaultTo('sent'); // sent | delivered | read
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.primary(['message_id', 'user_id']);
    t.index(['user_id', 'status'], 'idx_msg_status_user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_status');
}
