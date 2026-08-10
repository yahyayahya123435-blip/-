/**
 * A stable per-installation identifier, written once into
 * <userData>/metadata/device-id and reused forever after.
 *
 * It exists so transfer packages can say which machine produced them; it is
 * a random UUID with no hardware fingerprinting and no relationship to any
 * user identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FILE_NAME = 'device-id';

export function getOrCreateDeviceId(metadataDir: string): string {
  const filePath = path.join(metadataDir, FILE_NAME);
  try {
    const existing = fs.readFileSync(filePath, 'utf-8').trim();
    if (existing) return existing;
  } catch {
    // Not created yet — fall through and write one.
  }
  const id = crypto.randomUUID();
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(filePath, id, 'utf-8');
  return id;
}
