import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_devices', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('device_id', 128).notNullable();
    t.string('platform', 32).notNullable(); // web | ios | android | desktop
    t.string('user_agent', 512).nullable();
    t.string('push_token', 512).nullable();
    t.timestamp('last_active_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['user_id', 'device_id'], { indexName: 'uq_user_device' });
    t.index(['user_id', 'last_active_at'], 'idx_user_device_active');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_devices');
}
