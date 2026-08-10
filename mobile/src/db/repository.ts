/**
 * Typed CRUD over the local SQLite tables.
 *
 * Writes always stamp `updatedAt` and set `dirty = 1`; the exporter uses that
 * flag to build an incremental package ("only what changed since the last
 * export") and clears it once the package has actually been written.
 */
import { getDatabase, newId, nowIso } from './client';

export interface FamilyRow {
  id: string;
  familyCode: string | null;
  headOfFamilyName: string;
  wifeName: string | null;
  headNationalId: string | null;
  familyBookMembersCount: number | null;
  phone: string | null;
  altPhone: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  maritalStatus: string | null;
  housingType: string | null;
  incomeSource: string | null;
  monthlyIncomeFils: number;
  monthlyExpensesFils: number;
  healthStatus: string | null;
  needLevel: string | null;
  economicLevel: string | null;
  fileStatus: string;
  notes: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  origin: string;
  dirty: number;
}

export interface BeneficiaryRow {
  id: string;
  familyId: string;
  fullName: string;
  nationalId: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  category: string | null;
  status: string;
  notes: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface VisitRow {
  id: string;
  familyId: string;
  beneficiaryId: string | null;
  visitDate: string;
  purpose: string | null;
  findings: string | null;
  recommendation: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentRow {
  id: string;
  familyId: string;
  beneficiaryId: string | null;
  assessmentDate: string;
  monthlyIncomeFils: number;
  monthlyExpensesFils: number;
  housingCondition: string | null;
  housingOwnership: string | null;
  roomsCount: number | null;
  healthCondition: string | null;
  chronicDiseases: string | null;
  disabilities: string | null;
  childrenCount: number | null;
  orphansCount: number | null;
  studentsCount: number | null;
  unemployedCount: number | null;
  financialObligations: string | null;
  basicNeeds: string | null;
  needLevel: string | null;
  recommendation: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistanceRow {
  id: string;
  familyId: string;
  beneficiaryId: string;
  assistanceTypeName: string | null;
  amountFils: number;
  quantity: number | null;
  unit: string | null;
  source: string | null;
  status: string;
  disbursedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentRow {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  dirty: number;
}

/**
 * Builds an INSERT for a new record: caller supplies the business columns,
 * this adds id/timestamps/dirty. Column names come from the object keys, so
 * they are code-controlled, never user input.
 */
async function insertRow(table: string, values: Record<string, unknown>): Promise<string> {
  const db = await getDatabase();
  const id = (values.id as string) ?? newId();
  const timestamp = nowIso();
  const record: Record<string, unknown> = {
    ...values, id, createdAt: timestamp, updatedAt: timestamp, dirty: 1,
  };
  const columns = Object.keys(record);
  const placeholders = columns.map(() => '?').join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    ...columns.map((c) => record[c] as never),
  );
  return id;
}

async function updateRow(table: string, id: string, values: Record<string, unknown>): Promise<void> {
  const db = await getDatabase();
  const record: Record<string, unknown> = { ...values, updatedAt: nowIso(), dirty: 1 };
  const columns = Object.keys(record);
  const assignments = columns.map((c) => `${c} = ?`).join(', ');
  await db.runAsync(
    `UPDATE ${table} SET ${assignments} WHERE id = ?`,
    ...columns.map((c) => record[c] as never),
    id,
  );
}

// ---- Families ---------------------------------------------------------------

export async function listFamilies(search = ''): Promise<FamilyRow[]> {
  const db = await getDatabase();
  if (!search.trim()) {
    return db.getAllAsync<FamilyRow>(
      'SELECT * FROM families WHERE isActive = 1 ORDER BY updatedAt DESC LIMIT 300',
    );
  }
  const term = `%${search.trim()}%`;
  return db.getAllAsync<FamilyRow>(
    `SELECT * FROM families
      WHERE isActive = 1
        AND (headOfFamilyName LIKE ? OR wifeName LIKE ? OR phone LIKE ?
             OR headNationalId LIKE ? OR familyCode LIKE ?)
      ORDER BY updatedAt DESC LIMIT 300`,
    term, term, term, term, term,
  );
}

export async function getFamily(id: string): Promise<FamilyRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<FamilyRow>('SELECT * FROM families WHERE id = ?', id);
}

export type FamilyInput = Partial<Omit<FamilyRow, 'id' | 'createdAt' | 'updatedAt' | 'dirty'>> & {
  headOfFamilyName: string;
};

export async function createFamily(input: FamilyInput): Promise<string> {
  return insertRow('families', {
    familyCode: input.familyCode ?? null,
    headOfFamilyName: input.headOfFamilyName,
    wifeName: input.wifeName ?? null,
    headNationalId: input.headNationalId ?? null,
    familyBookMembersCount: input.familyBookMembersCount ?? null,
    phone: input.phone ?? null,
    altPhone: input.altPhone ?? null,
    city: input.city ?? null,
    neighborhood: input.neighborhood ?? null,
    address: input.address ?? null,
    maritalStatus: input.maritalStatus ?? null,
    housingType: input.housingType ?? null,
    incomeSource: input.incomeSource ?? null,
    monthlyIncomeFils: input.monthlyIncomeFils ?? 0,
    monthlyExpensesFils: input.monthlyExpensesFils ?? 0,
    healthStatus: input.healthStatus ?? null,
    needLevel: input.needLevel ?? null,
    economicLevel: input.economicLevel ?? null,
    fileStatus: input.fileStatus ?? 'نشط',
    notes: input.notes ?? null,
    isActive: 1,
    origin: 'local',
  });
}

export async function updateFamily(id: string, input: Partial<FamilyInput>): Promise<void> {
  await updateRow('families', id, input as Record<string, unknown>);
}

/**
 * Possible duplicates of a family being entered. Same rule as the desktop: a
 * national-ID match is the strong signal, name and phone are advisory, and
 * nothing is ever blocked or merged automatically.
 */
export async function findSimilarFamilies(
  headOfFamilyName: string,
  headNationalId?: string,
  phone?: string,
  excludeId?: string,
): Promise<FamilyRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<FamilyRow>(
    `SELECT * FROM families
      WHERE (headOfFamilyName = ?
             OR (? IS NOT NULL AND ? <> '' AND headNationalId = ?)
             OR (? IS NOT NULL AND ? <> '' AND phone = ?))
        AND id <> ?
      LIMIT 10`,
    headOfFamilyName,
    headNationalId ?? '', headNationalId ?? '', headNationalId ?? '',
    phone ?? '', phone ?? '', phone ?? '',
    excludeId ?? '',
  );
}

// ---- Beneficiaries ----------------------------------------------------------

export async function listBeneficiaries(familyId?: string): Promise<BeneficiaryRow[]> {
  const db = await getDatabase();
  if (familyId) {
    return db.getAllAsync<BeneficiaryRow>(
      'SELECT * FROM beneficiaries WHERE familyId = ? AND isActive = 1 ORDER BY fullName',
      familyId,
    );
  }
  return db.getAllAsync<BeneficiaryRow>(
    'SELECT * FROM beneficiaries WHERE isActive = 1 ORDER BY updatedAt DESC LIMIT 300',
  );
}

export async function createBeneficiary(input: {
  familyId: string;
  fullName: string;
  nationalId?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  category?: string | null;
  notes?: string | null;
}): Promise<string> {
  return insertRow('beneficiaries', {
    familyId: input.familyId,
    fullName: input.fullName,
    nationalId: input.nationalId ?? null,
    phone: input.phone ?? null,
    birthDate: input.birthDate ?? null,
    gender: input.gender ?? null,
    category: input.category ?? null,
    status: 'نشط',
    notes: input.notes ?? null,
    isActive: 1,
    origin: 'local',
  });
}

// ---- Field visits -----------------------------------------------------------

export async function listVisits(familyId?: string): Promise<VisitRow[]> {
  const db = await getDatabase();
  if (familyId) {
    return db.getAllAsync<VisitRow>(
      'SELECT * FROM field_visits WHERE familyId = ? ORDER BY visitDate DESC',
      familyId,
    );
  }
  return db.getAllAsync<VisitRow>('SELECT * FROM field_visits ORDER BY visitDate DESC LIMIT 200');
}

export async function createVisit(input: {
  familyId: string;
  beneficiaryId?: string | null;
  visitDate: string;
  purpose?: string | null;
  findings?: string | null;
  recommendation?: string | null;
  notes?: string | null;
  status?: string;
}): Promise<string> {
  return insertRow('field_visits', {
    familyId: input.familyId,
    beneficiaryId: input.beneficiaryId ?? null,
    visitDate: input.visitDate,
    purpose: input.purpose ?? null,
    findings: input.findings ?? null,
    recommendation: input.recommendation ?? null,
    notes: input.notes ?? null,
    status: input.status ?? 'مكتملة',
    origin: 'local',
  });
}

// ---- Social assessments -----------------------------------------------------

export async function listAssessments(familyId?: string): Promise<AssessmentRow[]> {
  const db = await getDatabase();
  if (familyId) {
    return db.getAllAsync<AssessmentRow>(
      'SELECT * FROM social_assessments WHERE familyId = ? ORDER BY assessmentDate DESC',
      familyId,
    );
  }
  return db.getAllAsync<AssessmentRow>(
    'SELECT * FROM social_assessments ORDER BY assessmentDate DESC LIMIT 200',
  );
}

export async function createAssessment(input: {
  familyId: string;
  beneficiaryId?: string | null;
  assessmentDate: string;
  monthlyIncomeFils?: number;
  monthlyExpensesFils?: number;
  housingCondition?: string | null;
  housingOwnership?: string | null;
  roomsCount?: number | null;
  healthCondition?: string | null;
  chronicDiseases?: string | null;
  disabilities?: string | null;
  childrenCount?: number | null;
  orphansCount?: number | null;
  studentsCount?: number | null;
  unemployedCount?: number | null;
  financialObligations?: string | null;
  basicNeeds?: string | null;
  needLevel?: string | null;
  recommendation?: string | null;
  notes?: string | null;
}): Promise<string> {
  return insertRow('social_assessments', {
    familyId: input.familyId,
    beneficiaryId: input.beneficiaryId ?? null,
    assessmentDate: input.assessmentDate,
    monthlyIncomeFils: input.monthlyIncomeFils ?? 0,
    monthlyExpensesFils: input.monthlyExpensesFils ?? 0,
    economicLevel: null,
    housingCondition: input.housingCondition ?? null,
    housingOwnership: input.housingOwnership ?? null,
    roomsCount: input.roomsCount ?? null,
    healthCondition: input.healthCondition ?? null,
    chronicDiseases: input.chronicDiseases ?? null,
    disabilities: input.disabilities ?? null,
    childrenCount: input.childrenCount ?? null,
    orphansCount: input.orphansCount ?? null,
    studentsCount: input.studentsCount ?? null,
    unemployedCount: input.unemployedCount ?? null,
    financialObligations: input.financialObligations ?? null,
    basicNeeds: input.basicNeeds ?? null,
    needLevel: input.needLevel ?? null,
    recommendation: input.recommendation ?? null,
    notes: input.notes ?? null,
    origin: 'local',
  });
}

// ---- Assistances ------------------------------------------------------------

export async function listAssistances(familyId?: string): Promise<AssistanceRow[]> {
  const db = await getDatabase();
  if (familyId) {
    return db.getAllAsync<AssistanceRow>(
      'SELECT * FROM assistances WHERE familyId = ? ORDER BY disbursedAt DESC',
      familyId,
    );
  }
  return db.getAllAsync<AssistanceRow>('SELECT * FROM assistances ORDER BY disbursedAt DESC LIMIT 200');
}

export async function createAssistance(input: {
  familyId: string;
  beneficiaryId: string;
  assistanceTypeName?: string | null;
  amountFils?: number;
  quantity?: number | null;
  unit?: string | null;
  source?: string | null;
  disbursedAt: string;
  notes?: string | null;
}): Promise<string> {
  return insertRow('assistances', {
    familyId: input.familyId,
    beneficiaryId: input.beneficiaryId,
    assistanceTypeName: input.assistanceTypeName ?? null,
    amountFils: input.amountFils ?? 0,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    source: input.source ?? null,
    status: 'مصروفة',
    disbursedAt: input.disbursedAt,
    notes: input.notes ?? null,
    origin: 'local',
  });
}

// ---- Attachments ------------------------------------------------------------

export async function listAttachments(entityType: string, entityId: string): Promise<AttachmentRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<AttachmentRow>(
    'SELECT * FROM attachments WHERE entityType = ? AND entityId = ? ORDER BY createdAt DESC',
    entityType,
    entityId,
  );
}

