-- AlterTable
ALTER TABLE "assistances" ADD COLUMN "operationNo" TEXT;
ALTER TABLE "assistances" ADD COLUMN "recordedById" TEXT;
ALTER TABLE "assistances" ADD COLUMN "source" TEXT;
ALTER TABLE "assistances" ADD COLUMN "unit" TEXT;

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "successful" BOOLEAN NOT NULL,
    "reason" TEXT,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "deviceId" TEXT,
    "sourceUser" TEXT,
    "schemaVersion" TEXT,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "storedFile" TEXT,
    "importedById" TEXT,
    "importedBy" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "targetAmountFils" INTEGER NOT NULL DEFAULT 0,
    "budgetFils" INTEGER NOT NULL DEFAULT 0,
    "targetFamiliesCount" INTEGER,
    "targetPersonsCount" INTEGER,
    "supporters" TEXT,
    "status" TEXT NOT NULL DEFAULT 'مفتوحة',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_campaigns" ("createdAt", "description", "endDate", "id", "name", "startDate", "status", "targetAmountFils", "updatedAt") SELECT "createdAt", "description", "endDate", "id", "name", "startDate", "status", "targetAmountFils", "updatedAt" FROM "campaigns";
DROP TABLE "campaigns";
ALTER TABLE "new_campaigns" RENAME TO "campaigns";
CREATE TABLE "new_donations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "donorId" TEXT NOT NULL,
    "campaignId" TEXT,
    "amountFils" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "donationType" TEXT NOT NULL DEFAULT 'نقدي',
    "inKindDescription" TEXT,
    "method" TEXT,
    "donatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "donations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_donations" ("amountFils", "createdAt", "donatedAt", "donationType", "donorId", "id", "method", "notes", "updatedAt") SELECT "amountFils", "createdAt", "donatedAt", "donationType", "donorId", "id", "method", "notes", "updatedAt" FROM "donations";
DROP TABLE "donations";
ALTER TABLE "new_donations" RENAME TO "donations";
CREATE INDEX "donations_donorId_idx" ON "donations"("donorId");
CREATE TABLE "new_families" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyCode" TEXT NOT NULL,
    "headOfFamilyName" TEXT NOT NULL,
    "wifeName" TEXT,
    "headNationalId" TEXT,
    "familyBookMembersCount" INTEGER,
    "address" TEXT,
    "city" TEXT,
    "regionId" TEXT,
    "neighborhood" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "maritalStatus" TEXT,
    "housingType" TEXT,
    "incomeSource" TEXT,
    "monthlyIncomeFils" INTEGER NOT NULL DEFAULT 0,
    "monthlyExpensesFils" INTEGER NOT NULL DEFAULT 0,
    "healthStatus" TEXT,
    "needLevel" TEXT,
    "economicLevel" TEXT,
    "fileStatus" TEXT NOT NULL DEFAULT 'نشط',
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsibleUserId" TEXT,
    "notes" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'يدوي',
    "legacyReference" TEXT,
    "legacySourceRefs" TEXT,
    "legacyOccurrences" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "families_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "families_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_families" ("address", "altPhone", "city", "createdAt", "economicLevel", "familyCode", "headNationalId", "headOfFamilyName", "housingType", "id", "isActive", "monthlyIncomeFils", "notes", "phone", "updatedAt") SELECT "address", "altPhone", "city", "createdAt", "economicLevel", "familyCode", "headNationalId", "headOfFamilyName", "housingType", "id", "isActive", "monthlyIncomeFils", "notes", "phone", "updatedAt" FROM "families";
DROP TABLE "families";
ALTER TABLE "new_families" RENAME TO "families";
CREATE UNIQUE INDEX "families_familyCode_key" ON "families"("familyCode");
CREATE UNIQUE INDEX "families_legacyReference_key" ON "families"("legacyReference");
CREATE INDEX "families_regionId_idx" ON "families"("regionId");
CREATE INDEX "families_headOfFamilyName_idx" ON "families"("headOfFamilyName");
CREATE INDEX "families_headNationalId_idx" ON "families"("headNationalId");
CREATE TABLE "new_family_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationalId" TEXT,
    "relationship" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "birthDate" DATETIME,
    "maritalStatus" TEXT,
    "educationLevel" TEXT,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "disabilityType" TEXT,
    "isOrphan" BOOLEAN NOT NULL DEFAULT false,
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "healthStatus" TEXT,
    "occupation" TEXT,
    "monthlyIncomeFils" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "family_members_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_family_members" ("birthDate", "createdAt", "familyId", "fullName", "gender", "healthStatus", "id", "isDisabled", "isStudent", "nationalId", "occupation", "relationship", "updatedAt") SELECT "birthDate", "createdAt", "familyId", "fullName", "gender", "healthStatus", "id", "isDisabled", "isStudent", "nationalId", "occupation", "relationship", "updatedAt" FROM "family_members";
