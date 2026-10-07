import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenant_origins', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('origin', 255).notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['tenant_id', 'origin'], { indexName: 'uq_tenant_origin' });
    t.index(['origin'], 'idx_origin');
  });

  // Seed: allow common local dev origins for the default tenant
  const tenant = await knex('tenants').where({ slug: 'default' }).first();
  if (tenant) {
    const origins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3001',
    ];
    await knex('tenant_origins').insert(
      origins.map((origin) => ({ tenant_id: tenant.id, origin })),
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenant_origins');
}
