import { applyPendingD1Migrations as applyThroughV10 } from "./schema-upgrades";
import { applyBackupRecoveryV11, BACKUP_RECOVERY_VERSION } from "./backup-recovery-schema";

export async function applyPendingD1MigrationsCurrent() {
  const base = await applyThroughV10();
  const backupRecovery = await applyBackupRecoveryV11();

  return {
    initialized: true,
    alreadyInitialized: base.alreadyInitialized && backupRecovery.alreadyApplied,
    statements: base.statements + backupRecovery.statements,
    currentVersion: BACKUP_RECOVERY_VERSION,
  };
}
