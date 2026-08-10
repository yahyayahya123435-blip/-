/**
 * The field app's local SQLite schema.
 *
 * It is a deliberate SUBSET of the desktop schema — only what field work
 * needs — but the column names match exactly, because rows are handed to the
 * desktop verbatim inside a .gztransfer package. Renaming a column here
 * silently breaks the import there.
 *
 * Every record gets a UUID primary key generated on the phone, so an id
 * created offline can be inserted on the desktop as-is and never collide
 * with a desktop-generated cuid.
 */

export const SCHEMA_VERSION = 1;

/**
 * Applied with `execAsync` on every launch. Every statement is
 * CREATE ... IF NOT EXISTS, so running it against an existing database is a
 * no-op and an interrupted first launch simply retries.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS families (
  id                     TEXT PRIMARY KEY,
  familyCode             TEXT,
  headOfFamilyName       TEXT NOT NULL,
  wifeName               TEXT,
  headNationalId         TEXT,
  familyBookMembersCount INTEGER,
  phone                  TEXT,
  altPhone               TEXT,
  city                   TEXT,
  neighborhood           TEXT,
  address                TEXT,
  maritalStatus          TEXT,
  housingType            TEXT,
  incomeSource           TEXT,
  monthlyIncomeFils      INTEGER NOT NULL DEFAULT 0,
  monthlyExpensesFils    INTEGER NOT NULL DEFAULT 0,
  healthStatus           TEXT,
  needLevel              TEXT,
  economicLevel          TEXT,
  fileStatus             TEXT NOT NULL DEFAULT 'نشط',
  notes                  TEXT,
  isActive               INTEGER NOT NULL DEFAULT 1,
  createdAt              TEXT NOT NULL,
  updatedAt              TEXT NOT NULL,
  -- Local bookkeeping, stripped before export.
  origin                 TEXT NOT NULL DEFAULT 'local',
  dirty                  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_families_name ON families(headOfFamilyName);

CREATE TABLE IF NOT EXISTS family_members (
  id             TEXT PRIMARY KEY,
  familyId       TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  fullName       TEXT NOT NULL,
  nationalId     TEXT,
  relationship   TEXT NOT NULL,
  gender         TEXT NOT NULL,
  birthDate      TEXT,
  maritalStatus  TEXT,
  educationLevel TEXT,
  occupation     TEXT,
  healthStatus   TEXT,
  disabilityType TEXT,
  isDisabled     INTEGER NOT NULL DEFAULT 0,
  isOrphan       INTEGER NOT NULL DEFAULT 0,
  isStudent      INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL,
  origin         TEXT NOT NULL DEFAULT 'local',
  dirty          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_members_family ON family_members(familyId);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id         TEXT PRIMARY KEY,
  familyId   TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  fullName   TEXT NOT NULL,
  nationalId TEXT,
  phone      TEXT,
  birthDate  TEXT,
  gender     TEXT,
  category   TEXT,
  status     TEXT NOT NULL DEFAULT 'نشط',
  notes      TEXT,
  isActive   INTEGER NOT NULL DEFAULT 1,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL,
  origin     TEXT NOT NULL DEFAULT 'local',
  dirty      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_family ON beneficiaries(familyId);

CREATE TABLE IF NOT EXISTS social_assessments (
  id                   TEXT PRIMARY KEY,
  familyId             TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  beneficiaryId        TEXT REFERENCES beneficiaries(id) ON DELETE SET NULL,
  assessmentDate       TEXT NOT NULL,
  monthlyIncomeFils    INTEGER NOT NULL DEFAULT 0,
  monthlyExpensesFils  INTEGER NOT NULL DEFAULT 0,
  economicLevel        TEXT,
  housingCondition     TEXT,
  housingOwnership     TEXT,
  roomsCount           INTEGER,
  healthCondition      TEXT,
  chronicDiseases      TEXT,
  disabilities         TEXT,
  childrenCount        INTEGER,
  orphansCount         INTEGER,
  studentsCount        INTEGER,
  unemployedCount      INTEGER,
  financialObligations TEXT,
  basicNeeds           TEXT,
  needLevel            TEXT,
  recommendation       TEXT,
  notes                TEXT,
  createdAt            TEXT NOT NULL,
  updatedAt            TEXT NOT NULL,
  origin               TEXT NOT NULL DEFAULT 'local',
  dirty                INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_assessments_family ON social_assessments(familyId);

CREATE TABLE IF NOT EXISTS field_visits (
  id             TEXT PRIMARY KEY,
  familyId       TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  beneficiaryId  TEXT REFERENCES beneficiaries(id) ON DELETE SET NULL,
  visitDate      TEXT NOT NULL,
  purpose        TEXT,
  findings       TEXT,
  recommendation TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'مكتملة',
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL,
  origin         TEXT NOT NULL DEFAULT 'local',
  dirty          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_visits_family ON field_visits(familyId);

CREATE TABLE IF NOT EXISTS assistances (
  id            TEXT PRIMARY KEY,
  familyId      TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  beneficiaryId TEXT NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  assistanceTypeName TEXT,
  amountFils    INTEGER NOT NULL DEFAULT 0,
  quantity      INTEGER,
  unit          TEXT,
  source        TEXT,
  status        TEXT NOT NULL DEFAULT 'مصروفة',
  disbursedAt   TEXT NOT NULL,
  notes         TEXT,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL,
  origin        TEXT NOT NULL DEFAULT 'local',
  dirty         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_assistances_family ON assistances(familyId);

CREATE TABLE IF NOT EXISTS attachments (
  id         TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId   TEXT NOT NULL,
  fileName   TEXT NOT NULL,
  localPath  TEXT NOT NULL,
  mimeType   TEXT NOT NULL,
  sizeBytes  INTEGER NOT NULL DEFAULT 0,
  createdAt  TEXT NOT NULL,
  dirty      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entityType, entityId);

CREATE TABLE IF NOT EXISTS export_log (
  id          TEXT PRIMARY KEY,
  fileName    TEXT NOT NULL,
  exportedAt  TEXT NOT NULL,
  recordCount INTEGER NOT NULL DEFAULT 0,
  fullExport  INTEGER NOT NULL DEFAULT 0
);
`;

/** Tables carried in a transfer package, in dependency order. */
export const EXPORTABLE_TABLES = [
  { table: 'families', entity: 'families' },
  { table: 'family_members', entity: 'familyMembers' },
  { table: 'beneficiaries', entity: 'beneficiaries' },
  { table: 'social_assessments', entity: 'socialAssessments' },
  { table: 'field_visits', entity: 'fieldVisits' },
  { table: 'assistances', entity: 'assistances' },
] as const;

/** Local-only columns that must never appear in an exported record. */
export const LOCAL_ONLY_COLUMNS = new Set(['origin', 'dirty', 'assistanceTypeName']);