DROP TABLE "family_members";
ALTER TABLE "new_family_members" RENAME TO "family_members";
CREATE INDEX "family_members_familyId_idx" ON "family_members"("familyId");
CREATE TABLE "new_field_visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "userId" TEXT,
    "visitDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT,
    "findings" TEXT,
    "recommendation" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'مكتملة',
    "nextVisitAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "field_visits_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "field_visits_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "field_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_field_visits" ("createdAt", "familyId", "findings", "id", "nextVisitAt", "purpose", "status", "updatedAt", "userId", "visitDate") SELECT "createdAt", "familyId", "findings", "id", "nextVisitAt", "purpose", "status", "updatedAt", "userId", "visitDate" FROM "field_visits";
DROP TABLE "field_visits";
ALTER TABLE "new_field_visits" RENAME TO "field_visits";
CREATE INDEX "field_visits_familyId_idx" ON "field_visits"("familyId");
CREATE TABLE "new_inventory_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitPriceFils" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "supplierId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_inventory_items" ("category", "createdAt", "id", "isActive", "minQuantity", "name", "quantity", "unit", "unitPriceFils", "updatedAt", "warehouseId") SELECT "category", "createdAt", "id", "isActive", "minQuantity", "name", "quantity", "unit", "unitPriceFils", "updatedAt", "warehouseId" FROM "inventory_items";
DROP TABLE "inventory_items";
ALTER TABLE "new_inventory_items" RENAME TO "inventory_items";
CREATE UNIQUE INDEX "inventory_items_code_key" ON "inventory_items"("code");
CREATE INDEX "inventory_items_warehouseId_idx" ON "inventory_items"("warehouseId");
CREATE TABLE "new_social_assessments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "researcherId" TEXT,
    "assessmentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monthlyIncomeFils" INTEGER NOT NULL DEFAULT 0,
    "monthlyExpensesFils" INTEGER NOT NULL DEFAULT 0,
    "economicLevel" TEXT,
    "housingCondition" TEXT,
    "housingOwnership" TEXT,
    "roomsCount" INTEGER,
    "healthCondition" TEXT,
    "chronicDiseases" TEXT,
    "disabilities" TEXT,
    "childrenCount" INTEGER,
    "orphansCount" INTEGER,
    "studentsCount" INTEGER,
    "unemployedCount" INTEGER,
    "financialObligations" TEXT,
    "basicNeeds" TEXT,
    "needLevel" TEXT,
    "educationLevel" TEXT,
    "recommendation" TEXT,
    "score" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "social_assessments_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "social_assessments_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_social_assessments" ("assessmentDate", "beneficiaryId", "createdAt", "economicLevel", "educationLevel", "familyId", "healthCondition", "housingCondition", "id", "notes", "recommendation", "researcherId", "score", "updatedAt") SELECT "assessmentDate", "beneficiaryId", "createdAt", "economicLevel", "educationLevel", "familyId", "healthCondition", "housingCondition", "id", "notes", "recommendation", "researcherId", "score", "updatedAt" FROM "social_assessments";
DROP TABLE "social_assessments";
ALTER TABLE "new_social_assessments" RENAME TO "social_assessments";
CREATE INDEX "social_assessments_familyId_idx" ON "social_assessments"("familyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "login_attempts_username_attemptedAt_idx" ON "login_attempts"("username", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_sourceKey_key" ON "import_batches"("sourceKey");

-- CreateIndex
CREATE INDEX "import_batches_kind_importedAt_idx" ON "import_batches"("kind", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "assistances_operationNo_key" ON "assistances"("operationNo");

