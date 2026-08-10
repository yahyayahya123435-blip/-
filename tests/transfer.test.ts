/**
 * Round-trips a .gztransfer package through the desktop importer, covering
 * the requirement's transfer checks: preview before writing, one transaction,
 * refusing the same package twice, and never overwriting newer desktop data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { createTestEnv, TEST_ACTOR, type TestEnv } from './helpers';
import { previewTransferPackage, commitTransferPackage } from '../src/services/transfer';
import {
  TRANSFER_FORMAT_NAME, TRANSFER_SCHEMA_VERSION, MANIFEST_ENTRY, RECORDS_ENTRY,
  ATTACHMENTS_MANIFEST_ENTRY, emptyTransferRecords,
  type TransferManifest, type TransferRecords, type TransferAttachmentEntry,
} from '../src/lib/transfer-format';

let env: TestEnv;
let paths: { attachments: string; metadata: string };

const FAMILY_ID = '11111111-1111-4111-8111-111111111111';
const BENEFICIARY_ID = '22222222-2222-4222-8222-222222222222';
const VISIT_ID = '33333333-3333-4333-8333-333333333333';
const ORPHAN_VISIT_ID = '44444444-4444-4444-8444-444444444444';
const ATTACHMENT_ID = '55555555-5555-4555-8555-555555555555';

test.before(async () => {
  env = await createTestEnv('transfer');
  paths = {
    attachments: path.join(env.root, 'Attachments'),
    metadata: path.join(env.root, 'metadata'),
  };
  fs.mkdirSync(paths.attachments, { recursive: true });
  fs.mkdirSync(paths.metadata, { recursive: true });
});

test.after(async () => {
  await env.cleanup();
});

interface PackageOptions {
  records?: Partial<TransferRecords>;
  attachments?: { entry: TransferAttachmentEntry; body: Buffer }[];
  direction?: TransferManifest['direction'];
  schemaVersion?: number;
  /** Written verbatim, bypassing the manifest builder — for invalid-file tests. */
  rawManifest?: unknown;
}

async function buildPackage(name: string, options: PackageOptions = {}): Promise<string> {
  const records = { ...emptyTransferRecords(), ...options.records };
  const manifest: TransferManifest = {
    format: TRANSFER_FORMAT_NAME,
    schemaVersion: options.schemaVersion ?? TRANSFER_SCHEMA_VERSION,
    direction: options.direction ?? 'mobile-to-desktop',
    exportedAt: new Date().toISOString(),
    deviceId: 'test-device-0001',
    deviceLabel: 'هاتف الاختبار',
    sourceUser: 'field-worker',
    appVersion: '1.0.0',
    counts: {},
    attachmentCount: options.attachments?.length ?? 0,
  };

  const outPath = path.join(env.root, name);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(JSON.stringify(options.rawManifest ?? manifest), { name: MANIFEST_ENTRY });
    archive.append(JSON.stringify(records), { name: RECORDS_ENTRY });
    archive.append(JSON.stringify((options.attachments ?? []).map((a) => a.entry)), {
      name: ATTACHMENTS_MANIFEST_ENTRY,
    });
    for (const attachment of options.attachments ?? []) {
      archive.append(attachment.body, { name: `attachments/${attachment.entry.packagedName}` });
    }
    void archive.finalize();
  });
  return outPath;
}

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function fieldPackageRecords(): Partial<TransferRecords> {
  return {
    families: [
      {
        id: FAMILY_ID,
        headOfFamilyName: 'أسرة ميدانية جديدة',
        wifeName: 'زوجة مسجلة ميدانياً',
        phone: '0790000000',
        monthlyIncomeFils: 150000,
        monthlyExpensesFils: 0,
        fileStatus: 'نشط',
        isActive: true,
        registeredAt: iso(-3600_000),
        createdAt: iso(-3600_000),
        updatedAt: iso(-3600_000),
      },
    ],
    beneficiaries: [
      {
        id: BENEFICIARY_ID,
        familyId: FAMILY_ID,
        fullName: 'مستفيد ميداني',
        status: 'نشط',
        isActive: true,
        createdAt: iso(-3500_000),
        updatedAt: iso(-3500_000),
      },
    ],
    fieldVisits: [
      {
        id: VISIT_ID,
        familyId: FAMILY_ID,
        beneficiaryId: BENEFICIARY_ID,
        visitDate: iso(-3400_000),
        purpose: 'زيارة تحقق',
        findings: 'الأسرة بحاجة إلى طرد غذائي',
        status: 'مكتملة',
        createdAt: iso(-3400_000),
        updatedAt: iso(-3400_000),
      },
    ],
  };
}

test('a package is previewed without touching the database', async () => {
  const file = await buildPackage('first.gztransfer', { records: fieldPackageRecords() });
  const before = await env.prisma.family.count();

  const preview = await previewTransferPackage(file);
  assert.equal(preview.counts.new, 3);
  assert.equal(preview.counts.error, 0);
  assert.equal(preview.counts.conflict, 0);
  assert.equal(preview.alreadyImported, false);
  assert.equal(preview.manifest.deviceId, 'test-device-0001');
  assert.equal(await env.prisma.family.count(), before, 'preview must not write');
});

