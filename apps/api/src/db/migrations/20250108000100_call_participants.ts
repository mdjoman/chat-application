import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('call_participants', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('call_id').unsigned().notNullable()
      .references('id').inTable('calls').onDelete('CASCADE');
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');

    t.string('role', 16).notNullable().defaultTo('callee'); // 'caller' | 'callee'
    t.string('status', 16).notNullable().defaultTo('invited');
    // status: invited | ringing | accepted | connected | rejected
    //       | missed | left | cancelled | failed

    t.timestamp('invited_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('joined_at').nullable();
    t.timestamp('left_at').nullable();
    t.integer('duration_seconds').nullable();
    t.boolean('mic_muted').notNullable().defaultTo(false);
    t.boolean('camera_enabled').notNullable().defaultTo(true);
    t.boolean('screen_sharing').notNullable().defaultTo(false);
    t.string('device_id', 128).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['call_id', 'user_id'], { indexName: 'uq_call_participant' });
    t.index(['user_id', 'invited_at'], 'idx_participant_user_recent');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('call_participants');
}