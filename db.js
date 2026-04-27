const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { MASTER_TALUKS, canonicalDistrict, isMasterTaluk, masterLists, masterTalukCount, normalizedTaluk } = require("./taluks");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const JSON_DB_PATH = path.join(DATA_DIR, "db.json");
const hasPostgres = Boolean(process.env.DATABASE_URL);

let pool = null;

if (hasPostgres) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });
}

function toCamel(row) {
  if (!row) return row;
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    name: row.name,
    role: row.role,
    district: row.district || "",
    taluk: row.taluk || "",
    active: row.active,
    sourceRow: row.source_row,
    lsNumber: row.ls_number,
    loginId: row.login_id,
    gender: row.gender || "",
    dateOfBirth: row.date_of_birth
      ? (row.date_of_birth instanceof Date ? row.date_of_birth.toISOString().slice(0, 10) : String(row.date_of_birth).slice(0, 10))
      : "",
    age: row.age ?? "",
    phoneNumber: row.phone_number || "",
    qualification: row.qualification || "",
    batchYear: row.batch_year ?? "",
    status: row.status || "Active",
    remarks: row.remarks || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toMember(row) {
  const item = toCamel(row);
  delete item.username;
  delete item.password;
  delete item.role;
  delete item.active;
  return item;
}

function normalizeMemberLocation(member) {
  const district = canonicalDistrict(member.district);
  return {
    ...member,
    district,
    taluk: normalizedTaluk(district, member.taluk)
  };
}

async function readJsonDb() {
  const raw = await fs.readFile(JSON_DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeJsonDb(db) {
  db.meta.updatedAt = new Date().toISOString();
  await fs.writeFile(JSON_DB_PATH, JSON.stringify(db, null, 2));
}

async function initDb() {
  if (!hasPostgres) return;

  await pool.query(`
    create table if not exists app_meta (
      key text primary key,
      value text not null
    );

    create table if not exists users (
      id text primary key,
      username text unique not null,
      password text not null,
      name text not null,
      role text not null check (role in ('admin', 'district', 'taluk')),
      district text,
      taluk text,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists members (
      id text primary key,
      source_row integer,
      district text not null,
      name text not null,
      ls_number text not null,
      login_id text,
      taluk text not null,
      gender text,
      date_of_birth date,
      age integer,
      phone_number text,
      qualification text,
      batch_year integer,
      status text not null default 'Active',
      remarks text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_members_district on members (district);
    create index if not exists idx_members_taluk on members (taluk);
    create index if not exists idx_members_ls_number on members (ls_number);
    create index if not exists idx_users_taluk on users (taluk);
  `);

  await pool.query(`
    alter table users drop constraint if exists users_role_check;
    alter table users add constraint users_role_check check (role in ('admin', 'district', 'taluk'));
  `);

  await pool.query(`
    insert into users (id, username, password, name, role, active)
    values ('admin', 'admin', 'admin', 'State Admin', 'admin', true)
    on conflict (username) do nothing
  `);
}

function visibleWhere(user, startIndex = 1) {
  if (user.role === "admin") return { clause: "true", values: [], next: startIndex };
  const values = [];
  let clause = "true";
  let next = startIndex;
  if (user.district) {
    values.push(user.district);
    clause += ` and district = $${next}`;
    next += 1;
  }
  return { clause, values, next };
}

function memberVisibleTo(user, member) {
  if (user.role === "admin") return true;
  const memberLocation = normalizeMemberLocation(member);
  const userDistrict = canonicalDistrict(user.district);
  if (user.role === "district") return Boolean(userDistrict) && memberLocation.district === userDistrict;
  const userTaluk = normalizedTaluk(userDistrict, user.taluk);
  return memberLocation.taluk === userTaluk && (!userDistrict || memberLocation.district === userDistrict);
}

function summarize(members) {
  const districts = new Set();
  const taluks = new Set();
  const gender = {};
  const districtCounts = {};
  const talukCounts = {};

  for (const member of members) {
    const normalized = normalizeMemberLocation(member);
    if (normalized.district) districts.add(normalized.district);
    if (normalized.taluk) taluks.add(normalized.taluk);
    gender[normalized.gender || "Not specified"] = (gender[normalized.gender || "Not specified"] || 0) + 1;
    districtCounts[normalized.district] = (districtCounts[normalized.district] || 0) + 1;
    talukCounts[normalized.taluk] = (talukCounts[normalized.taluk] || 0) + 1;
  }

  return {
    total: members.length,
    districts: districts.size,
    taluks: taluks.size,
    gender,
    topDistricts: Object.entries(districtCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    topTaluks: Object.entries(talukCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  };
}

async function getUserById(id) {
  if (hasPostgres) {
    const result = await pool.query("select * from users where id = $1 and active = true", [id]);
    return toCamel(result.rows[0]) || null;
  }
  const db = await readJsonDb();
  return db.users.find((item) => item.id === id && item.active) || null;
}

async function findUserByLogin(username, password) {
  if (hasPostgres) {
    const result = await pool.query(
      "select * from users where username = $1 and password = $2 and active = true",
      [username, password]
    );
    return toCamel(result.rows[0]) || null;
  }
  const db = await readJsonDb();
  return db.users.find((item) => item.username === username && item.password === password && item.active) || null;
}

async function getDashboard(user) {
  if (hasPostgres) {
    const visible = visibleWhere(user);
    const members = (await pool.query(`select * from members where ${visible.clause}`, visible.values)).rows
      .map(toMember)
      .filter((member) => memberVisibleTo(user, member));
    const metaRows = (await pool.query("select key, value from app_meta")).rows;
    const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));
    const summary = summarize(members);
    summary.taluks = masterTalukCount(user);
    return { summary, meta, lists: masterLists(user) };
  }
  const db = await readJsonDb();
  const members = db.members.filter((member) => memberVisibleTo(user, member));
  const summary = summarize(members);
  summary.taluks = masterTalukCount(user);
  return { summary, meta: db.meta, lists: masterLists(user) };
}

async function listMembers(user, filters) {
  if (hasPostgres) {
    const visible = visibleWhere(user);
    const rows = await pool.query(
      `select * from members where ${visible.clause} order by district, taluk, name`,
      visible.values
    );
    let visibleRows = rows.rows.map(toMember).map(normalizeMemberLocation).filter((member) => memberVisibleTo(user, member));
    visibleRows = filterMemberRows(visibleRows, filters);
    const total = visibleRows.length;
    const start = (filters.page - 1) * filters.size;
    return { rows: visibleRows.slice(start, start + filters.size), page: filters.page, size: filters.size, total };
  }

  const db = await readJsonDb();
  let rows = db.members.filter((member) => memberVisibleTo(user, member)).map(normalizeMemberLocation);
  rows = filterMemberRows(rows, filters);
  const total = rows.length;
  const start = (filters.page - 1) * filters.size;
  return { rows: rows.slice(start, start + filters.size), page: filters.page, size: filters.size, total };
}

function filterMemberRows(rows, filters) {
  let filtered = rows;
  if (filters.district) filtered = filtered.filter((member) => member.district === filters.district);
  if (filters.taluk) filtered = filtered.filter((member) => member.taluk === filters.taluk);
  if (filters.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter((member) => [member.name, member.lsNumber, member.loginId, member.phoneNumber, member.qualification]
      .some((value) => String(value || "").toLowerCase().includes(search)));
  }
  return filtered;
}

async function getMember(id) {
  if (hasPostgres) {
    const result = await pool.query("select * from members where id = $1", [id]);
    return toMember(result.rows[0]) || null;
  }
  const db = await readJsonDb();
  return db.members.find((item) => item.id === id) || null;
}

async function createMember(member) {
  member.id = crypto.randomUUID();
  member.createdAt = new Date().toISOString();
  member.updatedAt = member.createdAt;

  if (hasPostgres) {
    const result = await pool.query(
      `insert into members (
        id, source_row, district, name, ls_number, login_id, taluk, gender,
        date_of_birth, age, phone_number, qualification, batch_year, status, remarks,
        created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, nullif($9, '')::date, nullif($10, '')::integer,
        $11, $12, nullif($13, '')::integer, $14, $15, $16, $17
      ) returning *`,
      [
        member.id, member.sourceRow || null, member.district, member.name, member.lsNumber, member.loginId,
        member.taluk, member.gender, member.dateOfBirth || "", member.age === "" ? "" : member.age,
        member.phoneNumber, member.qualification, member.batchYear === "" ? "" : member.batchYear,
        member.status, member.remarks, member.createdAt, member.updatedAt
      ]
    );
    await touchMeta();
    return toMember(result.rows[0]);
  }

  const db = await readJsonDb();
  db.members.unshift(member);
  await writeJsonDb(db);
  return member;
}

async function updateMember(id, member) {
  if (hasPostgres) {
    const result = await pool.query(
      `update members set
        district = $2, name = $3, ls_number = $4, login_id = $5, taluk = $6,
        gender = $7, date_of_birth = nullif($8, '')::date, age = nullif($9, '')::integer,
        phone_number = $10, qualification = $11, batch_year = nullif($12, '')::integer,
        status = $13, remarks = $14, updated_at = now()
      where id = $1 returning *`,
      [
        id, member.district, member.name, member.lsNumber, member.loginId, member.taluk,
        member.gender, member.dateOfBirth || "", member.age === "" ? "" : member.age,
        member.phoneNumber, member.qualification, member.batchYear === "" ? "" : member.batchYear,
        member.status, member.remarks
      ]
    );
    await touchMeta();
    return toMember(result.rows[0]);
  }

  const db = await readJsonDb();
  const existing = db.members.find((item) => item.id === id);
  Object.assign(existing, member, { updatedAt: new Date().toISOString() });
  await writeJsonDb(db);
  return existing;
}

async function listTalukCorrections({ page = 1, size = 50, district = "", search = "" } = {}) {
  const rows = hasPostgres
    ? (await pool.query("select * from members order by district, taluk, name")).rows.map(toMember)
    : (await readJsonDb()).members;

  let unmatched = rows
    .map((member) => {
      const canonical = canonicalDistrict(member.district);
      const suggestion = normalizedTaluk(canonical, member.taluk);
      return {
        ...member,
        rawDistrict: member.district,
        rawTaluk: member.taluk,
        suggestedDistrict: canonical,
        suggestedTaluk: isMasterTaluk(canonical, suggestion) ? suggestion : ""
      };
    })
    .filter((member) => !isMasterTaluk(member.suggestedDistrict, member.rawTaluk));

  if (district) unmatched = unmatched.filter((member) => member.suggestedDistrict === district);
  if (search) {
    const needle = search.toLowerCase();
    unmatched = unmatched.filter((member) => [
      member.name, member.lsNumber, member.loginId, member.phoneNumber, member.rawDistrict, member.rawTaluk, member.qualification
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }

  const total = unmatched.length;
  const start = (page - 1) * size;
  return { rows: unmatched.slice(start, start + size), page, size, total };
}

async function correctMemberTaluk(id, district, taluk) {
  const canonical = canonicalDistrict(district);
  if (!isMasterTaluk(canonical, taluk)) {
    const error = new Error("Select a valid taluk from the 239 taluk master list");
    error.status = 400;
    throw error;
  }

  if (hasPostgres) {
    const result = await pool.query(
      "update members set district = $2, taluk = $3, updated_at = now() where id = $1 returning *",
      [id, canonical, taluk]
    );
    await touchMeta();
    return toMember(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  const member = db.members.find((item) => item.id === id);
  if (!member) return null;
  member.district = canonical;
  member.taluk = taluk;
  member.updatedAt = new Date().toISOString();
  await writeJsonDb(db);
  return member;
}

async function deleteMember(id) {
  if (hasPostgres) {
    const result = await pool.query("delete from members where id = $1", [id]);
    await touchMeta();
    return result.rowCount > 0;
  }
  const db = await readJsonDb();
  const before = db.members.length;
  db.members = db.members.filter((item) => item.id !== id);
  await writeJsonDb(db);
  return db.members.length < before;
}

async function listUsers(viewer = null) {
  if (hasPostgres) {
    if (viewer?.role === "district") {
      const result = await pool.query(
        "select * from users where role = 'taluk' and district = $1 order by taluk, username",
        [canonicalDistrict(viewer.district)]
      );
      return result.rows.map(toCamel);
    }
    const result = await pool.query("select * from users order by role, username");
    return result.rows.map(toCamel);
  }
  const db = await readJsonDb();
  if (viewer?.role === "district") {
    const district = canonicalDistrict(viewer.district);
    return db.users.filter((item) => item.role === "taluk" && canonicalDistrict(item.district) === district);
  }
  return db.users;
}

async function usernameExists(username) {
  if (hasPostgres) {
    const result = await pool.query("select 1 from users where username = $1", [username]);
    return result.rowCount > 0;
  }
  const db = await readJsonDb();
  return db.users.some((item) => item.username === username);
}

async function createUser(user) {
  user.id = crypto.randomUUID();
  user.createdAt = new Date().toISOString();

  if (hasPostgres) {
    const result = await pool.query(
      `insert into users (id, username, password, name, role, district, taluk, active, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning *`,
      [user.id, user.username, user.password, user.name, user.role, user.district, user.taluk, user.active, user.createdAt]
    );
    return toCamel(result.rows[0]);
  }

  const db = await readJsonDb();
  db.users.push(user);
  await writeJsonDb(db);
  return user;
}

async function upsertDistrictPresidentUsers(password) {
  const users = [];
  for (const district of Object.keys(MASTER_TALUKS)) {
    const username = `president_${district.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    const user = {
      id: crypto.randomUUID(),
      username,
      password,
      name: `${district} District President`,
      role: "district",
      district,
      taluk: "",
      active: true,
      createdAt: new Date().toISOString()
    };

    if (hasPostgres) {
      const result = await pool.query(
        `insert into users (id, username, password, name, role, district, taluk, active, created_at, updated_at)
         values ($1, $2, $3, $4, 'district', $5, '', true, $6, $6)
         on conflict (username) do update set
          password = excluded.password,
          name = excluded.name,
          role = 'district',
          district = excluded.district,
          taluk = '',
          active = true,
          updated_at = now()
         returning *`,
        [user.id, user.username, user.password, user.name, user.district, user.createdAt]
      );
      users.push(toCamel(result.rows[0]));
    } else {
      users.push(user);
    }
  }

  if (!hasPostgres) {
    const db = await readJsonDb();
    for (const user of users) {
      const existing = db.users.find((item) => item.username === user.username);
      if (existing) Object.assign(existing, user, { id: existing.id });
      else db.users.push(user);
    }
    await writeJsonDb(db);
  }

  return users;
}

async function updateUser(id, user) {
  if (hasPostgres) {
    const current = await getUserById(id);
    if (!current) return null;
    const password = user.password || current.password;
    const result = await pool.query(
      `update users set name = $2, password = $3, role = $4, district = $5, taluk = $6,
       active = $7, updated_at = now() where id = $1 returning *`,
      [id, user.name, password, user.role, user.district, user.taluk, user.active]
    );
    return toCamel(result.rows[0]);
  }

  const db = await readJsonDb();
  const target = db.users.find((item) => item.id === id);
  if (!target) return null;
  Object.assign(target, user);
  await writeJsonDb(db);
  return target;
}

async function deleteUser(id) {
  const target = hasPostgres
    ? toCamel((await pool.query("select * from users where id = $1", [id])).rows[0])
    : (await readJsonDb()).users.find((item) => item.id === id);

  if (!target) return false;
  if (target.username === "admin") {
    const error = new Error("Main admin login cannot be deleted");
    error.status = 400;
    throw error;
  }

  if (hasPostgres) {
    const result = await pool.query("delete from users where id = $1", [id]);
    return result.rowCount > 0;
  }

  const db = await readJsonDb();
  const before = db.users.length;
  db.users = db.users.filter((item) => item.id !== id);
  await writeJsonDb(db);
  return db.users.length < before;
}

function listsFromMembers(members) {
  return masterLists();
}

async function touchMeta() {
  if (!hasPostgres) return;
  await pool.query(`
    insert into app_meta (key, value) values ('updatedAt', $1)
    on conflict (key) do update set value = excluded.value
  `, [new Date().toISOString()]);
}

async function closeDb() {
  if (pool) await pool.end();
}

module.exports = {
  hasPostgres,
  initDb,
  closeDb,
  findUserByLogin,
  getUserById,
  getDashboard,
  listMembers,
  getMember,
  createMember,
  updateMember,
  listTalukCorrections,
  correctMemberTaluk,
  deleteMember,
  listUsers,
  usernameExists,
  createUser,
  upsertDistrictPresidentUsers,
  updateUser,
  deleteUser,
  memberVisibleTo
};
