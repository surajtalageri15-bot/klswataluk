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
    maritalStatus: row.marital_status || "",
    kalyanaKarnataka: row.kalyana_karnataka || "",
    category: row.category || "",
    caste: row.caste || "",
    religion: row.religion || "",
    disability: row.disability || "",
    otherTaluks: row.other_taluks || "",
    address: row.address || "",
    declarationAccepted: row.declaration_accepted || false,
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
      marital_status text,
      kalyana_karnataka text,
      category text,
      caste text,
      religion text,
      disability text,
      other_taluks text,
      address text,
      declaration_accepted boolean not null default false,
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
    alter table members add column if not exists marital_status text;
    alter table members add column if not exists kalyana_karnataka text;
    alter table members add column if not exists category text;
    alter table members add column if not exists caste text;
    alter table members add column if not exists religion text;
    alter table members add column if not exists disability text;
    alter table members add column if not exists other_taluks text;
    alter table members add column if not exists address text;
    alter table members add column if not exists declaration_accepted boolean not null default false;
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

function dashboardCharts(members, user) {
  const gender = {};
  const ageGroups = {
    "Below 40": 0,
    "40-45": 0,
    "45-50": 0,
    "Above 50": 0,
    "Not specified": 0
  };
  const talukCounts = {};

  for (const raw of members) {
    const member = normalizeMemberLocation(raw);
    gender[member.gender || "Not specified"] = (gender[member.gender || "Not specified"] || 0) + 1;
    const age = Number(member.age);
    if (!Number.isFinite(age) || age <= 0) ageGroups["Not specified"] += 1;
    else if (age < 40) ageGroups["Below 40"] += 1;
    else if (age <= 45) ageGroups["40-45"] += 1;
    else if (age <= 50) ageGroups["45-50"] += 1;
    else ageGroups["Above 50"] += 1;
    talukCounts[member.taluk || "Not specified"] = (talukCounts[member.taluk || "Not specified"] || 0) + 1;
  }

  return {
    gender: Object.entries(gender).map(([label, value]) => ({ label, value })),
    ageGroups: Object.entries(ageGroups).map(([label, value]) => ({ label, value })),
    memberCountByTaluk: Object.entries(talukCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, user.role === "admin" ? 20 : 15)
      .map(([label, value]) => ({ label, value }))
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
    const charts = dashboardCharts(members, user);
    charts.pendingCorrections = await pendingCorrectionChart(user);
    return { summary, charts, meta, lists: masterLists(user) };
  }
  const db = await readJsonDb();
  const members = db.members.filter((member) => memberVisibleTo(user, member));
  const summary = summarize(members);
  summary.taluks = masterTalukCount(user);
  const charts = dashboardCharts(members, user);
  charts.pendingCorrections = await pendingCorrectionChart(user, db.members);
  return { summary, charts, meta: db.meta, lists: masterLists(user) };
}

