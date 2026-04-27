const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { MASTER_TALUKS, canonicalDistrict, normalizedTaluk } = require("../taluks");

const ROOT = path.resolve(__dirname, "..");
const JSON_DB_PATH = path.join(ROOT, "data", "db.json");

function isMasterTaluk(district, taluk) {
  return (MASTER_TALUKS[district] || []).includes(taluk);
}

async function normalizeJson() {
  const db = JSON.parse(await fs.readFile(JSON_DB_PATH, "utf8"));
  let changed = 0;
  let unmatched = 0;

  for (const member of db.members || []) {
    const district = canonicalDistrict(member.district);
    const taluk = normalizedTaluk(district, member.taluk);
    if (isMasterTaluk(district, taluk)) {
      if (member.district !== district || member.taluk !== taluk) changed += 1;
      member.district = district;
      member.taluk = taluk;
    } else {
      unmatched += 1;
    }
  }

  for (const user of db.users || []) {
    const district = canonicalDistrict(user.district);
    const taluk = normalizedTaluk(district, user.taluk);
    if (district) user.district = district;
    if (isMasterTaluk(district, taluk)) user.taluk = taluk;
  }

  db.meta = db.meta || {};
  db.meta.updatedAt = new Date().toISOString();
  db.meta.talukMasterCount = Object.values(MASTER_TALUKS).flat().length;
  await fs.writeFile(JSON_DB_PATH, JSON.stringify(db, null, 2), "utf8");
  console.log(`Normalized local JSON taluks. Changed: ${changed}. Unmatched left as-is: ${unmatched}.`);
}

async function normalizePostgres() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  let changed = 0;
  let unmatched = 0;

  try {
    await client.query("begin");
    const members = await client.query("select id, district, taluk from members");
    for (const member of members.rows) {
      const district = canonicalDistrict(member.district);
      const taluk = normalizedTaluk(district, member.taluk);
      if (isMasterTaluk(district, taluk)) {
        if (member.district !== district || member.taluk !== taluk) {
          changed += 1;
          await client.query("update members set district = $2, taluk = $3, updated_at = now() where id = $1", [member.id, district, taluk]);
        }
      } else {
        unmatched += 1;
      }
    }

    const users = await client.query("select id, district, taluk from users");
    for (const user of users.rows) {
      const district = canonicalDistrict(user.district);
      const taluk = normalizedTaluk(district, user.taluk);
      if (district || isMasterTaluk(district, taluk)) {
        await client.query(
          "update users set district = $2, taluk = $3, updated_at = now() where id = $1",
          [user.id, district || user.district, isMasterTaluk(district, taluk) ? taluk : user.taluk]
        );
      }
    }

    await client.query(`
      insert into app_meta (key, value) values ('talukMasterCount', $1), ('updatedAt', $2)
      on conflict (key) do update set value = excluded.value
    `, [String(Object.values(MASTER_TALUKS).flat().length), new Date().toISOString()]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Normalized PostgreSQL taluks. Changed: ${changed}. Unmatched left as-is: ${unmatched}.`);
}

if (process.env.DATABASE_URL) {
  normalizePostgres().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  normalizeJson().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
