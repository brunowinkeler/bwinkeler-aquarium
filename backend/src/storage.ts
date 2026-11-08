/** Forward-only migrations; SQLite-backed Durable Objects do not allow PRAGMA user_version. */
export function migrate(sql: SqlStorage, migrations: readonly string[]): void {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS _sql_schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const applied = sql
    .exec<{ id: number }>('SELECT COALESCE(MAX(id), 0) AS id FROM _sql_schema_migrations')
    .one().id;
  migrations.forEach((statement, index) => {
    if (index < applied) return;
    sql.exec(statement);
    sql.exec(
      'INSERT INTO _sql_schema_migrations (id, applied_at) VALUES (?, ?)',
      index + 1,
      Date.now(),
    );
  });
}

export function tableExists(sql: SqlStorage, name: string): boolean {
  return (
    sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", name).toArray()
      .length > 0
  );
}

export async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = listing.objects.map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  return deleted;
}
