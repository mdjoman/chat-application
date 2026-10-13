import type { Knex } from 'knex';

export class TenantOriginsRepository {
  constructor(private readonly db: Knex) {}

  async listActiveOrigins(): Promise<Set<string>> {
    const rows: Array<{ origin: string }> = await this.db('tenant_origins')
      .where({ is_active: 1 })
      .select('origin');
    return new Set(rows.map((r) => r.origin));
  }

  async isAllowed(origin: string): Promise<boolean> {
    const row = await this.db('tenant_origins')
      .where({ origin, is_active: 1 })
      .first();
    return Boolean(row);
  }

  async add(tenantId: number, origin: string): Promise<void> {
    await this.db('tenant_origins')
      .insert({ tenant_id: tenantId, origin })
      .onConflict(['tenant_id', 'origin'])
      .merge({ is_active: 1 });
  }

  async remove(tenantId: number, origin: string): Promise<void> {
    await this.db('tenant_origins')
      .where({ tenant_id: tenantId, origin })
      .update({ is_active: 0 });
  }
}