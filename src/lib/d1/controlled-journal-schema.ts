import { getD1 } from "./context";

export const CONTROLLED_JOURNAL_VERSION = "controlled_journal_v8";

const CONTROLLED_JOURNAL_SQL = `
CREATE TABLE IF NOT EXISTS controlled_journals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  journal_number TEXT NOT NULL,
  journal_date TEXT NOT NULL,
  journal_type TEXT NOT NULL CHECK (journal_type IN ('MANUAL','OPENING')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','POSTED','REJECTED','CANCELLED','REVERSED')),
  created_by TEXT NOT NULL,
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  rejected_by TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  posted_by TEXT,
  posted_at TEXT,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  reversed_by TEXT,
  reversed_at TEXT,
  reversal_reason TEXT,
  reversal_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, journal_number)
);
CREATE INDEX IF NOT EXISTS controlled_journals_org_status_idx
  ON controlled_journals (organization_id, status, journal_date DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS controlled_opening_posted_uq
  ON controlled_journals (organization_id)
  WHERE journal_type='OPENING' AND status='POSTED';

CREATE TABLE IF NOT EXISTS controlled_journal_lines (
  id TEXT PRIMARY KEY,
  controlled_journal_id TEXT NOT NULL REFERENCES controlled_journals(id) ON DELETE RESTRICT,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  account_id TEXT NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  debit_amount INTEGER NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount INTEGER NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)),
  UNIQUE (controlled_journal_id, line_no)
);
CREATE INDEX IF NOT EXISTS controlled_journal_lines_journal_idx
  ON controlled_journal_lines (controlled_journal_id, line_no);
`;

const LINE_INSERT_GUARD = `
CREATE TRIGGER IF NOT EXISTS controlled_journal_line_insert_guard
BEFORE INSERT ON controlled_journal_lines
WHEN COALESCE((SELECT status FROM controlled_journals WHERE id=NEW.controlled_journal_id),'MISSING') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_JOURNAL_NOT_DRAFT');
END;
`;

const LINE_UPDATE_GUARD = `
CREATE TRIGGER IF NOT EXISTS controlled_journal_line_update_guard
BEFORE UPDATE ON controlled_journal_lines
WHEN COALESCE((SELECT status FROM controlled_journals WHERE id=OLD.controlled_journal_id),'MISSING') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_JOURNAL_NOT_DRAFT');
END;
`;

const LINE_DELETE_GUARD = `
CREATE TRIGGER IF NOT EXISTS controlled_journal_line_delete_guard
BEFORE DELETE ON controlled_journal_lines
WHEN COALESCE((SELECT status FROM controlled_journals WHERE id=OLD.controlled_journal_id),'MISSING') <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_JOURNAL_NOT_DRAFT');
END;
`;

const SUBMIT_BALANCE_GUARD = `
CREATE TRIGGER IF NOT EXISTS controlled_journal_submit_balance_guard
BEFORE UPDATE OF status ON controlled_journals
WHEN NEW.status='SUBMITTED'
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM controlled_journal_lines WHERE controlled_journal_id=NEW.id
  ) < 2 THEN RAISE(ABORT, 'CONTROLLED_JOURNAL_MIN_LINES') END;
  SELECT CASE WHEN COALESCE((
    SELECT SUM(debit_amount) FROM controlled_journal_lines WHERE controlled_journal_id=NEW.id
  ),0) <= 0 THEN RAISE(ABORT, 'CONTROLLED_JOURNAL_ZERO') END;
  SELECT CASE WHEN COALESCE((
    SELECT SUM(debit_amount) FROM controlled_journal_lines WHERE controlled_journal_id=NEW.id
  ),0) <> COALESCE((
    SELECT SUM(credit_amount) FROM controlled_journal_lines WHERE controlled_journal_id=NEW.id
  ),0) THEN RAISE(ABORT, 'CONTROLLED_JOURNAL_UNBALANCED') END;
END;
`;

const APPROVAL_MAKER_CHECKER_GUARD = `
CREATE TRIGGER IF NOT EXISTS controlled_journal_maker_checker_guard
BEFORE UPDATE OF status ON controlled_journals
WHEN NEW.status='APPROVED'
 AND NEW.created_by=NEW.approved_by
BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_JOURNAL_MAKER_CHECKER');
END;
`;

const POST_GUARD = `
CREATE TRIGGER IF NOT EXISTS controlled_journal_post_guard
BEFORE UPDATE OF status ON controlled_journals
WHEN NEW.status='POSTED'
 AND (OLD.status <> 'APPROVED' OR NEW.journal_entry_id IS NULL OR NEW.posted_by IS NULL OR NEW.posted_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_JOURNAL_INVALID_POST');
END;
`;

const POSTED_IMMUTABLE_GUARD = `
CREATE TRIGGER IF NOT EXISTS controlled_journal_posted_immutable_guard
BEFORE UPDATE ON controlled_journals
WHEN OLD.status IN ('POSTED','REVERSED')
 AND (
   NEW.journal_number <> OLD.journal_number OR
   NEW.journal_date <> OLD.journal_date OR
   NEW.journal_type <> OLD.journal_type OR
   NEW.description <> OLD.description OR
   COALESCE(NEW.journal_entry_id,'') <> COALESCE(OLD.journal_entry_id,'') OR
   NEW.created_by <> OLD.created_by
 )
BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_JOURNAL_POSTED_IMMUTABLE');
END;
`;

function statements(sql: string) {
  return sql.split(";").map((item) => item.trim()).filter(Boolean);
}

export async function applyControlledJournalV8() {
  const db = getD1();
  const existing = await db
    .prepare("SELECT version FROM app_schema_versions WHERE version=? LIMIT 1")
    .bind(CONTROLLED_JOURNAL_VERSION)
    .first<{ version: string }>();
  if (existing?.version) return { alreadyApplied: true, statements: 0 };

  let completed = 0;
  const ddl = statements(CONTROLLED_JOURNAL_SQL);
  for (let index = 0; index < ddl.length; index += 1) {
    try {
      await db.exec(`${ddl[index]};`);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V8_STEP_${index + 1}: ${message} | SQL: ${ddl[index].replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }

  const triggers = [
    LINE_INSERT_GUARD,
    LINE_UPDATE_GUARD,
    LINE_DELETE_GUARD,
    SUBMIT_BALANCE_GUARD,
    APPROVAL_MAKER_CHECKER_GUARD,
    POST_GUARD,
    POSTED_IMMUTABLE_GUARD,
  ];
  for (let index = 0; index < triggers.length; index += 1) {
    try {
      await db.exec(triggers[index]);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1_UPGRADE_V8_STEP_${ddl.length + index + 1}: ${message} | SQL: CREATE controlled journal guard ${index + 1}`);
    }
  }

  await db
    .prepare("INSERT OR IGNORE INTO app_schema_versions (version, applied_at) VALUES (?, datetime('now'))")
    .bind(CONTROLLED_JOURNAL_VERSION)
    .run();
  completed += 1;
  return { alreadyApplied: false, statements: completed };
}
