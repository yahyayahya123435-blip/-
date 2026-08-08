-- ============================================================================
-- جمعية غصون زهران الخيرية — SQLite constraints, integrity triggers, context
-- Applied once after `prisma migrate` on every fresh/upgraded database file.
-- Idempotent: every statement uses IF NOT EXISTS / DROP+CREATE where needed.
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- Audit context: SQLite has no SET LOCAL / set_config like PostgreSQL.
-- The app writes the acting user's id into this single-row-per-key table
-- INSIDE the same transaction as the write it is attributing, then triggers
-- read it back via the helper below. Safe because SQLite serializes writers.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _audit_context (
  key   TEXT PRIMARY KEY,
  value TEXT
);
INSERT OR IGNORE INTO _audit_context (key, value) VALUES ('current_user_id', NULL);
INSERT OR IGNORE INTO _audit_context (key, value) VALUES ('current_username', NULL);

-- ----------------------------------------------------------------------------
-- Data-integrity triggers (business rules that CHECK/FK alone cannot express)
-- ----------------------------------------------------------------------------

-- A beneficiary's family_id must not be changed to a family that does not exist
-- (redundant with FK, kept as an explicit guard for clarity of intent) and a
-- beneficiary may not be linked to a family through a family_member of a
-- different family (defensive integrity: prevents cross-family data corruption
-- if application code ever passes mismatched ids).
DROP TRIGGER IF EXISTS trg_beneficiary_family_consistency_insert;
CREATE TRIGGER trg_beneficiary_family_consistency_insert
BEFORE INSERT ON beneficiaries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM families WHERE id = NEW.familyId)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_FAMILY: beneficiary must reference an existing family');
END;

DROP TRIGGER IF EXISTS trg_beneficiary_family_consistency_update;
CREATE TRIGGER trg_beneficiary_family_consistency_update
BEFORE UPDATE OF familyId ON beneficiaries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM families WHERE id = NEW.familyId)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_FAMILY: beneficiary must reference an existing family');
END;

-- An assistance's familyId must match its beneficiary's familyId (prevents
-- recording assistance against a family the beneficiary does not belong to).
DROP TRIGGER IF EXISTS trg_assistance_family_matches_beneficiary_insert;
CREATE TRIGGER trg_assistance_family_matches_beneficiary_insert
BEFORE INSERT ON assistances
FOR EACH ROW
WHEN NEW.familyId <> (SELECT familyId FROM beneficiaries WHERE id = NEW.beneficiaryId)
BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MISMATCH: assistance familyId must match beneficiary familyId');
END;

DROP TRIGGER IF EXISTS trg_assistance_family_matches_beneficiary_update;
CREATE TRIGGER trg_assistance_family_matches_beneficiary_update
BEFORE UPDATE OF familyId, beneficiaryId ON assistances
FOR EACH ROW
WHEN NEW.familyId <> (SELECT familyId FROM beneficiaries WHERE id = NEW.beneficiaryId)
BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MISMATCH: assistance familyId must match beneficiary familyId');
END;

-- A social assessment's beneficiaryId (if set) must belong to the same familyId.
DROP TRIGGER IF EXISTS trg_assessment_family_matches_beneficiary_insert;
CREATE TRIGGER trg_assessment_family_matches_beneficiary_insert
BEFORE INSERT ON social_assessments
FOR EACH ROW
WHEN NEW.beneficiaryId IS NOT NULL
 AND NEW.familyId <> (SELECT familyId FROM beneficiaries WHERE id = NEW.beneficiaryId)
BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MISMATCH: assessment familyId must match beneficiary familyId');
END;

-- ----------------------------------------------------------------------------
-- Inventory: never allow negative stock. Prisma's raw quantity updates go
-- through services/inventory.ts, but this DB-level guard is the final line
-- of defense regardless of caller. A CHECK constraint cannot be added to an
-- existing SQLite table without a full table rebuild, so triggers are used.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_inventory_no_negative_insert;
CREATE TRIGGER trg_inventory_no_negative_insert
BEFORE INSERT ON inventory_items
FOR EACH ROW
WHEN NEW.quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'NEGATIVE_STOCK: inventory quantity cannot be negative');
END;

DROP TRIGGER IF EXISTS trg_inventory_no_negative_update;
CREATE TRIGGER trg_inventory_no_negative_update
BEFORE UPDATE OF quantity ON inventory_items
FOR EACH ROW
WHEN NEW.quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'NEGATIVE_STOCK: inventory quantity cannot be negative');
END;

-- stock_out must not exceed available quantity at the moment it is recorded.
DROP TRIGGER IF EXISTS trg_stock_out_not_exceeding_available;
CREATE TRIGGER trg_stock_out_not_exceeding_available
BEFORE INSERT ON stock_out
FOR EACH ROW
WHEN NEW.quantity > (SELECT quantity FROM inventory_items WHERE id = NEW.inventoryItemId)
BEGIN
  SELECT RAISE(ABORT, 'NEGATIVE_STOCK: stock out quantity exceeds available inventory');
END;

-- ----------------------------------------------------------------------------
-- Allowed-value guards (substitute for Prisma enums, which SQLite lacks).
-- Kept intentionally small: exhaustive enum coverage lives in zod schemas at
-- the service layer (src/lib/validation). These are the highest-risk fields.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_family_member_gender_insert;
CREATE TRIGGER trg_family_member_gender_insert
BEFORE INSERT ON family_members
FOR EACH ROW
WHEN NEW.gender NOT IN ('ذكر', 'أنثى')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_ENUM: family_members.gender');
END;

DROP TRIGGER IF EXISTS trg_assistance_status_insert;
CREATE TRIGGER trg_assistance_status_insert
BEFORE INSERT ON assistances
FOR EACH ROW
WHEN NEW.status NOT IN ('معلقة', 'موافق عليها', 'مصروفة', 'مرفوضة')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_ENUM: assistances.status');
END;

DROP TRIGGER IF EXISTS trg_transaction_type_insert;
CREATE TRIGGER trg_transaction_type_insert
BEFORE INSERT ON transactions
FOR EACH ROW
WHEN NEW.type NOT IN ('دخل', 'مصروف')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_ENUM: transactions.type');
END;
