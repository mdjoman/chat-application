import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_settings', (t) => {
    t.bigInteger('user_id').unsigned().primary()
      .references('id').inTable('users').onDelete('CASCADE');
    // privacy: everyone | contacts | nobody
    t.string('privacy_last_seen', 16).notNullable().defaultTo('everyone');
    t.string('privacy_online', 16).notNullable().defaultTo('everyone');
    t.string('privacy_calls', 16).notNullable().defaultTo('everyone');
    t.string('privacy_groups', 16).notNullable().defaultTo('everyone');
    t.string('privacy_messages', 16).notNullable().defaultTo('everyone');
    t.json('notification_prefs').nullable();
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_settings');
}
