import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('attachments', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('message_id').unsigned().nullable()
      .references('id').inTable('messages').onDelete('CASCADE');
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.bigInteger('uploaded_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');

    t.string('storage_key', 512).notNullable();
    t.string('mime_type', 128).notNullable();
    t.bigInteger('size_bytes').unsigned().notNullable();
    t.string('original_name', 255).nullable();
    t.json('metadata').nullable();

    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['message_id'], 'idx_attach_message');
    t.index(['tenant_id'], 'idx_attach_tenant');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('attachments');
}