async function pendingCorrectionChart(user, jsonMembers = null) {
  if (!["admin", "district"].includes(user.role)) return [];
  const rows = await exportTalukCorrections(user, {});
  const counts = {};
  for (const row of rows) {
    const district = canonicalDistrict(row.suggestedDistrict || row.rawDistrict);
    counts[district] = (counts[district] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, user.role === "admin" ? 20 : 10)
    .map(([label, value]) => ({ label, value }));
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

async function exportMembers(user, filters) {
  const rows = await listMembers(user, {
    search: filters.search || "",
    district: filters.district || "",
    taluk: filters.taluk || "",
    page: 1,
    size: Number.MAX_SAFE_INTEGER
  });
  return rows.rows;
}

async function updateMemberStatus(id, status, remarks = "") {
  const allowed = ["Pending verification", "Active", "Rejected", "Needs correction", "Inactive"];
  if (!allowed.includes(status)) {
    const error = new Error("Invalid member status");
    error.status = 400;
    throw error;
  }

  if (hasPostgres) {
    const result = await pool.query(
      `update members set status = $2, remarks = case when $3 = '' then remarks else $3 end, updated_at = now()
       where id = $1 returning *`,
      [id, status, remarks]
    );
    await touchMeta();
    return toMember(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  const member = db.members.find((item) => item.id === id);
  if (!member) return null;
  member.status = status;
  if (remarks) member.remarks = remarks;
  member.updatedAt = new Date().toISOString();
  await writeJsonDb(db);
  return member;
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

async function findDuplicateMember({ lsNumber = "", loginId = "", phoneNumber = "" }) {
  const normalizedLs = String(lsNumber || "").trim().toLowerCase();
  const normalizedLogin = String(loginId || "").trim().toLowerCase();
  const normalizedPhone = String(phoneNumber || "").trim();

  if (hasPostgres) {
    const result = await pool.query(
      `select * from members
       where ($1 <> '' and lower(ls_number) = $1)
          or ($2 <> '' and lower(coalesce(login_id, '')) = $2)
          or ($3 <> '' and coalesce(phone_number, '') = $3)
       limit 1`,
      [normalizedLs, normalizedLogin, normalizedPhone]
    );
    return toMember(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  return db.members.find((member) => {
    return (normalizedLs && String(member.lsNumber || "").trim().toLowerCase() === normalizedLs)
      || (normalizedLogin && String(member.loginId || "").trim().toLowerCase() === normalizedLogin)
      || (normalizedPhone && String(member.phoneNumber || "").trim() === normalizedPhone);
  }) || null;
}

function duplicateReason(existing, incoming) {
  if (!existing) return "";
  if (String(existing.lsNumber || "").trim().toLowerCase() === String(incoming.lsNumber || "").trim().toLowerCase()) {
    return "License number already exists";
  }
  if (String(existing.loginId || "").trim().toLowerCase() === String(incoming.loginId || "").trim().toLowerCase()) {
    return "Login ID already exists";
  }
  if (String(existing.phoneNumber || "").trim() === String(incoming.phoneNumber || "").trim()) {
    return "Mobile number already exists";
  }
  return "Member already exists";
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
        marital_status, kalyana_karnataka, category, caste, religion, disability,
        other_taluks, address, declaration_accepted, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, nullif($9, '')::date, nullif($10, '')::integer,
        $11, $12, nullif($13, '')::integer, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26
      ) returning *`,
      [
        member.id, member.sourceRow || null, member.district, member.name, member.lsNumber, member.loginId,
        member.taluk, member.gender, member.dateOfBirth || "", member.age === "" ? "" : member.age,
        member.phoneNumber, member.qualification, member.batchYear === "" ? "" : member.batchYear,
        member.status, member.remarks, member.maritalStatus || "", member.kalyanaKarnataka || "",
        member.category || "", member.caste || "", member.religion || "", member.disability || "",
        member.otherTaluks || "", member.address || "", Boolean(member.declarationAccepted),
        member.createdAt, member.updatedAt
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
        status = $13, remarks = $14, marital_status = $15, kalyana_karnataka = $16,
        category = $17, caste = $18, religion = $19, disability = $20, other_taluks = $21,
        address = $22, declaration_accepted = $23, updated_at = now()
      where id = $1 returning *`,
      [
        id, member.district, member.name, member.lsNumber, member.loginId, member.taluk,
        member.gender, member.dateOfBirth || "", member.age === "" ? "" : member.age,
        member.phoneNumber, member.qualification, member.batchYear === "" ? "" : member.batchYear,
        member.status, member.remarks, member.maritalStatus || "", member.kalyanaKarnataka || "",
        member.category || "", member.caste || "", member.religion || "", member.disability || "",
        member.otherTaluks || "", member.address || "", Boolean(member.declarationAccepted)
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

async function exportTalukCorrections(user, filters = {}) {
  if (user.role !== "admin" && user.role !== "district") return [];
  const district = user.role === "district" ? canonicalDistrict(user.district) : (filters.district || "");
  const result = await listTalukCorrections({
    page: 1,
    size: Number.MAX_SAFE_INTEGER,
    district,
    search: filters.search || ""
  });
  return result.rows;
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
  findDuplicateMember,
  duplicateReason,
  exportMembers,
  createMember,
  updateMember,
  updateMemberStatus,
  listTalukCorrections,
  exportTalukCorrections,
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
