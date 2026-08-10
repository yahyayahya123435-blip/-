/**
 * The mandatory Windows-side checks from section 29 of the requirement, run
 * against a real SQLite file through the same service layer the IPC handlers
 * call. Ordered as a single session, because most steps depend on the ones
 * before them (you cannot record an assistance without a beneficiary).
 *
 * What this does NOT cover, and why:
 *   - PDF generation, which uses Electron's webContents.printToPDF and needs
 *     a BrowserWindow. DOCX and XLSX, which are pure Node, are covered here.
 *   - Anything requiring a rendered window or a real file dialog.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestEnv, PROJECT_ROOT, type TestEnv } from './helpers';
import { bootstrapDatabase } from '../src/lib/db-bootstrap';
import { initPrisma, disconnectPrisma, checkpointWal } from '../src/lib/db';
import { hasAnyUser, createSuperAdmin, verifyLogin } from '../src/lib/auth';
import { toSafeError } from '../src/lib/app-error';
import { hasPermission, requirePermission, PermissionDeniedError } from '../src/lib/permissions';
import { createUser, listRoles } from '../src/services/users';
import { createFamily, createFamilyMember, updateFamily, listFamilyMembers, checkDuplicateFamilies } from '../src/services/families';
import { createBeneficiary, checkDuplicateBeneficiaries } from '../src/services/beneficiaries';
import { createAssessment, createFieldVisit } from '../src/services/social';
import { createCampaign } from '../src/services/assistances';
import { createAssistance } from '../src/services/assistances';
import {
  createWarehouse, createInventoryItem, createStockIn, createStockOut, createSupplier,
} from '../src/services/inventory';
import { createDonor, createDonation } from '../src/services/donations';
import { createTransaction, accountingSummary } from '../src/services/accounting';
import { uploadAttachment } from '../src/services/attachments';
import { generateDocx, generateXlsx } from '../src/services/documents';
import { createBackupZip, restoreBackupZip, listBackups } from '../src/services/backup';
import { dashboardSummary, globalSearch } from '../src/services/dashboard';

let env: TestEnv;
let actor: { userId: string | null; username: string | null };

const ids = {
  superAdmin: '',
  viewer: '',
  family: '',
  member: '',
  beneficiary: '',
  campaign: '',
  warehouse: '',
  item: '',
  supplier: '',
  donor: '',
};

let paths: { attachments: string; documents: string; backups: string; metadata: string };

test.before(async () => {
  env = await createTestEnv('e2e');
  paths = {
    attachments: path.join(env.root, 'Attachments'),
    documents: path.join(env.root, 'Documents'),
    backups: path.join(env.root, 'Backups'),
    metadata: path.join(env.root, 'metadata'),
  };
  for (const dir of Object.values(paths)) fs.mkdirSync(dir, { recursive: true });
});

test.after(async () => {
  await env.cleanup();
});

// ── Setup & authentication ───────────────────────────────────────────────────

test('first run: no users exist, and the Super Admin can be created', async () => {
  assert.equal(await hasAnyUser(), false);

  const admin = await createSuperAdmin({
    fullName: 'مدير النظام',
    username: 'superadmin',
    password: 'StrongPass!2026',
  });
  ids.superAdmin = admin.id;
  actor = { userId: admin.id, username: admin.username };

  assert.equal(await hasAnyUser(), true);
  // The password is hashed, never stored as typed.
  assert.notEqual(admin.passwordHash, 'StrongPass!2026');
  assert.match(admin.passwordHash, /^\$2[aby]\$/);
});

test('setup cannot be run a second time', async () => {
  await assert.rejects(
    () => createSuperAdmin({ fullName: 'مدخل آخر', username: 'other', password: 'StrongPass!2026' }),
    /SETUP_ALREADY_DONE/,
  );
});

test('login succeeds with the right password and fails with the wrong one', async () => {
  assert.ok(await verifyLogin('superadmin', 'StrongPass!2026'));
  assert.equal(await verifyLogin('superadmin', 'wrong-password'), null);
  assert.equal(await verifyLogin('no-such-user', 'StrongPass!2026'), null);

  // Every attempt is recorded, with the distinguishing reason kept server-side.
  const attempts = await env.prisma.loginAttempt.findMany({ orderBy: { attemptedAt: 'asc' } });
  assert.equal(attempts.length, 3);
  assert.deepEqual(
    attempts.map((a) => [a.successful, a.reason]),
    [[true, null], [false, 'BAD_PASSWORD'], [false, 'UNKNOWN_USER']],
  );
});

test('permissions are enforced in the service layer, not just the UI', async () => {
  const roles = await listRoles();
  const viewerRole = roles.find((r) => r.name === 'مطّلع');
  assert.ok(viewerRole, 'the read-only role is seeded');

  const viewer = await createUser(actor, {
    fullName: 'مستخدم اطلاع',
    username: 'viewer',
    password: 'ViewerPass!2026',
    roleId: viewerRole.id,
  });
  ids.viewer = viewer.id;

  assert.equal(await hasPermission(viewer.id, 'families', 'view'), true);
  assert.equal(await hasPermission(viewer.id, 'families', 'create'), false);
  assert.equal(await hasPermission(viewer.id, 'accounting', 'view'), false);

  await assert.rejects(
    () => requirePermission(viewer.id, 'families', 'delete'),
    (err: unknown) => err instanceof PermissionDeniedError,
  );

  // And the Super Admin really does have everything.
  assert.equal(await hasPermission(ids.superAdmin, 'accounting', 'delete'), true);
  assert.equal(await hasPermission(ids.superAdmin, 'transfer', 'create'), true);
});

// ── Families, members, beneficiaries ─────────────────────────────────────────

test('create and edit a family, add a member, create a beneficiary', async () => {
  const family = await createFamily(actor, {
    familyCode: 'TEST-0001',
    headOfFamilyName: 'محمد أحمد الاختبار',
    wifeName: 'فاطمة سالم',
    headNationalId: '9001234567',
    phone: '0791234567',
    monthlyIncomeFils: 250_000,
    monthlyExpensesFils: 300_000,
    needLevel: 'شديد الحاجة',
    fileStatus: 'نشط',
  });
  ids.family = family.id;
  assert.equal(family.monthlyIncomeFils, 250_000);

  await updateFamily(actor, { id: family.id, neighborhood: 'حي الزهور', familyBookMembersCount: 5 });
  const updated = await env.prisma.family.findUniqueOrThrow({ where: { id: family.id } });
  assert.equal(updated.neighborhood, 'حي الزهور');
  assert.equal(updated.familyBookMembersCount, 5);

  const member = await createFamilyMember(actor, {
    familyId: family.id,
    fullName: 'ولد الاختبار',
    relationship: 'ابن',
    gender: 'ذكر',
    birthDate: new Date('2014-05-01'),
    isOrphan: false,
    isStudent: true,
    isDisabled: false,
    monthlyIncomeFils: 0,
  });
  ids.member = member.id;

  const members = await listFamilyMembers(family.id);
  assert.equal(members.length, 1);
  assert.equal(typeof members[0].age, 'number', 'age is derived from the birth date');

  const beneficiary = await createBeneficiary(actor, {
    familyId: family.id,
    fullName: 'مستفيد الاختبار',
    nationalId: '9007654321',
    category: 'يتيم',
    status: 'نشط',
  });
  ids.beneficiary = beneficiary.id;
});

test('duplicate detection warns without blocking', async () => {
  const familyMatches = await checkDuplicateFamilies({
    headOfFamilyName: 'محمد أحمد الاختبار',
    headNationalId: '9001234567',
  });
  assert.equal(familyMatches.length, 1);
  assert.equal(familyMatches[0].strong, true, 'a national-ID match is the strong signal');

  const beneficiaryMatches = await checkDuplicateBeneficiaries({
    fullName: 'مستفيد الاختبار',
    familyId: ids.family,
  });
  assert.equal(beneficiaryMatches.length, 1);

  // A legitimately similar record can still be saved — nothing is blocked.
  const second = await createFamily(actor, {
    familyCode: 'TEST-0002',
    headOfFamilyName: 'محمد أحمد الاختبار',
    monthlyIncomeFils: 0,
    monthlyExpensesFils: 0,
    fileStatus: 'نشط',
  });
  assert.ok(second.id);
});

// ── Social research, visits, campaigns, assistances ──────────────────────────

test('record a social assessment and a field visit', async () => {
  const assessment = await createAssessment(actor, {
    familyId: ids.family,
    beneficiaryId: ids.beneficiary,
    assessmentDate: new Date(),
    monthlyIncomeFils: 250_000,
    monthlyExpensesFils: 300_000,
    housingOwnership: 'إيجار',
    roomsCount: 2,
    childrenCount: 3,
    orphansCount: 1,
    studentsCount: 2,
    unemployedCount: 1,
    needLevel: 'شديد الحاجة',
    recommendation: 'تحتاج الأسرة إلى كفالة شهرية',
  });
  assert.equal(assessment.roomsCount, 2);

  const visit = await createFieldVisit(actor, {
    familyId: ids.family,
    beneficiaryId: ids.beneficiary,
    userId: ids.superAdmin,
    visitDate: new Date(),
    purpose: 'زيارة تحقق',
    findings: 'الوضع مطابق للبحث الاجتماعي',
    recommendation: 'صرف طرد غذائي',
    status: 'مكتملة',
  });
  assert.equal(visit.status, 'مكتملة');
});

test('inventory: stock in raises the balance, stock out lowers it', async () => {
  const warehouse = await createWarehouse(actor, { name: 'المستودع الرئيسي', location: 'المقر' });
  ids.warehouse = warehouse.id;

  const supplier = await createSupplier(actor, { name: 'مورد الاختبار', phone: '0781111111' });
  ids.supplier = supplier.id;

  const item = await createInventoryItem(actor, {
    warehouseId: warehouse.id,
    name: 'طرد غذائي',
    unit: 'طرد',
    minQuantity: 5,
    unitPriceFils: 12_500,
    quantity: 0,
  });
  ids.item = item.id;

  await createStockIn(actor, {
    inventoryItemId: item.id,
    supplierId: supplier.id,
    quantity: 100,
    unitPriceFils: 12_500,
    receivedAt: new Date(),
  });
  assert.equal((await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantity, 100);

  await createStockOut(actor, {
    inventoryItemId: item.id,
    quantity: 10,
    reason: 'تالف',
    issuedAt: new Date(),
  });
  assert.equal((await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantity, 90);
});

test('stock can never go negative', async () => {
  const before = (await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids.item } })).quantity;

  await assert.rejects(
    () => createStockOut(actor, {
      inventoryItemId: ids.item,
      quantity: before + 1,
      reason: 'أخرى',
      issuedAt: new Date(),
    }),
  );

  assert.equal(
    (await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids.item } })).quantity,
    before,
    'the rejected issue must not have changed the balance',
  );
});

test('an in-kind assistance decrements stock inside one transaction', async () => {
  const campaign = await createCampaign(actor, {
    name: 'حملة الشتاء',
    targetAmountFils: 5_000_000,
    status: 'مفتوحة',
  });
  ids.campaign = campaign.id;

  const type = await env.prisma.assistanceType.findFirstOrThrow({ where: { name: 'طرود غذائية' } });
  const before = (await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids.item } })).quantity;

  await createAssistance(actor, {
    beneficiaryId: ids.beneficiary,
    familyId: ids.family,
    assistanceTypeId: type.id,
    campaignId: campaign.id,
    inventoryItemId: ids.item,
    quantity: 2,
    amountFils: 25_000,
    status: 'مصروفة',
    disbursedAt: new Date(),
  });

  assert.equal(
    (await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids.item } })).quantity,
    before - 2,
  );
  assert.equal(await env.prisma.stockOut.count({ where: { reason: 'مساعدة' } }), 1);
});

test('an assistance exceeding available stock is refused and changes nothing', async () => {
  const type = await env.prisma.assistanceType.findFirstOrThrow({ where: { name: 'طرود غذائية' } });
  const before = (await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids.item } })).quantity;
  const assistancesBefore = await env.prisma.assistance.count();

  await assert.rejects(
    () => createAssistance(actor, {
      beneficiaryId: ids.beneficiary,
      familyId: ids.family,
      assistanceTypeId: type.id,
      inventoryItemId: ids.item,
      quantity: before + 50,
      amountFils: 0,
      status: 'مصروفة',
      disbursedAt: new Date(),
    }),
  );

  assert.equal(
    (await env.prisma.inventoryItem.findUniqueOrThrow({ where: { id: ids.item } })).quantity,
    before,
  );
  assert.equal(await env.prisma.assistance.count(), assistancesBefore, 'the assistance row rolled back too');
});

// ── Donations and accounting ─────────────────────────────────────────────────

test('a donation produces a receipt and a matching income transaction', async () => {
  const donor = await createDonor(actor, { name: 'متبرع الاختبار', phone: '0799999999', donorType: 'فرد' });
  ids.donor = donor.id;

  const donation = await createDonation(actor, {
    donorId: donor.id,
    amountFils: 1_000_000,
    donationType: 'نقدي',
    method: 'كاش',
    donatedAt: new Date(),
  });

  const receipt = await env.prisma.receipt.findFirstOrThrow({ where: { donationId: donation.id } });
  assert.equal(receipt.amountFils, 1_000_000);

  const income = await env.prisma.transaction.findFirst({
    where: { referenceType: 'donation', referenceId: donation.id },
  });
  assert.ok(income, 'the donation is reflected once in the accounts');
  assert.equal(income.type, 'دخل');
});

test('expenses and the accounting summary balance in fils', async () => {
  const category = await env.prisma.expenseCategory.findFirstOrThrow({ where: { name: 'مصاريف تشغيلية' } });
  await createTransaction(actor, {
    type: 'مصروف',
    amountFils: 250_500,
    categoryId: category.id,
    description: 'فاتورة كهرباء',
    transactionAt: new Date(),
  });

  const summary = await accountingSummary({});
  assert.equal(summary.totalIncomeFils, 1_000_000);
  assert.equal(summary.totalExpenseFils, 250_500);
  assert.equal(summary.netFils, 749_500);
  // Money is integer fils throughout — no floats anywhere in the total.
  assert.ok(Number.isInteger(summary.netFils));
});

// ── Audit ────────────────────────────────────────────────────────────────────

test('inserts, updates and deletes are all audited and attributed', async () => {
  const inserts = await env.prisma.auditLog.count({ where: { tableName: 'families', action: 'INSERT' } });
  const updates = await env.prisma.auditLog.count({ where: { tableName: 'families', action: 'UPDATE' } });
  assert.ok(inserts >= 2);
  assert.ok(updates >= 1);

  const entry = await env.prisma.auditLog.findFirstOrThrow({
    where: { tableName: 'families', action: 'UPDATE' },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(entry.username, 'superadmin', 'the acting user is recorded');
  assert.ok(entry.oldValues && entry.newValues, 'both sides of the change are kept');

  await env.prisma.family.delete({ where: { id: (await env.prisma.family.findFirstOrThrow({ where: { familyCode: 'TEST-0002' } })).id } });
  assert.ok(await env.prisma.auditLog.count({ where: { tableName: 'families', action: 'DELETE' } }) >= 1);
});

test('audit rows cannot be edited or deleted, even directly', async () => {
  const row = await env.prisma.auditLog.findFirstOrThrow();
  const before = await env.prisma.auditLog.count();

  // Straight through Prisma, bypassing every service and IPC guard — the
  // protection has to hold at the database level, not just in application code.
  const updateError = await env.prisma.auditLog
    .update({ where: { id: row.id }, data: { username: 'tampered' } })
    .then(() => null)
    .catch((err: unknown) => err);
  assert.ok(updateError, 'updating an audit row must be rejected');

  const deleteError = await env.prisma.auditLog
    .delete({ where: { id: row.id } })
    .then(() => null)
    .catch((err: unknown) => err);
  assert.ok(deleteError, 'deleting an audit row must be rejected');

  const stored = await env.prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(stored.username, row.username);
  assert.equal(await env.prisma.auditLog.count(), before);

  // The user-facing translation must name the real cause. Prisma's SQLite
  // connector reports trigger rejections as a generic foreign-key error and
  // drops the trigger's message, so app-error resolves it by model instead.
  assert.equal(toSafeError(updateError).code, 'AUDIT_IMMUTABLE');
  assert.equal(toSafeError(deleteError).code, 'AUDIT_IMMUTABLE');
});

test('password hashes never reach the audit log', async () => {
  const userAudits = await env.prisma.auditLog.findMany({ where: { tableName: 'users' } });
  assert.ok(userAudits.length > 0);
  for (const entry of userAudits) {
    const payload = `${entry.oldValues ?? ''}${entry.newValues ?? ''}`;
    assert.ok(!payload.includes('passwordHash'), 'passwordHash is excluded from audit payloads');
    assert.ok(!payload.includes('$2b$'), 'no bcrypt hash leaks into the audit log');
  }
});

// ── Attachments ──────────────────────────────────────────────────────────────

test('an attachment is stored under the managed folder', async () => {
  const source = path.join(env.root, 'source.txt');
  fs.writeFileSync(source, 'محتوى مرفق للاختبار');

  const attachment = await uploadAttachment(actor, paths.attachments, {
    entityType: 'families',
    entityId: ids.family,
    sourcePath: source,
    originalFileName: 'report.txt',
  });

  const full = path.resolve(paths.attachments, attachment.storedName);
  assert.ok(full.startsWith(path.resolve(paths.attachments) + path.sep));
  assert.ok(fs.existsSync(full));
});

test('path traversal and disallowed file types are refused', async () => {
  const source = path.join(env.root, 'source.txt');

  await assert.rejects(
    () => uploadAttachment(actor, paths.attachments, {
      entityType: '../../../etc',
      entityId: ids.family,
      sourcePath: source,
      originalFileName: 'passwd.txt',
    }),
    /نوع السجل غير صحيح|قيمة غير صالحة|مسار ملف غير صالح/,
  );

  await assert.rejects(
    () => uploadAttachment(actor, paths.attachments, {
      entityType: 'families',
      entityId: ids.family,
      sourcePath: source,
      originalFileName: 'payload.exe',
    }),
    /نوع الملف غير مسموح/,
  );

  assert.ok(!fs.existsSync(path.join(env.root, 'etc')));
});

// ── Documents ────────────────────────────────────────────────────────────────

test('DOCX and XLSX are generated as real files', async () => {
  const spec = {
    orgName: 'جمعية غصون زهران الخيرية',
    title: 'تقرير الأسر',
    recordNumber: 'TEST-0001',
    date: '2026-08-10',
    columns: ['الرمز', 'رب الأسرة', 'الهاتف'],
    rows: [['TEST-0001', 'محمد أحمد الاختبار', '0791234567']],
    notes: 'تقرير اختباري',
  };

  const docxPath = await generateDocx(spec, paths.documents);
  const xlsxPath = await generateXlsx(spec, paths.documents);

  assert.ok(fs.existsSync(docxPath) && fs.statSync(docxPath).size > 0);
  assert.ok(fs.existsSync(xlsxPath) && fs.statSync(xlsxPath).size > 0);

  // Both formats are ZIP containers — check the signature rather than trusting
  // the extension, so a zero-byte or HTML-ish file would fail here.
  for (const file of [docxPath, xlsxPath]) {
    const header = fs.readFileSync(file).subarray(0, 2).toString('latin1');
    assert.equal(header, 'PK', `${path.basename(file)} is a real Office package`);
  }
});

test('a failed export never affects the saved record', async () => {
  const familiesBefore = await env.prisma.family.count();
  await assert.rejects(() =>
    generateDocx(
      { orgName: 'x', title: 'y', date: '2026-08-10', columns: [], rows: [] },
      path.join(env.root, 'no', 'such', 'directory', 'nested'),
    ),
  );
  assert.equal(await env.prisma.family.count(), familiesBefore);
});

// ── Dashboard and search ─────────────────────────────────────────────────────

test('the dashboard reports real counts, not placeholders', async () => {
  const summary = await dashboardSummary();
  const actualFamilies = await env.prisma.family.count();
  assert.equal(summary.familiesCount, actualFamilies);
  assert.ok(summary.familiesCount > 0);

  const results = await globalSearch({ query: 'الاختبار' });
  const flattened = JSON.stringify(results);
  assert.ok(flattened.includes('محمد أحمد الاختبار') || flattened.includes('مستفيد الاختبار'));
});

// ── Backup / restore / persistence ───────────────────────────────────────────

test('backup, then restore, brings the data back', async () => {
  const backupPath = await createBackupZip(
    { dbFile: env.dbFile, ...paths },
    '1.0.0',
    'test-migration',
    undefined,
    checkpointWal,
  );
  assert.ok(fs.existsSync(backupPath));
  assert.equal((await listBackups(paths.backups)).length, 1);

  const familiesAtBackup = await env.prisma.family.count();

  // Change the database after the backup, then restore over it.
  await env.prisma.family.create({
    data: { familyCode: 'AFTER-BACKUP', headOfFamilyName: 'أسرة بعد النسخة الاحتياطية' },
  });
  assert.equal(await env.prisma.family.count(), familiesAtBackup + 1);

  const result = await restoreBackupZip(
    backupPath,
    { dbFile: env.dbFile, ...paths },
    '1.0.0',
    'test-migration',
    {
      checkpoint: checkpointWal,
      beforeSwap: async () => disconnectPrisma(),
      afterSwap: async () => {
        env.prisma = initPrisma(env.dbFile);
      },
    },
    path.join(env.root, 'restore-tmp'),
  );
  assert.ok(result);

  assert.equal(await env.prisma.family.count(), familiesAtBackup, 'the post-backup row is gone after restore');
  assert.equal(
    await env.prisma.family.count({ where: { familyCode: 'AFTER-BACKUP' } }),
    0,
  );
  // Restoring always takes a safety copy of the state it replaced.
  assert.ok((await listBackups(paths.backups)).length >= 2);
});

test('data survives closing and reopening the database', async () => {
  const familiesBefore = await env.prisma.family.count();
  const auditBefore = await env.prisma.auditLog.count();

  await checkpointWal();
  await disconnectPrisma();

  // Exactly what the app does on the next launch.
  bootstrapDatabase(env.dbFile, PROJECT_ROOT);
  env.prisma = initPrisma(env.dbFile);

  assert.equal(await env.prisma.family.count(), familiesBefore);
  assert.equal(await env.prisma.auditLog.count(), auditBefore);
  assert.ok(await verifyLogin('superadmin', 'StrongPass!2026'), 'the user can still log in');
});
