/** SERVER-ONLY. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';

export async function getSettings(): Promise<Record<string, string>> {
  const prisma = getPrisma();
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export const updateSettingsInput = z.record(z.string(), z.string().max(2000));

export async function updateSettings(actor: AuditActor, input: z.infer<typeof updateSettingsInput>) {
  const parsed = updateSettingsInput.parse(input);
  return runWithAuditContext(actor, async (tx) => {
    for (const [key, value] of Object.entries(parsed)) {
      await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    return getSettingsTx(tx);
  });
}

async function getSettingsTx(tx: any): Promise<Record<string, string>> {
  const rows = await tx.setting.findMany();
  return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
}