test('committing writes the records and keeps the phone-generated ids', async () => {
  const file = await buildPackage('commit.gztransfer', { records: fieldPackageRecords() });
  const result = await commitTransferPackage(TEST_ACTOR, file, paths);

  assert.equal(result.created, 3);
  assert.equal(result.updated, 0);

  const family = await env.prisma.family.findUniqueOrThrow({ where: { id: FAMILY_ID } });
  assert.equal(family.headOfFamilyName, 'أسرة ميدانية جديدة');
  assert.equal(family.sourceSystem, 'الهاتف', 'imported families are marked as coming from the phone');
  assert.match(family.familyCode, /^GZ-\d{4}$/, 'the desktop assigns the internal file code');

  assert.ok(await env.prisma.beneficiary.findUnique({ where: { id: BENEFICIARY_ID } }));
  assert.ok(await env.prisma.fieldVisit.findUnique({ where: { id: VISIT_ID } }));

  // The package copy and the batch record are both kept.
  const batch = await env.prisma.importBatch.findFirstOrThrow({ where: { kind: 'mobile_transfer' } });
  assert.equal(batch.deviceId, 'test-device-0001');
  assert.ok(batch.storedFile && fs.existsSync(batch.storedFile));
});

test('the same package cannot be imported twice', async () => {
  const file = await buildPackage('again.gztransfer', { records: fieldPackageRecords() });
  await commitTransferPackage(TEST_ACTOR, file, paths).catch(() => undefined);

  // Re-committing the exact same bytes is refused on checksum.
  const familiesBefore = await env.prisma.family.count();
  await assert.rejects(() => commitTransferPackage(TEST_ACTOR, file, paths), /مسبقاً/);
  assert.equal(await env.prisma.family.count(), familiesBefore);

  const preview = await previewTransferPackage(file);
  assert.equal(preview.alreadyImported, true);
});

test('a newer phone record updates, an older one is reported as a conflict', async () => {
  const newer = await buildPackage('newer.gztransfer', {
    records: {
      families: [
        {
          id: FAMILY_ID,
          headOfFamilyName: 'أسرة ميدانية بعد التعديل',
          phone: '0791111111',
          monthlyIncomeFils: 150000,
          isActive: true,
          createdAt: iso(-3600_000),
          updatedAt: iso(60_000),
        },
      ],
    },
  });
  const updateResult = await commitTransferPackage(TEST_ACTOR, newer, paths);
  assert.equal(updateResult.updated, 1);
  assert.equal(
    (await env.prisma.family.findUniqueOrThrow({ where: { id: FAMILY_ID } })).headOfFamilyName,
    'أسرة ميدانية بعد التعديل',
  );

  const older = await buildPackage('older.gztransfer', {
    records: {
      families: [
        {
          id: FAMILY_ID,
          headOfFamilyName: 'نسخة قديمة يجب ألا تُكتب',
          isActive: true,
          createdAt: iso(-3600_000),
          updatedAt: iso(-7200_000),
        },
      ],
    },
  });
  const preview = await previewTransferPackage(older);
  assert.equal(preview.counts.conflict, 1);
  assert.equal(preview.counts.updated, 0);

  await commitTransferPackage(TEST_ACTOR, older, paths);
  assert.equal(
    (await env.prisma.family.findUniqueOrThrow({ where: { id: FAMILY_ID } })).headOfFamilyName,
    'أسرة ميدانية بعد التعديل',
    'stale phone data must never overwrite newer desktop data',
  );
});

test('a record whose parent is missing is an error, not a broken row', async () => {
  const file = await buildPackage('orphan.gztransfer', {
    records: {
      fieldVisits: [
        {
          id: ORPHAN_VISIT_ID,
          familyId: 'does-not-exist-anywhere',
          visitDate: iso(0),
          status: 'مكتملة',
          createdAt: iso(0),
          updatedAt: iso(0),
        },
      ],
    },
  });
  const preview = await previewTransferPackage(file);
  assert.equal(preview.counts.error, 1);

  await commitTransferPackage(TEST_ACTOR, file, paths);
  assert.equal(await env.prisma.fieldVisit.findUnique({ where: { id: ORPHAN_VISIT_ID } }), null);
});

test('attachments land inside the managed folder and resist path traversal', async () => {
  const body = Buffer.from('صورة زيارة ميدانية');
  const file = await buildPackage('withattachment.gztransfer', {
    attachments: [
      {
        entry: {
          id: ATTACHMENT_ID,
          entityType: 'field_visits',
          entityId: VISIT_ID,
          fileName: 'visit.jpg',
          // A traversal attempt: it must be reduced to a flat, safe name.
          packagedName: '../../../../etc/evil.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: body.length,
          createdAt: iso(0),
        },
        body,
      },
    ],
  });

  await commitTransferPackage(TEST_ACTOR, file, paths);

  const stored = await env.prisma.attachment.findUnique({ where: { id: ATTACHMENT_ID } });
  if (stored) {
    const full = path.resolve(paths.attachments, stored.storedName);
    assert.ok(
      full.startsWith(path.resolve(paths.attachments) + path.sep),
      'a stored attachment must stay under the attachments root',
    );
    assert.ok(!stored.storedName.includes('..'));
  }
  assert.ok(!fs.existsSync('/etc/evil.jpg'), 'nothing may be written outside the managed folder');
});

test('a desktop-to-mobile package is refused by the desktop importer', async () => {
  const file = await buildPackage('wrongway.gztransfer', { direction: 'desktop-to-mobile' });
  await assert.rejects(() => previewTransferPackage(file), /الكمبيوتر إلى الهاتف/);
});

test('a package from a newer schema version is refused rather than half-read', async () => {
  const file = await buildPackage('future.gztransfer', { schemaVersion: TRANSFER_SCHEMA_VERSION + 5 });
  await assert.rejects(() => previewTransferPackage(file), /أحدث من إصدار البرنامج/);
});

test('a file that is not a transfer package is rejected with a clear message', async () => {
  const file = await buildPackage('foreign.gztransfer', { rawManifest: { format: 'SOMETHING_ELSE' } });
  await assert.rejects(() => previewTransferPackage(file), /ليس ملف نقل/);
});
