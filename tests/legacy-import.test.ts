/**
 * Covers the mandatory import checks from the requirement:
 * importing the 330-family register, not importing it twice, leaving the
 * national ID / family-book count blank, and filling them in afterwards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv, PROJECT_ROOT, TEST_ACTOR, type TestEnv } from './helpers';
import {
  readLegacySheet, getBundledLegacySheetPath, previewLegacyImport, runLegacyImport,
  listIncompleteFamilies, completeFamilyData, LEGACY_SOURCE_LABEL,
} from '../src/services/legacy-import';

let env: TestEnv;

test.before(async () => {
  env = await createTestEnv('import');
});

test.after(async () => {
  await env.cleanup();
});

test('the bundled register parses to exactly 330 rows with no errors', async () => {
  const { rows, errors } = await readLegacySheet(getBundledLegacySheetPath(PROJECT_ROOT));
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 330);
  assert.equal(new Set(rows.map((r) => r.legacyReference)).size, 330);
  assert.ok(rows.every((r) => r.headOfFamilyName.length > 1));
  // 203 of the 330 register entries carry a wife's name.
  assert.equal(rows.filter((r) => r.wifeName).length, 203);
});

test('preview reports what would happen and writes nothing', async () => {
  const before = await env.prisma.family.count();
  const preview = await previewLegacyImport(PROJECT_ROOT);

  assert.equal(preview.alreadyImported, false);
  assert.equal(preview.totalRows, 330);
  assert.equal(preview.toCreate, 330);
  assert.equal(preview.alreadyPresent, 0);
  assert.equal(preview.errors.length, 0);
  assert.equal(await env.prisma.family.count(), before, 'preview must not insert anything');
});

test('import creates 330 families and leaves the blank fields blank', async () => {
  const result = await runLegacyImport(TEST_ACTOR, PROJECT_ROOT);
  assert.equal(result.created, 330);

  assert.equal(await env.prisma.family.count(), 330);
  assert.equal(await env.prisma.family.count({ where: { headNationalId: { not: null } } }), 0);
  assert.equal(
    await env.prisma.family.count({ where: { familyBookMembersCount: { not: null } } }),
    0,
    'family-book counts must never be generated',
  );
  assert.equal(await env.prisma.family.count({ where: { wifeName: { not: null } } }), 203);
  assert.equal(await env.prisma.family.count({ where: { sourceSystem: LEGACY_SOURCE_LABEL } }), 330);

  // Source metadata survives the import.
  assert.equal(await env.prisma.family.count({ where: { legacySourceRefs: { not: null } } }), 330);
  const merged = await env.prisma.family.findFirst({ where: { legacyOccurrences: { gt: 1 } } });
  assert.ok(merged, 'families merged from repeated register entries keep their occurrence count');

  // Internal file codes are unique.
  const codes = await env.prisma.family.findMany({ select: { familyCode: true } });
  assert.equal(new Set(codes.map((c) => c.familyCode)).size, 330);

  // Every insert is audited.
  const audited = await env.prisma.auditLog.count({ where: { tableName: 'families', action: 'INSERT' } });
  assert.equal(audited, 330);
});

test('running the import a second time is refused, not duplicated', async () => {
  await assert.rejects(
    () => runLegacyImport(TEST_ACTOR, PROJECT_ROOT),
    (err: Error) => err.message.includes('استيراد') || /DUPLICATE_IMPORT/.test(String(err)),
  );
  assert.equal(await env.prisma.family.count(), 330, 'no families added by the refused re-run');

  const preview = await previewLegacyImport(PROJECT_ROOT);
  assert.equal(preview.alreadyImported, true);
  assert.equal(preview.toCreate, 0);
  assert.equal(preview.alreadyPresent, 330);
});

test('the missing-data list finds every imported family and shrinks as gaps are filled', async () => {
  const all = await listIncompleteFamilies({ page: 1, pageSize: 5, missing: 'all' });
  assert.equal(all.total, 330);

  const target = all.rows[0];
  await completeFamilyData(TEST_ACTOR, [
    { id: target.id, headNationalId: '9881234567', familyBookMembersCount: 6 },
  ]);

  const saved = await env.prisma.family.findUniqueOrThrow({ where: { id: target.id } });
  assert.equal(saved.headNationalId, '9881234567');
  assert.equal(saved.familyBookMembersCount, 6);

  assert.equal((await listIncompleteFamilies({ page: 1, pageSize: 5, missing: 'all' })).total, 329);
  assert.equal((await listIncompleteFamilies({ page: 1, pageSize: 5, missing: 'nationalId' })).total, 329);
  assert.equal((await listIncompleteFamilies({ page: 1, pageSize: 5, missing: 'bookCount' })).total, 329);
});

test('completing data never blanks a field that already has a value', async () => {
  const family = await env.prisma.family.findFirstOrThrow({ where: { headNationalId: { not: null } } });
  await completeFamilyData(TEST_ACTOR, [
    { id: family.id, headNationalId: '   ', familyBookMembersCount: null },
  ]);
  const after = await env.prisma.family.findUniqueOrThrow({ where: { id: family.id } });
  assert.equal(after.headNationalId, family.headNationalId);
  assert.equal(after.familyBookMembersCount, family.familyBookMembersCount);
});
