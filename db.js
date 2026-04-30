const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const {
  MASTER_TALUKS,
  STATE_DIVISIONS,
  canonicalDistrict,
  canonicalDivision,
  divisionDistricts,
  isMasterTaluk,
  masterLists,
  masterTalukCount,
  normalizedTaluk
} = require("./taluks");

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
    memberPassword: row.member_password || "",
    memberLoginActive: row.member_login_active || false,
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
  if (!item) return item;
  delete item.username;
  delete item.password;
  delete item.memberPassword;
  delete item.role;
  delete item.active;
  return item;
}

function toTeamRequest(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number || "",
    district: row.district || "",
    taluk: row.taluk || "",
    requestedUsername: row.requested_username || "",
    requestedPassword: row.requested_password || "",
    status: row.status || "Pending",
    remarks: row.remarks || "",
    userId: row.user_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toAuditLog(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  return {
    id: row.id,
    memberId: row.member_id || "",
    memberName: row.member_name || "",
    action: row.action || "",
    field: row.field || "",
    oldValue: row.old_value || "",
    newValue: row.new_value || "",
    actorId: row.actor_id || "",
    actorName: row.actor_name || "",
    actorRole: row.actor_role || "",
    createdAt: row.created_at
  };
}

function toDataCorrectionRequest(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  return {
    id: row.id,
    memberId: row.member_id || "",
    memberName: row.member_name || "",
    requestedChanges: row.requested_changes || {},
    reason: row.reason || "",
    status: row.status || "Pending",
    adminRemarks: row.admin_remarks || "",
    requestedById: row.requested_by_id || "",
    requestedByName: row.requested_by_name || "",
    requestedByRole: row.requested_by_role || "",
    reviewedById: row.reviewed_by_id || "",
    reviewedByName: row.reviewed_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPresidentMessage(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  return {
    id: row.id,
    audience: row.audience || "all_members",
    subject: row.subject || "",
    body: row.body || "",
    active: row.active !== false,
    createdById: row.created_by_id || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toTeamChatMessage(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  return {
    id: row.id,
    body: row.body || "",
    authorId: row.author_id || "",
    authorName: row.author_name || "",
    authorRole: row.author_role || "",
    district: row.district || "",
    taluk: row.taluk || "",
    pinned: row.pinned || false,
    createdAt: row.created_at
  };
}

function toMemberNote(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  return {
    id: row.id,
    memberId: row.member_id || "",
    note: row.note || "",
    noteType: row.note_type || "General",
    createdById: row.created_by_id || "",
    createdByName: row.created_by_name || "",
    createdByRole: row.created_by_role || "",
    createdAt: row.created_at
  };
}

function toMemberProblem(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  return {
    id: row.id,
    memberId: row.member_id || "",
    memberName: row.member_name || "",
    lsNumber: row.ls_number || "",
    phoneNumber: row.phone_number || "",
    district: row.district || "",
    taluk: row.taluk || "",
    category: row.category || "General",
    subject: row.subject || "",
    description: row.description || "",
    status: row.status || "Submitted",
    response: row.response || "",
    reviewedById: row.reviewed_by_id || "",
    reviewedByName: row.reviewed_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toUserSession(row) {
  if (!row) return row;
  if (!hasPostgres) return row;
  const iso = (value) => value ? (value instanceof Date ? value.toISOString() : String(value)) : "";
  return {
    id: row.id,
    userId: row.user_id || "",
    username: row.username || "",
    name: row.name || "",
    role: row.role || "",
    district: row.district || "",
    taluk: row.taluk || "",
    startedAt: iso(row.started_at),
    lastSeenAt: iso(row.last_seen_at),
    endedAt: iso(row.ended_at),
    durationSeconds: Number(row.duration_seconds || 0),
    active: row.active !== false
  };
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
      role text not null check (role in ('admin', 'state_president', 'division', 'district', 'taluk')),
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
      member_password text,
      member_login_active boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists taluk_team_requests (
      id text primary key,
      name text not null,
      phone_number text not null,
      district text not null,
      taluk text not null,
      requested_username text not null,
      requested_password text not null,
      status text not null default 'Pending',
      remarks text,
      user_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists member_audit_logs (
      id text primary key,
      member_id text,
      member_name text,
      action text not null,
      field text not null,
      old_value text,
      new_value text,
      actor_id text,
      actor_name text,
      actor_role text,
      created_at timestamptz not null default now()
    );

    create table if not exists data_correction_requests (
      id text primary key,
      member_id text not null,
      member_name text not null,
      requested_changes jsonb not null,
      reason text,
      status text not null default 'Pending',
      admin_remarks text,
      requested_by_id text,
      requested_by_name text,
      requested_by_role text,
      reviewed_by_id text,
      reviewed_by_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists president_messages (
      id text primary key,
      audience text not null,
      subject text not null,
      body text not null,
      active boolean not null default true,
      created_by_id text,
      created_by_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists team_chat_messages (
      id text primary key,
      body text not null,
      author_id text,
      author_name text,
      author_role text,
      district text,
      taluk text,
      pinned boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists member_notes (
      id text primary key,
      member_id text not null,
      note text not null,
      note_type text not null default 'General',
      created_by_id text,
      created_by_name text,
      created_by_role text,
      created_at timestamptz not null default now()
    );

    create table if not exists member_problems (
      id text primary key,
      member_id text not null,
      member_name text not null,
      ls_number text,
      phone_number text,
      district text,
      taluk text,
      category text not null default 'General',
      subject text not null,
      description text not null,
      status text not null default 'Submitted',
      response text,
      reviewed_by_id text,
      reviewed_by_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists user_sessions (
      id text primary key,
      user_id text not null,
      username text,
      name text,
      role text,
      district text,
      taluk text,
      started_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      ended_at timestamptz,
      duration_seconds integer not null default 0,
      active boolean not null default true
    );

    create index if not exists idx_members_district on members (district);
    create index if not exists idx_members_taluk on members (taluk);
    create index if not exists idx_members_ls_number on members (ls_number);
    create index if not exists idx_users_taluk on users (taluk);
    create index if not exists idx_taluk_team_requests_status on taluk_team_requests (status);
    create index if not exists idx_member_audit_logs_member on member_audit_logs (member_id);
    create index if not exists idx_member_audit_logs_created on member_audit_logs (created_at desc);
    create index if not exists idx_data_correction_requests_status on data_correction_requests (status);
    create index if not exists idx_data_correction_requests_member on data_correction_requests (member_id);
    create index if not exists idx_president_messages_active on president_messages (active, created_at desc);
    create index if not exists idx_team_chat_messages_scope on team_chat_messages (district, taluk, created_at desc);
    create index if not exists idx_member_notes_member on member_notes (member_id, created_at desc);
    create index if not exists idx_member_problems_scope on member_problems (district, taluk, status, created_at desc);
    create index if not exists idx_member_problems_member on member_problems (member_id, created_at desc);
    create index if not exists idx_user_sessions_user on user_sessions (user_id, started_at desc);
    create index if not exists idx_user_sessions_role on user_sessions (role, district, taluk, started_at desc);
  `);

  await pool.query(`
    alter table users drop constraint if exists users_role_check;
    alter table users add constraint users_role_check check (role in ('admin', 'state_president', 'division', 'district', 'taluk'));
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
    alter table members add column if not exists member_password text;
    alter table members add column if not exists member_login_active boolean not null default false;
    alter table team_chat_messages add column if not exists pinned boolean not null default false;
  `);

  await pool.query(`
    insert into users (id, username, password, name, role, active)
    values ('admin', 'admin', 'admin', 'State Admin', 'admin', true)
    on conflict (username) do nothing
  `);
}

function visibleWhere(user, startIndex = 1) {
  if (["admin", "state_president"].includes(user.role)) return { clause: "true", values: [], next: startIndex };
  if (user.role === "division") {
    const values = divisionDistricts(user.district);
    if (!values.length) return { clause: "false", values: [], next: startIndex };
    const placeholders = values.map((_, index) => `$${startIndex + index}`).join(", ");
    return { clause: `district in (${placeholders})`, values, next: startIndex + values.length };
  }
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
  if (["admin", "state_president"].includes(user.role)) return true;
  const memberLocation = normalizeMemberLocation(member);
  if (user.role === "division") return divisionDistricts(user.district).includes(memberLocation.district);
  const userDistrict = canonicalDistrict(user.district);
  if (user.role === "district") return Boolean(userDistrict) && memberLocation.district === userDistrict;
  const userTaluk = normalizedTaluk(userDistrict, user.taluk);
  return memberLocation.taluk === userTaluk && (!userDistrict || memberLocation.district === userDistrict);
}

function userSessionVisibleTo(user, session) {
  if (["admin", "state_president"].includes(user.role)) return true;
  const sessionDistrict = canonicalDistrict(session.district || "");
  if (user.role === "division") return divisionDistricts(user.district).includes(sessionDistrict);
  if (user.role === "district") return canonicalDistrict(user.district || "") === sessionDistrict;
  return user.id === session.userId;
}

function summarize(members) {
  const districts = new Set();
  const taluks = new Set();
  const gender = {};
  const statusCounts = {};
  const districtCounts = {};
  const talukCounts = {};

  for (const member of members) {
    const normalized = normalizeMemberLocation(member);
    if (normalized.district) districts.add(normalized.district);
    if (normalized.taluk) taluks.add(normalized.taluk);
    gender[normalized.gender || "Not specified"] = (gender[normalized.gender || "Not specified"] || 0) + 1;
    statusCounts[normalized.status || "Active"] = (statusCounts[normalized.status || "Active"] || 0) + 1;
    districtCounts[normalized.district] = (districtCounts[normalized.district] || 0) + 1;
    talukCounts[normalized.taluk] = (talukCounts[normalized.taluk] || 0) + 1;
  }

  return {
    total: members.length,
    districts: districts.size,
    taluks: taluks.size,
    gender,
    statusCounts,
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
      .slice(0, ["admin", "state_president"].includes(user.role) ? 20 : 15)
      .map(([label, value]) => ({ label, value }))
  };
}

async function visibleUsersForPerformance(user) {
  if (hasPostgres) return listUsers(user);
  const db = await readJsonDb();
  if (["admin", "state_president"].includes(user.role)) return db.users;
  if (user.role === "division") {
    const districts = divisionDistricts(user.district);
    return db.users.filter((item) => ["district", "taluk"].includes(item.role) && districts.includes(canonicalDistrict(item.district)));
  }
  if (user.role === "district") {
    const district = canonicalDistrict(user.district);
    return db.users.filter((item) => item.role === "taluk" && canonicalDistrict(item.district) === district);
  }
  return [];
}

async function districtPerformance(user, members) {
  if (!["admin", "state_president", "division"].includes(user.role)) return { districts: [], missingTalukLogins: [] };
  const lists = masterLists(user);
  const users = await visibleUsersForPerformance(user);
  const activeTalukUsers = new Set(users
    .filter((item) => item.role === "taluk" && item.active)
    .map((item) => `${canonicalDistrict(item.district)}::${normalizedTaluk(canonicalDistrict(item.district), item.taluk)}`));
  const districtPresidentUsers = new Set(users
    .filter((item) => item.role === "district" && item.active)
    .map((item) => canonicalDistrict(item.district)));
  const byDistrict = Object.fromEntries(lists.districts.map((district) => [district, {
    district,
    members: 0,
    active: 0,
    pending: 0,
    rejected: 0,
    needsCorrection: 0,
    taluks: (lists.taluksByDistrict[district] || []).length,
    talukLogins: 0,
    missingTalukLogins: 0,
    districtPresident: districtPresidentUsers.has(district)
  }]));

  for (const raw of members) {
    const member = normalizeMemberLocation(raw);
    const row = byDistrict[member.district];
    if (!row) continue;
    row.members += 1;
    if (member.status === "Active") row.active += 1;
    else if (member.status === "Pending verification") row.pending += 1;
    else if (member.status === "Rejected") row.rejected += 1;
    else if (member.status === "Needs correction") row.needsCorrection += 1;
  }

  const missingTalukLogins = [];
  for (const [district, taluks] of Object.entries(lists.taluksByDistrict)) {
    const row = byDistrict[district];
    for (const taluk of taluks) {
      if (activeTalukUsers.has(`${district}::${taluk}`)) {
        row.talukLogins += 1;
      } else {
        row.missingTalukLogins += 1;
        missingTalukLogins.push({ district, taluk });
      }
    }
  }

  return {
    districts: Object.values(byDistrict).sort((a, b) => b.pending - a.pending || b.members - a.members || a.district.localeCompare(b.district)),
    missingTalukLogins
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
    return { summary, charts, meta, lists: masterLists(user), performance: await districtPerformance(user, members) };
  }
  const db = await readJsonDb();
  const members = db.members.filter((member) => memberVisibleTo(user, member));
  const summary = summarize(members);
  summary.taluks = masterTalukCount(user);
  const charts = dashboardCharts(members, user);
  charts.pendingCorrections = await pendingCorrectionChart(user, db.members);
  return { summary, charts, meta: db.meta, lists: masterLists(user), performance: await districtPerformance(user, members) };
}

async function updateAppSetting(key, value) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    const error = new Error("Setting key is required");
    error.status = 400;
    throw error;
  }
  const safeValue = String(value || "").trim();
  if (hasPostgres) {
    await pool.query(`
      insert into app_meta (key, value) values ($1, $2)
      on conflict (key) do update set value = excluded.value
    `, [safeKey, safeValue]);
    return { key: safeKey, value: safeValue };
  }
  const db = await readJsonDb();
  db.meta ||= {};
  db.meta[safeKey] = safeValue;
  await writeJsonDb(db);
  return { key: safeKey, value: safeValue };
}

async function getPublicSummary() {
  let members = [];
  let updatedAt = new Date().toISOString();
  if (hasPostgres) {
    members = (await pool.query("select * from members")).rows.map(toMember);
    const metaRows = (await pool.query("select key, value from app_meta")).rows;
    const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));
    updatedAt = meta.updatedAt || updatedAt;
  } else {
    const db = await readJsonDb();
    members = db.members || [];
    updatedAt = db.meta?.updatedAt || updatedAt;
  }
  const summary = summarize(members);
  return {
    total: summary.total,
    districts: summary.districts,
    taluks: summary.taluks,
    masterTaluks: masterTalukCount({ role: "admin" }),
    pending: summary.statusCounts["Pending verification"] || 0,
    active: summary.statusCounts.Active || 0,
    needsCorrection: summary.statusCounts["Needs correction"] || 0,
    updatedAt
  };
}

async function pendingCorrectionChart(user, jsonMembers = null) {
  if (!["admin", "state_president", "division", "district"].includes(user.role)) return [];
  const rows = await exportTalukCorrections(user, {});
  const counts = {};
  for (const row of rows) {
    const district = canonicalDistrict(row.suggestedDistrict || row.rawDistrict);
    counts[district] = (counts[district] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, ["admin", "state_president"].includes(user.role) ? 20 : 10)
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
    status: filters.status || "",
    gender: filters.gender || "",
    batchYear: filters.batchYear || "",
    missingOnly: filters.missingOnly === true || filters.missingOnly === "true",
    page: 1,
    size: Number.MAX_SAFE_INTEGER
  });
  return rows.rows;
}

const missingFieldLabels = {
  phoneNumber: "Phone",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  maritalStatus: "Marital status",
  kalyanaKarnataka: "Kalyana Karnataka",
  category: "Category",
  caste: "Caste",
  religion: "Religion",
  disability: "Disability",
  loginId: "Login ID",
  batchYear: "Batch year",
  qualification: "Education",
  address: "Address"
};

function missingMemberFields(member) {
  return Object.entries(missingFieldLabels)
    .filter(([key]) => !String(member[key] ?? "").trim())
    .map(([, label]) => label);
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
  if (filters.status) filtered = filtered.filter((member) => member.status === filters.status);
  if (filters.gender) filtered = filtered.filter((member) => member.gender === filters.gender);
  if (filters.batchYear) filtered = filtered.filter((member) => String(member.batchYear || "") === String(filters.batchYear));
  if (filters.missingOnly) filtered = filtered.filter((member) => missingMemberFields(member).length > 0);
  if (filters.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter((member) => [
      member.name, member.lsNumber, member.loginId, member.phoneNumber, member.qualification,
      member.district, member.taluk, member.category, member.caste, member.address, member.batchYear, member.status
    ]
      .some((value) => String(value || "").toLowerCase().includes(search)));
  }
  return filtered;
}

function duplicateKey(value, type) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (type === "phoneNumber") return text.replace(/\D/g, "");
  return text.toLowerCase().replace(/\s+/g, " ");
}

async function listMissingDataMembers(user, filters = {}) {
  const rows = await listMembers(user, {
    search: filters.search || "",
    district: filters.district || "",
    taluk: filters.taluk || "",
    missingOnly: true,
    page: 1,
    size: Math.min(500, Math.max(25, Number(filters.limit || 200)))
  });
  return {
    rows: rows.rows.map((member) => ({
      id: member.id,
      name: member.name,
      lsNumber: member.lsNumber,
      loginId: member.loginId,
      district: member.district,
      taluk: member.taluk,
      phoneNumber: member.phoneNumber,
      status: member.status,
      dateOfBirth: member.dateOfBirth,
      age: member.age,
      gender: member.gender,
      maritalStatus: member.maritalStatus,
      kalyanaKarnataka: member.kalyanaKarnataka,
      category: member.category,
      caste: member.caste,
      religion: member.religion,
      disability: member.disability,
      qualification: member.qualification,
      batchYear: member.batchYear,
      otherTaluks: member.otherTaluks,
      address: member.address,
      missingFields: missingMemberFields(member)
    })),
    total: rows.total
  };
}

function duplicateLabel(type) {
  return {
    phoneNumber: "Phone Number",
    lsNumber: "LS Number",
    loginId: "Login ID",
    name: "Same Name"
  }[type] || type;
}

function buildDuplicateGroups(rows) {
  const normalizedRows = rows.map(normalizeMemberLocation);
  const checks = ["phoneNumber", "lsNumber", "loginId", "name"];
  const groups = [];

  for (const field of checks) {
    const grouped = new Map();
    for (const member of normalizedRows) {
      const key = duplicateKey(member[field], field);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(member);
    }

    for (const [key, members] of grouped.entries()) {
      if (members.length < 2) continue;
      groups.push({
        id: `${field}:${key}`,
        type: field,
        label: duplicateLabel(field),
        value: members[0][field],
        count: members.length,
        members: members
          .sort((a, b) => String(a.district || "").localeCompare(String(b.district || "")) || String(a.taluk || "").localeCompare(String(b.taluk || "")) || String(a.name || "").localeCompare(String(b.name || "")))
          .map((member) => ({
            id: member.id,
            name: member.name,
            lsNumber: member.lsNumber,
            loginId: member.loginId,
            district: member.district,
            taluk: member.taluk,
            phoneNumber: member.phoneNumber,
            status: member.status
          }))
      });
    }
  }

  return groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label) || String(a.value || "").localeCompare(String(b.value || "")));
}

async function listDuplicateGroups(filters = {}) {
  const type = String(filters.type || "").trim();
  const search = String(filters.search || "").trim().toLowerCase();
  const limit = Math.min(500, Math.max(25, Number(filters.limit || 200)));
  const rows = hasPostgres
    ? (await pool.query("select * from members order by district, taluk, name")).rows.map(toMember)
    : (await readJsonDb()).members;

  let groups = buildDuplicateGroups(rows);
  if (type) groups = groups.filter((group) => group.type === type);
  if (search) {
    groups = groups.filter((group) => {
      const groupText = [group.label, group.value, group.type].join(" ").toLowerCase();
      if (groupText.includes(search)) return true;
      return group.members.some((member) => [
        member.name, member.lsNumber, member.loginId, member.district, member.taluk, member.phoneNumber, member.status
      ].some((value) => String(value || "").toLowerCase().includes(search)));
    });
  }
  return {
    summary: {
      totalGroups: groups.length,
      phoneNumber: groups.filter((group) => group.type === "phoneNumber").length,
      lsNumber: groups.filter((group) => group.type === "lsNumber").length,
      loginId: groups.filter((group) => group.type === "loginId").length,
      name: groups.filter((group) => group.type === "name").length
    },
    groups: groups.slice(0, limit)
  };
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

async function findPublicMemberStatus({ query = "" }) {
  const raw = String(query || "").trim();
  if (!raw) return null;
  const phone = raw.replace(/\D/g, "");
  const ls = raw.toLowerCase();

  let member = null;
  if (hasPostgres) {
    const result = await pool.query(
      `select * from members
       where ($1 <> '' and regexp_replace(coalesce(phone_number, ''), '\\D', '', 'g') = $1)
          or ($2 <> '' and lower(ls_number) = $2)
       order by updated_at desc
       limit 1`,
      [phone.length >= 10 ? phone : "", ls]
    );
    member = toMember(result.rows[0]) || null;
  } else {
    const db = await readJsonDb();
    member = db.members.find((item) => {
      const itemPhone = String(item.phoneNumber || "").replace(/\D/g, "");
      const itemLs = String(item.lsNumber || "").trim().toLowerCase();
      return (phone.length >= 10 && itemPhone === phone) || (ls && itemLs === ls);
    }) || null;
  }

  if (!member) return null;
  const normalized = normalizeMemberLocation(member);
  return {
    name: normalized.name,
    lsNumber: normalized.lsNumber,
    district: normalized.district,
    taluk: normalized.taluk,
    status: normalized.status,
    remarks: normalized.remarks,
    updatedAt: normalized.updatedAt
  };
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function sameDate(left, right) {
  const a = String(left || "").slice(0, 10);
  const b = String(right || "").slice(0, 10);
  return a && b && a === b;
}

async function findMemberForActivation({ phoneNumber = "", lsNumber = "", dateOfBirth = "" }) {
  const phone = normalizePhone(phoneNumber);
  const ls = String(lsNumber || "").trim().toLowerCase();
  if (!phone || !ls) return null;

  let member = null;
  if (hasPostgres) {
    const result = await pool.query(
      `select * from members
       where regexp_replace(coalesce(phone_number, ''), '\\D', '', 'g') = $1
         and lower(ls_number) = $2
       order by updated_at desc
       limit 1`,
      [phone, ls]
    );
    member = toCamel(result.rows[0]) || null;
  } else {
    const db = await readJsonDb();
    member = db.members.find((item) => normalizePhone(item.phoneNumber) === phone
      && String(item.lsNumber || "").trim().toLowerCase() === ls) || null;
  }

  if (!member) return null;
  if (member.dateOfBirth && !sameDate(member.dateOfBirth, dateOfBirth)) return null;
  return member;
}

async function activateMemberLogin(id, password) {
  if (hasPostgres) {
    const result = await pool.query(
      `update members
       set member_password = $2, member_login_active = true, updated_at = now()
       where id = $1 returning *`,
      [id, password]
    );
    return toMember(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  const member = db.members.find((item) => item.id === id);
  if (!member) return null;
  member.memberPassword = password;
  member.memberLoginActive = true;
  member.updatedAt = new Date().toISOString();
  await writeJsonDb(db);
  const { memberPassword, ...safe } = member;
  return safe;
}

async function verifyMemberPassword(id, password) {
  const pass = String(password || "");
  if (!id || !pass) return false;
  if (hasPostgres) {
    const result = await pool.query(
      "select 1 from members where id = $1 and member_password = $2 and member_login_active = true",
      [id, pass]
    );
    return result.rowCount > 0;
  }
  const db = await readJsonDb();
  return db.members.some((item) => item.id === id && item.memberPassword === pass && item.memberLoginActive === true);
}

async function updateMemberPassword(id, password) {
  if (hasPostgres) {
    const result = await pool.query(
      `update members
       set member_password = $2, member_login_active = true, updated_at = now()
       where id = $1 returning *`,
      [id, password]
    );
    return toMember(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  const member = db.members.find((item) => item.id === id);
  if (!member) return null;
  member.memberPassword = password;
  member.memberLoginActive = true;
  member.updatedAt = new Date().toISOString();
  await writeJsonDb(db);
  const { memberPassword, ...safe } = member;
  return safe;
}

async function updateMemberLoginControl(id, { active, password = "" }) {
  if (hasPostgres) {
    const result = await pool.query(
      `update members
       set member_login_active = $2,
           member_password = case when $3 = '' then member_password else $3 end,
           updated_at = now()
       where id = $1 returning *`,
      [id, Boolean(active), String(password || "")]
    );
    return toMember(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  const member = db.members.find((item) => item.id === id);
  if (!member) return null;
  member.memberLoginActive = Boolean(active);
  if (password) member.memberPassword = password;
  member.updatedAt = new Date().toISOString();
  await writeJsonDb(db);
  const { memberPassword, ...safe } = member;
  return safe;
}

async function findMemberByLogin(identifier, password) {
  const raw = String(identifier || "").trim();
  const pass = String(password || "");
  const phone = normalizePhone(raw);
  const text = raw.toLowerCase();
  if (!raw || !pass) return null;

  if (hasPostgres) {
    const result = await pool.query(
      `select * from members
       where member_login_active = true
         and member_password = $1
         and (
           ($2 <> '' and regexp_replace(coalesce(phone_number, ''), '\\D', '', 'g') = $2)
           or lower(ls_number) = $3
           or lower(coalesce(login_id, '')) = $3
         )
       order by updated_at desc
       limit 1`,
      [pass, phone.length >= 10 ? phone : "", text]
    );
    return toMember(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  const member = db.members.find((item) => item.memberLoginActive === true
    && item.memberPassword === pass
    && ((phone.length >= 10 && normalizePhone(item.phoneNumber) === phone)
      || String(item.lsNumber || "").trim().toLowerCase() === text
      || String(item.loginId || "").trim().toLowerCase() === text)) || null;
  if (!member) return null;
  const { memberPassword, ...safe } = member;
  return safe;
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

async function listTalukCorrections({ page = 1, size = 50, district = "", search = "", user = null } = {}) {
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
  if (user?.role === "division") {
    const districts = divisionDistricts(user.district);
    unmatched = unmatched.filter((member) => districts.includes(canonicalDistrict(member.suggestedDistrict || member.rawDistrict)));
  }
  if (user?.role === "district") {
    const userDistrict = canonicalDistrict(user.district);
    unmatched = unmatched.filter((member) => canonicalDistrict(member.suggestedDistrict || member.rawDistrict) === userDistrict);
  }
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
  if (!["admin", "state_president", "division", "district"].includes(user.role)) return [];
  const district = user.role === "district" ? canonicalDistrict(user.district) : (filters.district || "");
  const result = await listTalukCorrections({
    page: 1,
    size: Number.MAX_SAFE_INTEGER,
    district,
    search: filters.search || "",
    user
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

async function createAuditLogs(logs) {
  const entries = (Array.isArray(logs) ? logs : [])
    .filter((log) => log && log.field)
    .map((log) => ({
      id: crypto.randomUUID(),
      memberId: String(log.memberId || ""),
      memberName: String(log.memberName || ""),
      action: String(log.action || "Updated"),
      field: String(log.field || ""),
      oldValue: String(log.oldValue ?? ""),
      newValue: String(log.newValue ?? ""),
      actorId: String(log.actorId || ""),
      actorName: String(log.actorName || ""),
      actorRole: String(log.actorRole || ""),
      createdAt: new Date().toISOString()
    }));
  if (!entries.length) return [];

  if (hasPostgres) {
    const values = [];
    const placeholders = entries.map((entry, index) => {
      const offset = index * 10;
      values.push(
        entry.id, entry.memberId || null, entry.memberName, entry.action, entry.field,
        entry.oldValue, entry.newValue, entry.actorId || null, entry.actorName, entry.actorRole
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
    }).join(", ");
    const result = await pool.query(
      `insert into member_audit_logs (
        id, member_id, member_name, action, field, old_value, new_value,
        actor_id, actor_name, actor_role
      ) values ${placeholders} returning *`,
      values
    );
    return result.rows.map(toAuditLog);
  }

  const db = await readJsonDb();
  db.auditLogs ||= [];
  db.auditLogs.unshift(...entries);
  await writeJsonDb(db);
  return entries;
}

async function listAuditLogs(user, filters = {}) {
  const search = String(filters.search || "").trim().toLowerCase();
  const editor = String(filters.editor || "").trim().toLowerCase();
  const action = String(filters.action || "").trim();
  const fromDate = String(filters.from || "").trim();
  const toDate = String(filters.to || "").trim();
  const memberId = String(filters.memberId || "").trim();
  const limit = Math.min(5000, Math.max(25, Number(filters.limit || 100)));
  const memberIds = ["admin", "state_president"].includes(user.role) ? null : new Set((await exportMembers(user, {})).map((member) => member.id));

  if (hasPostgres) {
    const values = [];
    const where = [];
    const add = (value) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (search) {
      const term = add(`%${search}%`);
      where.push(`(
        lower(member_name) like ${term}
        or lower(field) like ${term}
        or lower(action) like ${term}
        or lower(actor_name) like ${term}
        or lower(actor_role) like ${term}
        or lower(old_value) like ${term}
        or lower(new_value) like ${term}
      )`);
    }
    if (editor) {
      const term = add(`%${editor}%`);
      where.push(`(lower(actor_name) like ${term} or lower(actor_role) like ${term})`);
    }
    if (action) where.push(`action = ${add(action)}`);
    if (memberId) where.push(`member_id = ${add(memberId)}`);
    if (fromDate) where.push(`created_at >= ${add(`${fromDate}T00:00:00`)}::timestamptz`);
    if (toDate) where.push(`created_at <= ${add(`${toDate}T23:59:59.999`)}::timestamptz`);
    if (memberIds) {
      const ids = [...memberIds];
      where.push(ids.length ? `(member_id = any(${add(ids)}) or actor_id = ${add(user.id)})` : `actor_id = ${add(user.id)}`);
    }
    const limitParam = add(limit);
    const result = await pool.query(
      `select * from member_audit_logs
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by created_at desc
       limit ${limitParam}`,
      values
    );
    return result.rows.map(toAuditLog);
  }

  const db = await readJsonDb();
  db.auditLogs ||= [];
  let rows = db.auditLogs;
  if (memberIds) rows = rows.filter((row) => memberIds.has(row.memberId) || row.actorId === user.id);
  if (memberId) rows = rows.filter((row) => row.memberId === memberId);
  if (search) {
    rows = rows.filter((row) => [row.memberName, row.field, row.action, row.actorName, row.actorRole, row.oldValue, row.newValue]
      .some((value) => String(value || "").toLowerCase().includes(search)));
  }
  if (editor) rows = rows.filter((row) => [row.actorName, row.actorRole].some((value) => String(value || "").toLowerCase().includes(editor)));
  if (action) rows = rows.filter((row) => row.action === action);
  if (fromDate) rows = rows.filter((row) => new Date(row.createdAt) >= new Date(`${fromDate}T00:00:00`));
  if (toDate) rows = rows.filter((row) => new Date(row.createdAt) <= new Date(`${toDate}T23:59:59.999`));
  return rows.slice(0, limit);
}

async function createDataCorrectionRequest(request) {
  const item = {
    id: crypto.randomUUID(),
    memberId: String(request.memberId || ""),
    memberName: String(request.memberName || ""),
    requestedChanges: request.requestedChanges || {},
    reason: String(request.reason || ""),
    status: "Pending",
    adminRemarks: "",
    requestedById: String(request.requestedById || ""),
    requestedByName: String(request.requestedByName || ""),
    requestedByRole: String(request.requestedByRole || ""),
    reviewedById: "",
    reviewedByName: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (hasPostgres) {
    const result = await pool.query(
      `insert into data_correction_requests (
        id, member_id, member_name, requested_changes, reason, status, admin_remarks,
        requested_by_id, requested_by_name, requested_by_role, reviewed_by_id, reviewed_by_name,
        created_at, updated_at
      ) values ($1, $2, $3, $4::jsonb, $5, 'Pending', '', $6, $7, $8, '', '', $9, $9) returning *`,
      [
        item.id, item.memberId, item.memberName, JSON.stringify(item.requestedChanges), item.reason,
        item.requestedById, item.requestedByName, item.requestedByRole, item.createdAt
      ]
    );
    return toDataCorrectionRequest(result.rows[0]);
  }

  const db = await readJsonDb();
  db.dataCorrectionRequests ||= [];
  db.dataCorrectionRequests.unshift(item);
  await writeJsonDb(db);
  return item;
}

async function listDataCorrectionRequests(user, filters = {}) {
  const search = String(filters.search || "").trim().toLowerCase();
  let rows;

  if (hasPostgres) {
    rows = (await pool.query("select * from data_correction_requests order by case status when 'Pending' then 0 else 1 end, created_at desc")).rows
      .map(toDataCorrectionRequest);
  } else {
    const db = await readJsonDb();
    db.dataCorrectionRequests ||= [];
    rows = [...db.dataCorrectionRequests].sort((a, b) => {
      if (a.status === "Pending" && b.status !== "Pending") return -1;
      if (a.status !== "Pending" && b.status === "Pending") return 1;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  if (user.role === "taluk") rows = rows.filter((row) => row.requestedById === user.id);
  if (["division", "district"].includes(user.role)) {
    const visibleMemberIds = new Set((await exportMembers(user, {})).map((member) => member.id));
    rows = rows.filter((row) => visibleMemberIds.has(row.memberId));
  }
  if (search) {
    rows = rows.filter((row) => [
      row.memberName, row.reason, row.status, row.requestedByName, row.adminRemarks,
      ...Object.values(row.requestedChanges || {})
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }
  return rows;
}

async function listMemberDataCorrectionRequests(memberId, limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 20)));
  if (hasPostgres) {
    const result = await pool.query(
      "select * from data_correction_requests where member_id = $1 order by created_at desc limit $2",
      [memberId, safeLimit]
    );
    return result.rows.map(toDataCorrectionRequest);
  }
  const db = await readJsonDb();
  db.dataCorrectionRequests ||= [];
  return db.dataCorrectionRequests
    .filter((item) => item.memberId === memberId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, safeLimit);
}

async function getDataCorrectionRequest(id) {
  if (hasPostgres) {
    const result = await pool.query("select * from data_correction_requests where id = $1", [id]);
    return toDataCorrectionRequest(result.rows[0]) || null;
  }
  const db = await readJsonDb();
  db.dataCorrectionRequests ||= [];
  return db.dataCorrectionRequests.find((item) => item.id === id) || null;
}

async function updateDataCorrectionRequest(id, changes) {
  if (hasPostgres) {
    const current = await getDataCorrectionRequest(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    const result = await pool.query(
      `update data_correction_requests set status = $2, admin_remarks = $3,
        reviewed_by_id = $4, reviewed_by_name = $5, updated_at = now()
       where id = $1 returning *`,
      [id, next.status, next.adminRemarks || "", next.reviewedById || "", next.reviewedByName || ""]
    );
    return toDataCorrectionRequest(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  db.dataCorrectionRequests ||= [];
  const target = db.dataCorrectionRequests.find((item) => item.id === id);
  if (!target) return null;
  Object.assign(target, changes, { updatedAt: new Date().toISOString() });
  await writeJsonDb(db);
  return target;
}

const presidentMessageAudiences = new Set([
  "all_members",
  "active_members",
  "pending_members",
  "correction_members",
  "all_teams"
]);

function normalizePresidentMessage(message) {
  return {
    id: crypto.randomUUID(),
    audience: presidentMessageAudiences.has(message.audience) ? message.audience : "all_members",
    subject: String(message.subject || "State President Notice").trim(),
    body: String(message.body || "").trim(),
    active: message.active !== false,
    createdById: String(message.createdById || ""),
    createdByName: String(message.createdByName || ""),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function messageVisibleToMember(message, member) {
  if (!message.active || message.audience === "all_teams") return false;
  if (message.audience === "active_members") return member.status === "Active";
  if (message.audience === "pending_members") return member.status === "Pending verification";
  if (message.audience === "correction_members") return member.status === "Needs correction";
  return message.audience === "all_members";
}

async function createPresidentMessage(message) {
  const item = normalizePresidentMessage(message);
  if (!item.subject) {
    const error = new Error("Subject is required");
    error.status = 400;
    throw error;
  }
  if (!item.body) {
    const error = new Error("Message is required");
    error.status = 400;
    throw error;
  }

  if (hasPostgres) {
    const result = await pool.query(
      `insert into president_messages (
        id, audience, subject, body, active, created_by_id, created_by_name, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $8) returning *`,
      [item.id, item.audience, item.subject, item.body, item.active, item.createdById, item.createdByName, item.createdAt]
    );
    return toPresidentMessage(result.rows[0]);
  }

  const db = await readJsonDb();
  db.presidentMessages ||= [];
  db.presidentMessages.unshift(item);
  await writeJsonDb(db);
  return item;
}

async function listPresidentMessages(limit = 25) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 25)));
  if (hasPostgres) {
    const result = await pool.query("select * from president_messages order by created_at desc limit $1", [safeLimit]);
    return result.rows.map(toPresidentMessage);
  }

  const db = await readJsonDb();
  db.presidentMessages ||= [];
  return [...db.presidentMessages]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, safeLimit);
}

async function listPresidentMessagesForMember(member, limit = 5) {
  const messages = await listPresidentMessages(50);
  return messages.filter((message) => messageVisibleToMember(message, member)).slice(0, limit);
}

function chatScopeForUser(user) {
  if (!user) return { district: "", taluk: "" };
  const district = user.role === "division" ? "" : canonicalDistrict(user.district || "");
  const taluk = user.role === "taluk" ? normalizedTaluk(district, user.taluk || "") : "";
  return { district, taluk };
}

async function listTeamChatMessages(user, limit = 100) {
  const safeLimit = Math.min(200, Math.max(20, Number(limit || 100)));
  if (hasPostgres) {
    if (["admin", "state_president"].includes(user.role)) {
      const result = await pool.query("select * from team_chat_messages order by pinned desc, created_at desc limit $1", [safeLimit]);
      return result.rows.map(toTeamChatMessage).reverse();
    }
    if (user.role === "division") {
      const districts = divisionDistricts(user.district);
      if (!districts.length) return [];
      const placeholders = districts.map((_, index) => `$${index + 1}`).join(", ");
      const result = await pool.query(
        `select * from team_chat_messages
         where district in (${placeholders})
         order by pinned desc, created_at desc limit $${districts.length + 1}`,
        [...districts, safeLimit]
      );
      return result.rows.map(toTeamChatMessage).reverse();
    }
    const district = canonicalDistrict(user.district || "");
    const taluk = user.role === "taluk" ? normalizedTaluk(district, user.taluk || "") : "";
    const result = await pool.query(
      `select * from team_chat_messages
       where district = $1 and ($2 = '' or lower(coalesce(taluk, '')) = lower($2))
       order by pinned desc, created_at desc limit $3`,
      [district, taluk, safeLimit]
    );
    return result.rows.map(toTeamChatMessage).reverse();
  }

  const db = await readJsonDb();
  db.teamChatMessages ||= [];
  let rows = db.teamChatMessages;
  if (!["admin", "state_president"].includes(user.role)) {
    if (user.role === "division") {
      const districts = divisionDistricts(user.district);
      rows = rows.filter((item) => districts.includes(canonicalDistrict(item.district)));
    } else {
      const district = canonicalDistrict(user.district || "");
      const taluk = user.role === "taluk" ? normalizedTaluk(district, user.taluk || "") : "";
      rows = rows.filter((item) => canonicalDistrict(item.district) === district
        && (!taluk || normalizedTaluk(district, item.taluk) === taluk));
    }
  }
  return rows
    .sort((a, b) => Number(Boolean(a.pinned)) - Number(Boolean(b.pinned)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .slice(-safeLimit);
}

async function createTeamChatMessage(user, body, options = {}) {
  const text = String(body || "").trim();
  if (!text) {
    const error = new Error("Message is required");
    error.status = 400;
    throw error;
  }
  if (text.length > 1000) {
    const error = new Error("Message must be 1000 characters or less");
    error.status = 400;
    throw error;
  }

  const scope = chatScopeForUser(user);
  const item = {
    id: crypto.randomUUID(),
    body: text,
    authorId: user.id,
    authorName: user.name || user.username,
    authorRole: user.role,
    district: scope.district,
    taluk: scope.taluk,
    pinned: Boolean(options.pinned && ["admin", "state_president", "division"].includes(user.role)),
    createdAt: new Date().toISOString()
  };

  if (hasPostgres) {
    const result = await pool.query(
      `insert into team_chat_messages (
        id, body, author_id, author_name, author_role, district, taluk, pinned, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [item.id, item.body, item.authorId, item.authorName, item.authorRole, item.district, item.taluk, item.pinned, item.createdAt]
    );
    return toTeamChatMessage(result.rows[0]);
  }

  const db = await readJsonDb();
  db.teamChatMessages ||= [];
  db.teamChatMessages.push(item);
  await writeJsonDb(db);
  return item;
}

async function listMemberNotes(user, memberId) {
  const member = await getMember(memberId);
  if (!member || !memberVisibleTo(user, member)) return null;

  if (hasPostgres) {
    const result = await pool.query(
      "select * from member_notes where member_id = $1 order by created_at desc limit 100",
      [memberId]
    );
    return { member, notes: result.rows.map(toMemberNote) };
  }

  const db = await readJsonDb();
  db.memberNotes ||= [];
  return {
    member,
    notes: db.memberNotes
      .filter((item) => item.memberId === memberId)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 100)
  };
}

async function createMemberNote(user, memberId, noteInput) {
  const member = await getMember(memberId);
  if (!member || !memberVisibleTo(user, member)) return null;
  const note = String(noteInput.note || "").trim();
  const noteType = String(noteInput.noteType || "General").trim() || "General";
  if (!note) {
    const error = new Error("Note is required");
    error.status = 400;
    throw error;
  }

  const item = {
    id: crypto.randomUUID(),
    memberId,
    note,
    noteType,
    createdById: user.id,
    createdByName: user.name || user.username,
    createdByRole: user.role,
    createdAt: new Date().toISOString()
  };

  if (hasPostgres) {
    const result = await pool.query(
      `insert into member_notes (
        id, member_id, note, note_type, created_by_id, created_by_name, created_by_role, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [item.id, item.memberId, item.note, item.noteType, item.createdById, item.createdByName, item.createdByRole, item.createdAt]
    );
    return { member, note: toMemberNote(result.rows[0]) };
  }

  const db = await readJsonDb();
  db.memberNotes ||= [];
  db.memberNotes.unshift(item);
  await writeJsonDb(db);
  return { member, note: item };
}

async function createMemberProblem(member, input = {}) {
  const subject = String(input.subject || "").trim();
  const description = String(input.description || "").trim();
  const category = String(input.category || "General").trim() || "General";
  if (!subject) {
    const error = new Error("Subject is required");
    error.status = 400;
    throw error;
  }
  if (!description) {
    const error = new Error("Problem details are required");
    error.status = 400;
    throw error;
  }
  const normalized = normalizeMemberLocation(member);
  const item = {
    id: crypto.randomUUID(),
    memberId: member.id,
    memberName: member.name,
    lsNumber: member.lsNumber || "",
    phoneNumber: member.phoneNumber || "",
    district: normalized.district,
    taluk: normalized.taluk,
    category,
    subject,
    description,
    status: "Submitted",
    response: "",
    reviewedById: "",
    reviewedByName: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (hasPostgres) {
    const result = await pool.query(
      `insert into member_problems (
        id, member_id, member_name, ls_number, phone_number, district, taluk,
        category, subject, description, status, response, reviewed_by_id, reviewed_by_name,
        created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Submitted', '', '', '', $11, $11) returning *`,
      [
        item.id, item.memberId, item.memberName, item.lsNumber, item.phoneNumber, item.district, item.taluk,
        item.category, item.subject, item.description, item.createdAt
      ]
    );
    return toMemberProblem(result.rows[0]);
  }

  const db = await readJsonDb();
  db.memberProblems ||= [];
  db.memberProblems.unshift(item);
  await writeJsonDb(db);
  return item;
}

function problemVisibleTo(user, problem) {
  if (["admin", "state_president"].includes(user.role)) return true;
  const district = canonicalDistrict(problem.district || "");
  if (user.role === "division") return divisionDistricts(user.district).includes(district);
  if (user.role === "district") return canonicalDistrict(user.district) === district;
  if (user.role === "taluk") return canonicalDistrict(user.district) === district
    && normalizedTaluk(district, user.taluk) === normalizedTaluk(district, problem.taluk);
  return false;
}

async function listMemberProblems(userOrMember, filters = {}) {
  const search = String(filters.search || "").trim().toLowerCase();
  const status = String(filters.status || "").trim();
  const memberId = String(filters.memberId || "").trim();
  const limit = Math.min(500, Math.max(25, Number(filters.limit || 200)));
  let rows;

  if (hasPostgres) {
    rows = (await pool.query("select * from member_problems order by case status when 'Submitted' then 0 when 'In review' then 1 else 2 end, created_at desc")).rows
      .map(toMemberProblem);
  } else {
    const db = await readJsonDb();
    db.memberProblems ||= [];
    rows = [...db.memberProblems].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  if (userOrMember.role === "member") rows = rows.filter((row) => row.memberId === userOrMember.id);
  else rows = rows.filter((row) => problemVisibleTo(userOrMember, row));
  if (memberId) rows = rows.filter((row) => row.memberId === memberId);
  if (status) rows = rows.filter((row) => row.status === status);
  if (search) {
    rows = rows.filter((row) => [
      row.memberName, row.lsNumber, row.phoneNumber, row.district, row.taluk,
      row.category, row.subject, row.description, row.status, row.response
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }
  return rows.slice(0, limit);
}

async function updateMemberProblem(user, id, changes = {}) {
  const status = String(changes.status || "").trim();
  const response = String(changes.response || "").trim();
  const allowed = ["Submitted", "In review", "Resolved", "Rejected"];
  if (!allowed.includes(status)) {
    const error = new Error("Use Submitted, In review, Resolved or Rejected");
    error.status = 400;
    throw error;
  }

  let current;
  if (hasPostgres) {
    current = toMemberProblem((await pool.query("select * from member_problems where id = $1", [id])).rows[0]);
  } else {
    const db = await readJsonDb();
    db.memberProblems ||= [];
    current = db.memberProblems.find((item) => item.id === id) || null;
  }
  if (!current || !problemVisibleTo(user, current)) return null;

  if (hasPostgres) {
    const result = await pool.query(
      `update member_problems
       set status = $2, response = $3, reviewed_by_id = $4, reviewed_by_name = $5, updated_at = now()
       where id = $1 returning *`,
      [id, status, response, user.id || "", user.name || user.username || ""]
    );
    return toMemberProblem(result.rows[0]);
  }

  const db = await readJsonDb();
  const target = db.memberProblems.find((item) => item.id === id);
  Object.assign(target, {
    status,
    response,
    reviewedById: user.id || "",
    reviewedByName: user.name || user.username || "",
    updatedAt: new Date().toISOString()
  });
  await writeJsonDb(db);
  return target;
}

async function startUserSession(user) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    userId: user.id,
    username: user.username || "",
    name: user.name || "",
    role: user.role || "",
    district: user.district || "",
    taluk: user.taluk || "",
    startedAt: now,
    lastSeenAt: now,
    endedAt: "",
    durationSeconds: 0,
    active: true
  };

  if (hasPostgres) {
    const result = await pool.query(
      `insert into user_sessions (
        id, user_id, username, name, role, district, taluk, started_at, last_seen_at, duration_seconds, active
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $8, 0, true) returning *`,
      [item.id, item.userId, item.username, item.name, item.role, item.district, item.taluk, item.startedAt]
    );
    return toUserSession(result.rows[0]);
  }

  const db = await readJsonDb();
  db.userSessions ||= [];
  db.userSessions.unshift(item);
  await writeJsonDb(db);
  return item;
}

async function touchUserSession(id) {
  if (!id) return null;
  if (hasPostgres) {
    const result = await pool.query(
      `update user_sessions
       set last_seen_at = now(),
           duration_seconds = greatest(duration_seconds, floor(extract(epoch from (now() - started_at)))::integer),
           active = true
       where id = $1 returning *`,
      [id]
    );
    return toUserSession(result.rows[0]);
  }

  const db = await readJsonDb();
  db.userSessions ||= [];
  const session = db.userSessions.find((item) => item.id === id);
  if (!session) return null;
  const now = new Date();
  session.lastSeenAt = now.toISOString();
  session.durationSeconds = Math.max(
    Number(session.durationSeconds || 0),
    Math.floor((now - new Date(session.startedAt || session.lastSeenAt)) / 1000)
  );
  session.active = true;
  await writeJsonDb(db);
  return session;
}

async function endUserSession(id) {
  if (!id) return null;
  if (hasPostgres) {
    const result = await pool.query(
      `update user_sessions
       set last_seen_at = now(),
           ended_at = now(),
           duration_seconds = greatest(duration_seconds, floor(extract(epoch from (now() - started_at)))::integer),
           active = false
       where id = $1 returning *`,
      [id]
    );
    return toUserSession(result.rows[0]);
  }

  const db = await readJsonDb();
  db.userSessions ||= [];
  const session = db.userSessions.find((item) => item.id === id);
  if (!session) return null;
  const now = new Date();
  session.lastSeenAt = now.toISOString();
  session.endedAt = now.toISOString();
  session.durationSeconds = Math.max(
    Number(session.durationSeconds || 0),
    Math.floor((now - new Date(session.startedAt || session.lastSeenAt)) / 1000)
  );
  session.active = false;
  await writeJsonDb(db);
  return session;
}

async function listUserSessionStats(user, filters = {}) {
  const search = String(filters.search || "").trim().toLowerCase();
  const role = String(filters.role || "taluk").trim();
  const from = String(filters.from || "").trim();
  const to = String(filters.to || "").trim();
  let rows;

  if (hasPostgres) {
    rows = (await pool.query(
      `select *,
        greatest(duration_seconds, floor(extract(epoch from ((case when ended_at is null and active then now() else coalesce(ended_at, last_seen_at, now()) end) - started_at)))::integer) as duration_seconds
       from user_sessions
       order by last_seen_at desc`
    )).rows.map(toUserSession);
  } else {
    const db = await readJsonDb();
    db.userSessions ||= [];
    rows = [...db.userSessions];
  }

  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : 0;
  const toTime = to ? new Date(`${to}T23:59:59`).getTime() : 0;
  rows = rows
    .filter((session) => userSessionVisibleTo(user, session))
    .filter((session) => !role || session.role === role)
    .filter((session) => {
      const started = new Date(session.startedAt || session.started_at || 0).getTime();
      if (fromTime && started < fromTime) return false;
      if (toTime && started > toTime) return false;
      return true;
    });

  if (search) {
    rows = rows.filter((session) => [
      session.username, session.name, session.role, session.district, session.taluk
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }

  const todayPrefix = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();
  const activeCutoff = nowMs - (2 * 60 * 1000);
  const grouped = new Map();
  for (const session of rows) {
    const key = session.userId || session.username || session.id;
    const existing = grouped.get(key) || {
      userId: session.userId || "",
      username: session.username || "",
      name: session.name || "",
      role: session.role || "",
      district: session.district || "",
      taluk: session.taluk || "",
      sessionCount: 0,
      totalSeconds: 0,
      todaySeconds: 0,
      activeSessions: 0,
      lastSeenAt: "",
      lastStartedAt: ""
    };
    const startedAt = session.startedAt || "";
    const lastSeenAt = session.lastSeenAt || "";
    const liveSeconds = session.active && !session.endedAt
      ? Math.floor((nowMs - new Date(startedAt || lastSeenAt || nowMs).getTime()) / 1000)
      : 0;
    const durationSeconds = Math.max(0, Number(session.durationSeconds || 0), liveSeconds);
    existing.sessionCount += 1;
    existing.totalSeconds += durationSeconds;
    if (String(startedAt).slice(0, 10) === todayPrefix) existing.todaySeconds += durationSeconds;
    if (session.active && !session.endedAt && new Date(lastSeenAt || startedAt || 0).getTime() >= activeCutoff) existing.activeSessions += 1;
    if (!existing.lastSeenAt || String(lastSeenAt) > String(existing.lastSeenAt)) existing.lastSeenAt = lastSeenAt;
    if (!existing.lastStartedAt || String(startedAt) > String(existing.lastStartedAt)) existing.lastStartedAt = startedAt;
    grouped.set(key, existing);
  }

  const users = Array.from(grouped.values()).sort((a, b) => b.totalSeconds - a.totalSeconds || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
  return {
    summary: {
      users: users.length,
      sessionCount: rows.length,
      totalSeconds: users.reduce((sum, item) => sum + item.totalSeconds, 0),
      todaySeconds: users.reduce((sum, item) => sum + item.todaySeconds, 0),
      activeUsers: users.filter((item) => item.activeSessions > 0).length
    },
    rows: users
  };
}

async function listUsers(viewer = null) {
  if (hasPostgres) {
    if (viewer?.role === "division") {
      const districts = divisionDistricts(viewer.district);
      if (!districts.length) return [];
      const placeholders = districts.map((_, index) => `$${index + 1}`).join(", ");
      const result = await pool.query(
        `select * from users where role in ('district', 'taluk') and district in (${placeholders}) order by role, district, taluk, username`,
        districts
      );
      return result.rows.map(toCamel);
    }
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
  if (viewer?.role === "division") {
    const districts = divisionDistricts(viewer.district);
    return db.users.filter((item) => ["district", "taluk"].includes(item.role) && districts.includes(canonicalDistrict(item.district)));
  }
  if (viewer?.role === "district") {
    const district = canonicalDistrict(viewer.district);
    return db.users.filter((item) => item.role === "taluk" && canonicalDistrict(item.district) === district);
  }
  return db.users;
}

async function findTalukTeamContactForMember(member) {
  const district = canonicalDistrict(member?.district || "");
  const taluk = normalizedTaluk(district, member?.taluk || "");
  if (!district || !taluk) return null;

  if (hasPostgres) {
    const result = await pool.query(
      `select u.id, u.username, u.name, u.role, u.district, u.taluk, u.active,
              r.phone_number as phone_number
       from users u
       left join taluk_team_requests r
         on r.status = 'Approved'
        and (r.user_id = u.id or lower(r.requested_username) = lower(u.username))
       where u.role = 'taluk'
         and u.active = true
         and u.district = $1
         and lower(coalesce(u.taluk, '')) = lower($2)
       order by u.updated_at desc
       limit 1`,
      [district, taluk]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      district: row.district || "",
      taluk: row.taluk || "",
      phoneNumber: row.phone_number || ""
    };
  }

  const db = await readJsonDb();
  const user = db.users.find((item) => item.role === "taluk"
    && item.active === true
    && canonicalDistrict(item.district) === district
    && normalizedTaluk(district, item.taluk) === taluk);
  if (!user) return null;
  const request = (db.talukTeamRequests || []).find((item) => item.status === "Approved"
    && (item.userId === user.id || String(item.requestedUsername || "").toLowerCase() === String(user.username || "").toLowerCase()));
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    district: user.district || "",
    taluk: user.taluk || "",
    phoneNumber: request?.phoneNumber || ""
  };
}

async function upsertStatePresidentUser(password) {
  const user = {
    id: crypto.randomUUID(),
    username: "state_president",
    password,
    name: "State President",
    role: "state_president",
    district: "",
    taluk: "",
    active: true,
    createdAt: new Date().toISOString()
  };

  if (hasPostgres) {
    const result = await pool.query(
      `insert into users (id, username, password, name, role, district, taluk, active, created_at, updated_at)
       values ($1, 'state_president', $2, 'State President', 'state_president', '', '', true, $3, $3)
       on conflict (username) do update set
        password = excluded.password,
        name = excluded.name,
        role = 'state_president',
        district = '',
        taluk = '',
        active = true,
        updated_at = now()
       returning *`,
      [user.id, user.password, user.createdAt]
    );
    return toCamel(result.rows[0]);
  }

  const db = await readJsonDb();
  const existing = db.users.find((item) => item.username === "state_president");
  if (existing) Object.assign(existing, user, { id: existing.id });
  else db.users.push(user);
  await writeJsonDb(db);
  return existing || user;
}

async function usernameExists(username) {
  if (hasPostgres) {
    const result = await pool.query("select 1 from users where username = $1", [username]);
    return result.rowCount > 0;
  }
  const db = await readJsonDb();
  return db.users.some((item) => item.username === username);
}

async function talukLoginExists(district, taluk, excludeUserId = "") {
  const canonical = canonicalDistrict(district);
  const normalized = normalizedTaluk(canonical, taluk);
  const exclude = String(excludeUserId || "");
  if (!canonical || !normalized) return false;

  if (hasPostgres) {
    const result = await pool.query(
      `select 1 from users
       where role = 'taluk'
         and district = $1
         and lower(coalesce(taluk, '')) = lower($2)
         and ($3 = '' or id <> $3)
       limit 1`,
      [canonical, normalized, exclude]
    );
    return result.rowCount > 0;
  }

  const db = await readJsonDb();
  return db.users.some((item) => item.role === "taluk"
    && item.id !== exclude
    && canonicalDistrict(item.district) === canonical
    && normalizedTaluk(canonical, item.taluk) === normalized);
}

async function findTeamRequestDuplicate({ phoneNumber = "", requestedUsername = "", district = "", taluk = "" }) {
  const phone = String(phoneNumber || "").trim();
  const username = String(requestedUsername || "").trim().toLowerCase();
  const canonical = canonicalDistrict(district);
  const normalized = normalizedTaluk(canonical, taluk);

  if (hasPostgres) {
    const result = await pool.query(
      `select * from taluk_team_requests
       where status = 'Pending'
         and (
          ($1 <> '' and phone_number = $1)
          or ($2 <> '' and lower(requested_username) = $2)
          or ($3 <> '' and $4 <> '' and district = $3 and lower(taluk) = lower($4))
         )
       limit 1`,
      [phone, username, canonical, normalized]
    );
    return toTeamRequest(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  db.talukTeamRequests ||= [];
  return db.talukTeamRequests.find((item) => item.status === "Pending"
    && ((phone && item.phoneNumber === phone)
      || (username && String(item.requestedUsername || "").toLowerCase() === username)
      || (canonical && normalized && canonicalDistrict(item.district) === canonical && normalizedTaluk(canonical, item.taluk) === normalized))) || null;
}

async function createTeamRequest(request) {
  const item = {
    id: crypto.randomUUID(),
    name: String(request.name || "").trim(),
    phoneNumber: String(request.phoneNumber || "").trim(),
    district: canonicalDistrict(request.district || ""),
    taluk: String(request.taluk || "").trim(),
    requestedUsername: String(request.requestedUsername || "").trim(),
    requestedPassword: String(request.requestedPassword || "").trim(),
    status: "Pending",
    remarks: "",
    userId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (hasPostgres) {
    const result = await pool.query(
      `insert into taluk_team_requests (
        id, name, phone_number, district, taluk, requested_username, requested_password,
        status, remarks, user_id, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, 'Pending', '', '', $8, $8) returning *`,
      [item.id, item.name, item.phoneNumber, item.district, item.taluk, item.requestedUsername, item.requestedPassword, item.createdAt]
    );
    return toTeamRequest(result.rows[0]);
  }

  const db = await readJsonDb();
  db.talukTeamRequests ||= [];
  db.talukTeamRequests.unshift(item);
  await writeJsonDb(db);
  return item;
}

function visibleTeamRequestsFor(viewer, requests) {
  if (viewer?.role !== "division") return requests;
  const districts = divisionDistricts(viewer.district);
  return requests.filter((item) => districts.includes(canonicalDistrict(item.district)));
}

async function listTeamRequests(viewer = null) {
  if (hasPostgres) {
    if (viewer?.role === "division") {
      const districts = divisionDistricts(viewer.district);
      if (!districts.length) return [];
      const placeholders = districts.map((_, index) => `$${index + 1}`).join(", ");
      const result = await pool.query(
        `select * from taluk_team_requests
         where district in (${placeholders})
         order by case status when 'Pending' then 0 else 1 end, created_at desc`,
        districts
      );
      return result.rows.map(toTeamRequest);
    }
    const result = await pool.query("select * from taluk_team_requests order by case status when 'Pending' then 0 else 1 end, created_at desc");
    return result.rows.map(toTeamRequest);
  }
  const db = await readJsonDb();
  db.talukTeamRequests ||= [];
  const sorted = [...db.talukTeamRequests].sort((a, b) => {
    if (a.status === "Pending" && b.status !== "Pending") return -1;
    if (a.status !== "Pending" && b.status === "Pending") return 1;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return visibleTeamRequestsFor(viewer, sorted);
}

async function getTeamRequest(id) {
  if (hasPostgres) {
    const result = await pool.query("select * from taluk_team_requests where id = $1", [id]);
    return toTeamRequest(result.rows[0]) || null;
  }
  const db = await readJsonDb();
  db.talukTeamRequests ||= [];
  return db.talukTeamRequests.find((item) => item.id === id) || null;
}

async function updateTeamRequest(id, changes) {
  if (hasPostgres) {
    const current = await getTeamRequest(id);
    if (!current) return null;
    const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
    const result = await pool.query(
      `update taluk_team_requests set status = $2, remarks = $3, user_id = $4, updated_at = now()
       where id = $1 returning *`,
      [id, next.status, next.remarks || "", next.userId || ""]
    );
    return toTeamRequest(result.rows[0]) || null;
  }

  const db = await readJsonDb();
  db.talukTeamRequests ||= [];
  const target = db.talukTeamRequests.find((item) => item.id === id);
  if (!target) return null;
  Object.assign(target, changes, { updatedAt: new Date().toISOString() });
  await writeJsonDb(db);
  return target;
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

async function upsertDivisionTechnicalTeamUsers(password) {
  const users = [];
  for (const division of Object.keys(STATE_DIVISIONS)) {
    const username = `division_${division.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    const user = {
      id: crypto.randomUUID(),
      username,
      password,
      name: `${division} Division Technical Team`,
      role: "division",
      district: canonicalDivision(division),
      taluk: "",
      active: true,
      createdAt: new Date().toISOString()
    };

    if (hasPostgres) {
      const result = await pool.query(
        `insert into users (id, username, password, name, role, district, taluk, active, created_at, updated_at)
         values ($1, $2, $3, $4, 'division', $5, '', true, $6, $6)
         on conflict (username) do update set
          password = excluded.password,
          name = excluded.name,
          role = 'division',
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

const backupTables = [
  "app_meta",
  "users",
  "members",
  "taluk_team_requests",
  "member_audit_logs",
  "data_correction_requests",
  "president_messages",
  "team_chat_messages",
  "member_notes",
  "member_problems",
  "user_sessions"
];

const jsonBackupKeys = {
  app_meta: "appMeta",
  users: "users",
  members: "members",
  taluk_team_requests: "talukTeamRequests",
  member_audit_logs: "auditLogs",
  data_correction_requests: "dataCorrectionRequests",
  president_messages: "presidentMessages",
  team_chat_messages: "teamChatMessages",
  member_notes: "memberNotes",
  member_problems: "memberProblems",
  user_sessions: "userSessions"
};

async function createBackup(createdBy = {}) {
  const backup = {
    type: "klswa-postgres-app-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: {
      id: createdBy.id || "",
      username: createdBy.username || "",
      name: createdBy.name || "",
      role: createdBy.role || ""
    },
    database: hasPostgres ? "postgresql" : "json",
    tables: {}
  };

  if (hasPostgres) {
    for (const table of backupTables) {
      const result = await pool.query(`select * from ${table}`);
      backup.tables[table] = result.rows;
    }
    return backup;
  }

  const db = await readJsonDb();
  backup.tables.app_meta = Object.entries(db.meta || {}).map(([key, value]) => ({ key, value: String(value ?? "") }));
  for (const [table, key] of Object.entries(jsonBackupKeys)) {
    if (table === "app_meta") continue;
    backup.tables[table] = Array.isArray(db[key]) ? db[key] : [];
  }
  return backup;
}

async function insertBackupRows(client, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const rowValues = columns.map((column) => row[column] ?? null);
    values.push(...rowValues);
    const offset = rowIndex * columns.length;
    return `(${columns.map((_, index) => `$${offset + index + 1}`).join(", ")})`;
  }).join(", ");
  await client.query(
    `insert into ${table} (${columns.map((column) => `"${column}"`).join(", ")}) values ${placeholders}`,
    values
  );
}

async function restoreBackup(backup, restoredBy = {}) {
  if (!backup || backup.type !== "klswa-postgres-app-backup" || !backup.tables || typeof backup.tables !== "object") {
    const error = new Error("Invalid backup file");
    error.status = 400;
    throw error;
  }

  if (hasPostgres) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const table of [...backupTables].reverse()) {
        await client.query(`delete from ${table}`);
      }
      for (const table of backupTables) {
        await insertBackupRows(client, table, Array.isArray(backup.tables[table]) ? backup.tables[table] : []);
      }
      await client.query("commit");
      await touchMeta();
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } else {
    const nextDb = {
      meta: Object.fromEntries((backup.tables.app_meta || []).map((row) => [row.key, row.value])),
      users: backup.tables.users || [],
      members: backup.tables.members || [],
      talukTeamRequests: backup.tables.taluk_team_requests || [],
      auditLogs: backup.tables.member_audit_logs || [],
      dataCorrectionRequests: backup.tables.data_correction_requests || [],
      presidentMessages: backup.tables.president_messages || [],
      teamChatMessages: backup.tables.team_chat_messages || [],
      memberNotes: backup.tables.member_notes || [],
      memberProblems: backup.tables.member_problems || [],
      userSessions: backup.tables.user_sessions || []
    };
    nextDb.meta.updatedAt = new Date().toISOString();
    await writeJsonDb(nextDb);
  }

  return {
    restoredAt: new Date().toISOString(),
    restoredBy: restoredBy.username || restoredBy.name || "admin",
    counts: Object.fromEntries(backupTables.map((table) => [table, Array.isArray(backup.tables[table]) ? backup.tables[table].length : 0]))
  };
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
  updateAppSetting,
  getPublicSummary,
  listMembers,
  getMember,
  findDuplicateMember,
  findPublicMemberStatus,
  findMemberForActivation,
  activateMemberLogin,
  verifyMemberPassword,
  updateMemberPassword,
  updateMemberLoginControl,
  findMemberByLogin,
  duplicateReason,
  exportMembers,
  listMissingDataMembers,
  createMember,
  updateMember,
  updateMemberStatus,
  listTalukCorrections,
  exportTalukCorrections,
  correctMemberTaluk,
  deleteMember,
  listUsers,
  findTalukTeamContactForMember,
  usernameExists,
  talukLoginExists,
  createUser,
  upsertStatePresidentUser,
  upsertDistrictPresidentUsers,
  upsertDivisionTechnicalTeamUsers,
  updateUser,
  deleteUser,
  memberVisibleTo,
  createAuditLogs,
  listAuditLogs,
  listDuplicateGroups,
  createDataCorrectionRequest,
  listDataCorrectionRequests,
  listMemberDataCorrectionRequests,
  getDataCorrectionRequest,
  updateDataCorrectionRequest,
  createPresidentMessage,
  listPresidentMessages,
  listPresidentMessagesForMember,
  listTeamChatMessages,
  createTeamChatMessage,
  listMemberNotes,
  createMemberNote,
  createMemberProblem,
  listMemberProblems,
  updateMemberProblem,
  startUserSession,
  touchUserSession,
  endUserSession,
  listUserSessionStats,
  findTeamRequestDuplicate,
  createTeamRequest,
  listTeamRequests,
  getTeamRequest,
  updateTeamRequest,
  createBackup,
  restoreBackup
};
