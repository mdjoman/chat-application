import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('password_resets', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 128).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at').nullable();
    t.string('requested_ip', 64).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['user_id', 'used_at'], 'idx_reset_user_active');
    t.index(['expires_at'], 'idx_reset_expiry');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('password_resets');
}
