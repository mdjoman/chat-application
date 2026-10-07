import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 128).notNullable().unique();
    t.string('device_id', 128).nullable();
    t.string('user_agent', 512).nullable();
    t.string('ip_address', 64).nullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('revoked_at').nullable();
    t.bigInteger('replaced_by_id').unsigned().nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['user_id', 'revoked_at'], 'idx_refresh_user_active');
    t.index(['expires_at'], 'idx_refresh_expiry');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
