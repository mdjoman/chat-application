import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // The user_settings table already has `notification_prefs` (json).
  // This migration just ensures default values for existing rows.
  const rows = await knex('user_settings').whereNull('notification_prefs');
  for (const r of rows) {
    await knex('user_settings').where({ user_id: r.user_id }).update({
      notification_prefs: JSON.stringify({
        messageSound: true,
        messagePopup: true,
        callSound: true,
        callPopup: true,
        groupMentions: true,
      }),
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // No-op
  void knex;
}
