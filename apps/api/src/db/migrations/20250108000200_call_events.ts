import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('call_events', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('call_id').unsigned().notNullable()
      .references('id').inTable('calls').onDelete('CASCADE');
    t.bigInteger('user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.string('event_type', 48).notNullable();
    t.json('metadata').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['call_id', 'created_at'], 'idx_call_events');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('call_events');
}