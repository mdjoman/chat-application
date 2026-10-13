import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('calls', (t) => {
    t.bigIncrements('id').primary();
    t.string('call_uuid', 36).notNullable().unique();
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.bigInteger('conversation_id').unsigned().notNullable()
      .references('id').inTable('conversations').onDelete('CASCADE');
    t.bigInteger('initiated_by').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');

    t.string('call_type', 16).notNullable(); // 'audio' | 'video'
    t.string('status', 24).notNullable().defaultTo('initiated');
    // status: initiated | ringing | accepted | connecting | connected
    //       | rejected | missed | cancelled | failed | ended

    t.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('connected_at').nullable();
    t.timestamp('ended_at').nullable();
    t.integer('duration_seconds').nullable();
    t.string('end_reason', 32).nullable();
    // reason: completed | rejected | busy | timeout | network_error
    //       | user_cancelled | remote_ended | server_error

    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.index(['tenant_id', 'conversation_id', 'created_at'], 'idx_calls_conv_recent');
    t.index(['tenant_id', 'status'], 'idx_calls_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('calls');
}