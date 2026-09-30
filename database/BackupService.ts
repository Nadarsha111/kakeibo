import DatabaseConnector from './DatabaseConnector';

/**
 * Every table holding the user's data, parents before children, so a restore can insert them in
 * this order and delete them in reverse without tripping a foreign key.
 */
const TABLES = [
  'profiles',
  'categories',
  'accounts',
  'credit_cards',
  'card_emis',
  'budgets',
  'recurring_items',
  'transactions',
  'statement_line_items',
  'app_settings',
] as const;

type TableName = (typeof TABLES)[number];
type Row = Record<string, unknown>;

export interface BackupSnapshot {
  app: 'kakeibo';
  /** Shape of this file. Bumped only if the file layout itself changes, not for new columns. */
  format: 1;
  /** The database's schema version (PRAGMA user_version) when the snapshot was taken. */
  schemaVersion: number;
  createdAt: string;
  tables: Partial<Record<TableName, Row[]>>;
}

/** Row counts worth showing before a restore, so the user can tell which backup this is. */
export interface BackupSummary {
  createdAt: string;
  profiles: number;
  accounts: number;
  transactions: number;
  recurringItems: number;
}

/**
 * A complete copy of the app's data, for backing up to Google Drive and restoring onto a new or
 * reset phone. Unlike the Google Sheet, which only carries transactions back, this includes every
 * table: accounts with their limits, bill days and loan terms, physical cards, card EMIs,
 * recurring items, budgets, categories, profiles and settings. Statement passwords stay in the
 * device's secure storage and are never included.
 */
class BackupService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
  }

  createSnapshot(): BackupSnapshot {
    const tables: BackupSnapshot['tables'] = {};
    TABLES.forEach((table) => {
      tables[table] = this.db.getAllSync(`SELECT * FROM ${table}`) as Row[];
    });
    return {
      app: 'kakeibo',
      format: 1,
      schemaVersion: this.schemaVersion(),
      createdAt: new Date().toISOString(),
      tables,
    };
  }

  /** Checks that parsed JSON is a backup this version of the app can restore, and summarises it. */
  validate(data: unknown): { snapshot: BackupSnapshot; summary: BackupSummary } {
    const snapshot = data as BackupSnapshot;
    if (!snapshot || snapshot.app !== 'kakeibo' || snapshot.format !== 1 || typeof snapshot.tables !== 'object' || !snapshot.tables) {
      throw new Error('This is not a Kakeibo backup file.');
    }
    if (snapshot.schemaVersion > this.schemaVersion()) {
      throw new Error('This backup was made by a newer version of the app. Update the app, then restore it.');
    }
    if (!Array.isArray(snapshot.tables.profiles) || snapshot.tables.profiles.length === 0) {
      throw new Error('This backup has no profiles in it, so there is nothing to restore.');
    }
    const count = (table: TableName) => (Array.isArray(snapshot.tables[table]) ? snapshot.tables[table]!.length : 0);
    return {
      snapshot,
      summary: {
        createdAt: snapshot.createdAt,
        profiles: count('profiles'),
        accounts: count('accounts'),
        transactions: count('transactions'),
        recurringItems: count('recurring_items'),
      },
    };
  }

  /**
   * Replaces everything in the app with the snapshot, all or nothing. Only columns the current
   * database has are restored, so a backup from an older version (missing newer columns) gets
   * their defaults, and anything the database no longer has is ignored.
   *
   * Foreign keys are switched off for the duration: a backup is a faithful copy of a database that
   * may already hold a dangling reference (e.g. a transaction on an account deleted long ago),
   * and one of those should not stop everything else being restored. SQLite ignores this pragma
   * inside a transaction, so it is set around it.
   */
  restoreSnapshot(snapshot: BackupSnapshot): void {
    const connector = DatabaseConnector.getInstance();
    this.db.execSync('PRAGMA foreign_keys = OFF;');
    try {
      connector.withTransaction(() => {
        [...TABLES].reverse().forEach((table) => this.db.runSync(`DELETE FROM ${table}`));

        TABLES.forEach((table) => {
          const rows = snapshot.tables[table];
          if (!Array.isArray(rows) || rows.length === 0) return;

          const existing = new Set(
            (this.db.getAllSync(`PRAGMA table_info(${table})`) as Array<{ name: string }>).map((c) => c.name),
          );
          rows.forEach((row) => {
            const columns = Object.keys(row).filter((column) => existing.has(column));
            if (columns.length === 0) return;
            const values = columns.map((column) => {
              const value = row[column];
              return value === undefined ? null : (value as string | number | null);
            });
            this.db.runSync(
              `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
              values,
            );
          });
        });
      });
    } finally {
      this.db.execSync('PRAGMA foreign_keys = ON;');
    }
  }

  private schemaVersion(): number {
    const row = this.db.getFirstSync('PRAGMA user_version') as { user_version: number } | null;
    return row?.user_version ?? 0;
  }
}

export default BackupService;
