#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  QueryMind — Database Connection & Health-Check Script
//  Run:  node check-db.js
// ═══════════════════════════════════════════════════════════════
require("dotenv").config();
const mysql = require("mysql2/promise");

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function ok(msg) {
  console.log(`  ${GREEN}✅  ${msg}${RESET}`);
}
function warn(msg) {
  console.log(`  ${YELLOW}⚠️   ${msg}${RESET}`);
}
function fail(msg) {
  console.log(`  ${RED}❌  ${msg}${RESET}`);
}
function info(msg) {
  console.log(`  ${DIM}${msg}${RESET}`);
}

async function main() {
  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const dbName = process.env.DB_NAME || "querymind_demo";

  console.log("");
  console.log(
    `${CYAN}${BOLD}  ╔══════════════════════════════════════════════════╗${RESET}`
  );
  console.log(
    `${CYAN}${BOLD}  ║      QueryMind — Database Health Check           ║${RESET}`
  );
  console.log(
    `${CYAN}${BOLD}  ╚══════════════════════════════════════════════════╝${RESET}`
  );
  console.log("");
  info(`Target: ${user}@${host}:${port}`);
  info(`Database: ${dbName}`);
  console.log(
    `  ${DIM}──────────────────────────────────────────────────${RESET}`
  );

  // ── Step 1: Test raw TCP connection to MySQL ──────────────
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 5000,
    });
    ok(`Connected to MySQL server at ${host}:${port}`);
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      fail(`Connection REFUSED at ${host}:${port}`);
      console.log("");
      console.log(
        `  ${RED}   MySQL server is not running or not listening on port ${port}.${RESET}`
      );
      console.log(
        `  ${RED}   → Start MySQL Server, or check your DB_PORT in .env${RESET}`
      );
    } else if (
      err.code === "ER_ACCESS_DENIED_ERROR" ||
      err.message.includes("Access denied")
    ) {
      fail(`Access denied for user '${user}'@'${host}'`);
      console.log("");
      console.log(
        `  ${RED}   → Check DB_USER and DB_PASSWORD in .env${RESET}`
      );
      console.log(
        `  ${RED}   → Current password: ${password ? `"${password.slice(0, 2)}***"` : "(empty)"}${RESET}`
      );
    } else {
      fail(`MySQL connection error: ${err.message}`);
      console.log(`  ${RED}   Error code: ${err.code || "UNKNOWN"}${RESET}`);
    }
    console.log("");
    process.exit(1);
  }

  // ── Step 2: Check if database exists ──────────────────────
  try {
    const [rows] = await connection.query(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [dbName]
    );
    if (rows.length === 0) {
      warn(`Database '${dbName}' does NOT exist.`);
      console.log("");
      console.log(
        `  ${YELLOW}   → Open MySQL Workbench and run seed.sql to create the database.${RESET}`
      );
      console.log(
        `  ${YELLOW}   → Or run:  mysql -u root -p < seed.sql${RESET}`
      );
      console.log("");
      await connection.end();
      process.exit(1);
    }
    ok(`Database '${dbName}' exists`);
  } catch (err) {
    fail(`Could not query INFORMATION_SCHEMA: ${err.message}`);
    await connection.end();
    process.exit(1);
  }

  // ── Step 3: Switch to database and check transactions ─────
  try {
    await connection.query(`USE \`${dbName}\``);

    // Check if table exists
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'transactions'`,
      [dbName]
    );
    if (tables.length === 0) {
      warn(`Table 'transactions' does NOT exist in '${dbName}'.`);
      console.log("");
      console.log(
        `  ${YELLOW}   → Run seed.sql in MySQL Workbench to create and populate the table.${RESET}`
      );
      console.log("");
      await connection.end();
      process.exit(1);
    }
    ok(`Table 'transactions' exists`);

    // Count rows
    const [countResult] = await connection.query(
      `SELECT COUNT(*) AS cnt FROM transactions`
    );
    const rowCount = countResult[0].cnt;

    if (rowCount >= 10000) {
      ok(`Row count: ${Number(rowCount).toLocaleString()} rows (≥ 10,000 — ready for demo)`);
    } else if (rowCount > 0) {
      warn(`Row count: ${Number(rowCount).toLocaleString()} rows (< 10,000 — consider re-running seed.sql)`);
    } else {
      warn(`Table 'transactions' is EMPTY (0 rows).`);
      console.log("");
      console.log(
        `  ${YELLOW}   → Run seed.sql in MySQL Workbench to populate 20,000 rows.${RESET}`
      );
    }

    // Check indexes
    const [indexes] = await connection.query(
      `SHOW INDEX FROM transactions WHERE Key_name != 'PRIMARY'`
    );
    if (indexes.length === 0) {
      ok(`No secondary indexes on 'transactions' (Full Table Scan will trigger — perfect for demo)`);
    } else {
      info(
        `Found ${indexes.length} secondary index(es): ${indexes.map((i) => i.Key_name).join(", ")}`
      );
    }
  } catch (err) {
    fail(`Error checking transactions table: ${err.message}`);
    await connection.end();
    process.exit(1);
  }

  await connection.end();

  // ── Summary ───────────────────────────────────────────────
  console.log(
    `  ${DIM}──────────────────────────────────────────────────${RESET}`
  );
  console.log(
    `  ${GREEN}${BOLD}🚀 All checks passed! You can now start the backend:${RESET}`
  );
  console.log(`  ${CYAN}   cd backend && npm start${RESET}`);
  console.log("");
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
  process.exit(1);
});
