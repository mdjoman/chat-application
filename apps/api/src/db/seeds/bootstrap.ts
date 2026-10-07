import type { Knex } from 'knex';
import { env } from '../../config/env.js';
import { PasswordService } from '../../modules/auth/password.service.js';

export async function seed(knex: Knex): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('🌱 Running bootstrap seed');

  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.log('⏭  Skipping: BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set');
    return;
  }

  const tenant = await knex('tenants').where({ slug: 'default' }).first();
  if (!tenant) {
    // eslint-disable-next-line no-console
    console.log('❌ Default tenant missing; run migrations first');
    return;
  }

  const existing = await knex('users')
    .where({ tenant_id: tenant.id, email: env.BOOTSTRAP_ADMIN_EMAIL })
    .first();
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('⏭  Admin already exists:', env.BOOTSTRAP_ADMIN_EMAIL);
    return;
  }

  const passwordHash = await PasswordService.hash(env.BOOTSTRAP_ADMIN_PASSWORD);

  await knex.transaction(async (trx) => {
    const [id] = await trx('users').insert({
      tenant_id: tenant.id,
      username: 'admin',
      display_name: 'Admin',
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      password_hash: passwordHash,
      role: 'admin',
    });
    await trx('user_settings').insert({ user_id: id });
  });

  // eslint-disable-next-line no-console
  console.log('✅ Admin created:', env.BOOTSTRAP_ADMIN_EMAIL);
}
