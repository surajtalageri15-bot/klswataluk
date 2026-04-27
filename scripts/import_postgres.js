const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { closeDb, initDb } = require("../db");

const ROOT = path.resolve(__dirname, "..");
const JSON_DB_PATH = path.join(ROOT, "data", "db.json");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Example: $env:DATABASE_URL='postgres://user:pass@host:5432/db'");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

function emptyToNull(value) {
  return value === "" || value == null ? null : value;
}

async function main() {
  await initDb();
  const db = JSON.parse(await fs.readFile(JSON_DB_PATH, "utf8"));
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("truncate table members");
    await client.query("delete from users where username <> 'admin'");
    await client.query("delete from app_meta");

    for (const [key, value] of Object.entries(db.meta || {})) {
      await client.query(
        "insert into app_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
        [key, String(value)]
      );
    }

    for (const user of db.users || []) {
      await client.query(
        `insert into users (id, username, password, name, role, district, taluk, active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()), coalesce($9::timestamptz, now()))
         on conflict (username) do update set
          password = excluded.password,
          name = excluded.name,
          role = excluded.role,
          district = excluded.district,
          taluk = excluded.taluk,
          active = excluded.active,
          updated_at = now()`,
        [
          user.id,
          user.username,
          user.password,
          user.name,
          user.role,
          emptyToNull(user.district),
          emptyToNull(user.taluk),
          user.active !== false,
          emptyToNull(user.createdAt)
        ]
      );
    }

    for (const member of db.members || []) {
      await client.query(
        `insert into members (
          id, source_row, district, name, ls_number, login_id, taluk, gender,
          date_of_birth, age, phone_number, qualification, batch_year, status, remarks,
          created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14, $15,
          coalesce($16::timestamptz, now()), coalesce($17::timestamptz, now())
        )`,
        [
          member.id,
          emptyToNull(member.sourceRow),
          member.district,
          member.name,
          member.lsNumber,
          emptyToNull(member.loginId),
          member.taluk,
          emptyToNull(member.gender),
          emptyToNull(member.dateOfBirth),
          emptyToNull(member.age),
          emptyToNull(member.phoneNumber),
          emptyToNull(member.qualification),
          emptyToNull(member.batchYear),
          member.status || "Active",
          emptyToNull(member.remarks),
          emptyToNull(member.createdAt),
          emptyToNull(member.updatedAt)
        ]
      );
    }

    await client.query("commit");
    console.log(`Imported ${(db.members || []).length} members and ${(db.users || []).length} users into PostgreSQL.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
