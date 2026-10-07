import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenants', (t) => {
    t.bigIncrements('id').primary();
    t.string('slug', 64).notNullable().unique();
    t.string('name', 128).notNullable();
    t.string('api_key_hash', 128).notNullable();
    t.json('settings').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.index(['is_active'], 'idx_tenants_active');
  });

  // A bootstrap tenant for local development only.
  // Production provisioning should be explicit.
  await knex('tenants').insert({
    slug: 'default',
    name: 'Default Tenant',
    api_key_hash: 'bootstrap',
    settings: JSON.stringify({}),
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenants');
}
