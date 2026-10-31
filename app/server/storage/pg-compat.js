// SQLite-compatible async wrapper for PostgreSQL
// Allows existing code using db.prepare(sql).get/.all/.run to work with both backends

class PgCompatWrapper {
  constructor(pool) {
    this.pool = pool;
    this._closed = false;
  }

  _convertSql(sql) {
    // Convert ? placeholders to $1, $2, etc.
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  _convertInsertOrReplace(sql) {
    // Convert INSERT OR REPLACE INTO table (cols) VALUES (?,?) to
    // INSERT INTO table (cols) VALUES ($1,$2) ON CONFLICT (pk) DO UPDATE SET ...
    // Only handles the specific patterns used in this codebase
    return sql;
  }

  prepare(sql) {
    const convertedSql = this._convertSql(sql);
    const pool = this.pool;
    const isInsertOrReplace = /INSERT\s+OR\s+REPLACE/i.test(sql);

    return {
      async get(...params) {
        try {
          const result = await pool.query(convertedSql, params);
          return result.rows[0] || null;
        } catch (e) {
          // Try converting INSERT OR REPLACE
          if (isInsertOrReplace) {
            throw e;
          }
          throw e;
        }
      },
      async all(...params) {
        const result = await pool.query(convertedSql, params);
        return result.rows;
      },
      async run(...params) {
        try {
          const result = await pool.query(convertedSql, params);
          return { changes: result.rowCount };
        } catch (e) {
          // Handle INSERT OR REPLACE by converting to ON CONFLICT
          if (isInsertOrReplace) {
            const fixedSql = convertedSql
              .replace(/INSERT\s+OR\s+REPLACE/i, 'INSERT')
              .replace(/VALUES\s*\(([^)]+)\)/i, (match, vals) => {
                return `VALUES (${vals})`;
              });
            // Add ON CONFLICT for the primary key
            const tableMatch = sql.match(/INTO\s+(\w+)\s*\(/i);
            const tableName = tableMatch ? tableMatch[1] : '';
            const pkMap = { users: 'id', excluded_users: 'id', ss_users: 'id', ss_excluded_users: 'id' };
            const pk = pkMap[tableName] || 'id';
            const finalSql = fixedSql + ` ON CONFLICT (${pk}) DO UPDATE SET ` +
              this._buildConflictUpdate(sql);
            const result2 = await pool.query(finalSql, params);
            return { changes: result2.rowCount };
          }
          throw e;
        }
      }
    };
  }

  _buildConflictUpdate(sql) {
    // Extract column names from INSERT statement and build SET clause
    const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) return 'id = EXCLUDED.id';
    const cols = colMatch[1].split(',').map(c => c.trim());
    // Skip the primary key column
    return cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ') || 'id = EXCLUDED.id';
  }

  pragma() {
    // No-op for PostgreSQL
  }

  exec(sql) {
    // For DDL statements — run async but don't await (fire and forget for init)
    const converted = this._convertSql(sql);
    this.pool.query(converted).catch(e => {
      console.error('PostgreSQL exec error:', e.message);
    });
  }

  async close() {
    if (!this._closed) {
      this._closed = true;
      await this.pool.end();
    }
  }
}

module.exports = PgCompatWrapper;
