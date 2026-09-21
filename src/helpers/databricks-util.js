'use strict';

class DatabricksUtil {
  constructor() {
    this.client = null;
    this.session = null;
  }

  async connect() {
    // @databricks/sql pulls in an ESM dependency with top-level await;
    // require() can't load that graph, so it must be dynamically imported.
    const { DBSQLClient } = await import('@databricks/sql');
    this.client = new DBSQLClient();
    const connection = await this.client.connect({
      host:  process.env.DATABRICKS_HOST,   // e.g. adb-xxxx.azuredatabricks.net
      path:  process.env.DATABRICKS_PATH,   // e.g. /sql/1.0/warehouses/xxxx
      token: process.env.DATABRICKS_TOKEN,
    });
    this.session = await connection.openSession();
  }

  async executeQuery(sql) {
    const operation = await this.session.executeStatement(sql, {
      runAsync: true,
      waitTimeout: 180000, // 3 minutes — handles SQL warehouse cold-start
    });
    const result = await operation.fetchAll();
    await operation.close();
    return result;
  }

  async close() {
    if (this.session) await this.session.close();
    if (this.client)  await this.client.close();
  }
}

module.exports = { DatabricksUtil };
