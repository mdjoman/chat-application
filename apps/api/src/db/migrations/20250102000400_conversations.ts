import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('conversations', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('type', 16).notNullable(); // direct | group
    t.string('name', 190).nullable();
    t.string('avatar_url', 512).nullable();
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.string('direct_key', 100).nullable(); // sorted "minId:maxId" for direct uniq
    t.timestamp('last_message_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['tenant_id', 'direct_key'], { indexName: 'uq_conv_direct_key' });
    t.index(['tenant_id', 'last_message_at'], 'idx_conv_tenant_last_msg');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('conversations');
}
