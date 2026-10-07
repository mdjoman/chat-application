import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('external_id', 128).nullable();   // host app user id (for widget)
    t.string('username', 64).notNullable();
    t.string('display_name', 128).notNullable();
    t.string('email', 190).nullable();
    t.string('password_hash', 255).nullable();
    t.string('avatar_url', 512).nullable();
    t.string('status_text', 190).nullable();
    t.string('role', 32).notNullable().defaultTo('user'); // user | admin
    t.timestamp('last_seen_at').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['tenant_id', 'username'], { indexName: 'uq_users_tenant_username' });
    t.unique(['tenant_id', 'external_id'], { indexName: 'uq_users_tenant_external' });
    t.index(['tenant_id', 'email'], 'idx_users_tenant_email');
    t.index(['tenant_id', 'is_active'], 'idx_users_tenant_active');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
