/**
 * SERVER-ONLY. Import only from electron/main.ts or scripts/*.ts — never
 * from src/app or src/components (Next.js renderer bundle).
 *
 * Applies pending Prisma migrations + constraint/trigger SQL to a SQLite
 * database file using better-sqlite3 (not the `sqlite3` CLI — the end user's
 * machine won't have it installed; better-sqlite3 ships as a native Node
 * module bundled with the app and exposes `.exec()` for multi-statement SQL).
 *
 * Shared by scripts/init-db.ts (dev) and electron/main.ts (packaged app), so
 * the exact same bootstrap logic runs in both environments.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function bootstrapDatabase(dbFilePath: string, projectRoot: string): void {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

  const db = new Database(dbFilePath);
  try {
    db.pragma('journal_mode = WAL');

    // Foreign keys stay OFF for the whole migration phase and are turned back
    // on (plus verified) once every pending migration has been applied.
    //
    // This is not optional. Prisma's SQLite migrations rewrite a changed table
    // by creating new_<table>, copying rows, DROP TABLE <table>, then renaming
    // — and with foreign keys enforced, that DROP performs an implicit
    // DELETE FROM which fires ON DELETE CASCADE on every child table. Dropping
    // `families` would take family_members/social_assessments/field_visits
    // with it. Prisma's own scripts guard against this with
    // `PRAGMA foreign_keys=OFF`, but that pragma is a silent no-op inside a
    // transaction, and each migration here runs in one — so the switch has to
    // be thrown out here, before any BEGIN.
    db.pragma('foreign_keys = OFF');

    db.exec(`CREATE TABLE IF NOT EXISTS _app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);

    const migrationsDir = path.join(projectRoot, 'prisma', 'migrations');
    const migrationFolders = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const applied = new Set(
      db.prepare('SELECT name FROM _app_migrations').all().map((r: any) => r.name),
    );

    const applyMigration = db.transaction((name: string, sql: string) => {
      db.exec(sql);
      db.prepare('INSERT INTO _app_migrations (name) VALUES (?)').run(name);
    });

    for (const folder of migrationFolders) {
      if (applied.has(folder)) continue;
      const sqlPath = path.join(migrationsDir, folder, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      applyMigration(folder, sql);
      console.log(`[db-bootstrap] applied migration: ${folder}`);
    }

    db.pragma('foreign_keys = ON');

    // Re-enabling foreign keys does not retroactively validate rows written
    // while they were off, so check explicitly. A table rewrite that lost a
    // parent row must surface here rather than as a mystery failure later.
    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `[db-bootstrap] ${violations.length} foreign key violation(s) after migration: ` +
          JSON.stringify(violations.slice(0, 5)),
      );
    }

    // Constraints/context + audit triggers are re-applied every startup:
    // every statement in both files is idempotent (IF NOT EXISTS / DROP+CREATE).
    const constraintsSql = fs.readFileSync(
      path.join(projectRoot, 'prisma', 'sqlite-sql', 'constraints-and-context.sql'),
      'utf-8',
    );
    db.exec(constraintsSql);

    const triggersSql = fs.readFileSync(
      path.join(projectRoot, 'prisma', 'sqlite-sql', 'audit-triggers.sql'),
      'utf-8',
    );
    db.exec(triggersSql);

    console.log(`[db-bootstrap] database ready at ${dbFilePath}`);
  } finally {
    db.close();
  }
}