export async function createAttachment(input: {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO attachments (id, entityType, entityId, fileName, localPath, mimeType, sizeBytes, createdAt, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    input.id, input.entityType, input.entityId, input.fileName,
    input.localPath, input.mimeType, input.sizeBytes, nowIso(),
  );
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM attachments WHERE id = ?', id);
}

// ---- Dashboard counts -------------------------------------------------------

export interface FieldCounts {
  families: number;
  beneficiaries: number;
  visits: number;
  assessments: number;
  assistances: number;
  pendingExport: number;
}

export async function getCounts(): Promise<FieldCounts> {
  const db = await getDatabase();
  const one = async (sql: string) =>
    (await db.getFirstAsync<{ c: number }>(sql))?.c ?? 0;

  return {
    families: await one('SELECT COUNT(*) c FROM families WHERE isActive = 1'),
    beneficiaries: await one('SELECT COUNT(*) c FROM beneficiaries WHERE isActive = 1'),
    visits: await one('SELECT COUNT(*) c FROM field_visits'),
    assessments: await one('SELECT COUNT(*) c FROM social_assessments'),
    assistances: await one('SELECT COUNT(*) c FROM assistances'),
    pendingExport: await one(
      `SELECT (SELECT COUNT(*) FROM families WHERE dirty = 1)
            + (SELECT COUNT(*) FROM family_members WHERE dirty = 1)
            + (SELECT COUNT(*) FROM beneficiaries WHERE dirty = 1)
            + (SELECT COUNT(*) FROM social_assessments WHERE dirty = 1)
            + (SELECT COUNT(*) FROM field_visits WHERE dirty = 1)
            + (SELECT COUNT(*) FROM assistances WHERE dirty = 1) AS c`,
    ),
  };
}
