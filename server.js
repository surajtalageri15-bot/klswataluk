const http = require("http");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./db");
const { canonicalDistrict, canonicalDivision, divisionDistricts, isMasterTaluk, masterLists } = require("./taluks");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const sessions = new Map();
const memberSessions = new Map();

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" || Buffer.isBuffer(body) ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

function json(res, status, body, headers = {}) {
  send(res, status, body, { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDownload(res, filename, headers, rows) {
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\r\n");
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(csv);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function currentUser(req) {
  const token = getCookie(req, "session");
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  return await store.getUserById(session.userId);
}

function currentLoginSession(req) {
  const token = getCookie(req, "session");
  if (!token || !sessions.has(token)) return null;
  return { token, session: sessions.get(token) };
}

async function currentMember(req) {
  const token = getCookie(req, "member_session");
  if (!token || !memberSessions.has(token)) return null;
  const session = memberSessions.get(token);
  return await store.getMember(session.memberId);
}

function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    const error = new Error("Admin access required");
    error.status = 403;
    throw error;
  }
}

function canViewUsers(user) {
  return user && ["admin", "state_president", "division", "district"].includes(user.role);
}

function canViewSessionAnalytics(user) {
  return user && ["admin", "state_president", "division", "district"].includes(user.role);
}

function canReviewTeamRequests(user) {
  return user && ["admin", "division"].includes(user.role);
}

function canCorrectTaluks(user) {
  return user && ["admin", "division"].includes(user.role);
}

function canUseTeamChat(user) {
  return user && ["admin", "state_president", "division", "district", "taluk"].includes(user.role);
}

function canSeeTeamRequest(user, request) {
  if (user?.role === "admin") return true;
  if (user?.role === "division") {
    return divisionDistricts(user.district).includes(canonicalDistrict(request.district));
  }
  return false;
}

function canCreateMembers(user) {
  return user && (user.role === "admin" || user.role === "taluk");
}

function canReviewMembers(user) {
  return user && ["admin", "state_president", "division", "taluk"].includes(user.role);
}

function normalizeMember(input, existing = {}) {
  return {
    ...existing,
    name: String(input.name || "").trim(),
    lsNumber: String(input.lsNumber || "").trim(),
    loginId: String(input.loginId || "").trim(),
    district: String(input.district || existing.district || "").trim(),
    taluk: String(input.taluk || existing.taluk || "").trim(),
    gender: String(input.gender || "").trim(),
    dateOfBirth: String(input.dateOfBirth || "").trim(),
    age: input.age === "" || input.age == null ? "" : Number(input.age),
    phoneNumber: String(input.phoneNumber || "").trim(),
    qualification: String(input.qualification || "").trim(),
    batchYear: input.batchYear === "" || input.batchYear == null ? "" : Number(input.batchYear),
    status: String(input.status || existing.status || "Active").trim(),
    remarks: String(input.remarks || "").trim(),
    maritalStatus: String(input.maritalStatus || "").trim(),
    kalyanaKarnataka: String(input.kalyanaKarnataka || "").trim(),
    category: String(input.category || "").trim(),
    caste: String(input.caste || "").trim(),
    religion: String(input.religion || "").trim(),
    disability: String(input.disability || "").trim(),
    otherTaluks: String(input.otherTaluks || "").trim(),
    address: String(input.address || "").trim(),
    declarationAccepted: input.declarationAccepted === true || input.declarationAccepted === "true" || input.declarationAccepted === "on"
  };
}

function assertMember(member) {
  if (!member.name) return "Name is required";
  if (!member.lsNumber) return "LS number is required";
  if (!member.district) return "District is required";
  if (!member.taluk) return "Taluk is required";
  return null;
}

function joinScopeFromParams(params) {
  const district = canonicalDistrict(params.get("district") || "");
  const taluk = String(params.get("taluk") || "").trim();
  if (!district || !taluk || !isMasterTaluk(district, taluk)) return null;
  return {
    district,
    taluk,
    title: `${taluk} Membership Form`
  };
}

function normalizeTeamRequest(input) {
  return {
    name: String(input.name || "").trim(),
    phoneNumber: String(input.phoneNumber || "").trim(),
    district: canonicalDistrict(input.district || ""),
    taluk: String(input.taluk || "").trim(),
    requestedUsername: String(input.requestedUsername || "").trim(),
    requestedPassword: String(input.requestedPassword || "").trim()
  };
}

function assertTeamRequest(request) {
  if (!request.name) return "Name is required";
  if (!/^\d{10}$/.test(request.phoneNumber)) return "Enter a valid 10-digit phone number";
  if (!request.district) return "District is required";
  if (!request.taluk || !isMasterTaluk(request.district, request.taluk)) return "Select a valid taluk";
  if (!request.requestedUsername) return "User ID is required";
  if (request.requestedUsername.length < 4) return "User ID must be at least 4 characters";
  if (!/^[a-zA-Z0-9_.-]+$/.test(request.requestedUsername)) return "User ID can use letters, numbers, dot, underscore or hyphen";
  if (!request.requestedPassword || request.requestedPassword.length < 6) return "Password must be at least 6 characters";
  return null;
}

const auditFields = [
  "name", "lsNumber", "loginId", "district", "taluk", "gender", "dateOfBirth", "age",
  "phoneNumber", "qualification", "batchYear", "status", "remarks", "maritalStatus",
  "kalyanaKarnataka", "category", "caste", "religion", "disability", "otherTaluks", "address"
];

const correctionRequestFields = [
  "name", "lsNumber", "loginId", "gender", "dateOfBirth", "age", "phoneNumber",
  "qualification", "batchYear", "status", "remarks", "maritalStatus", "kalyanaKarnataka",
  "category", "caste", "religion", "disability", "otherTaluks", "address"
];

function auditActor(user) {
  return {
    actorId: user?.id || "public",
    actorName: user?.name || "Public form",
    actorRole: user?.role || "public"
  };
}

function valueForAudit(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function auditDiffs({ action, before = {}, after = {}, actor }) {
  return auditFields.flatMap((field) => {
    const oldValue = valueForAudit(before[field]);
    const newValue = valueForAudit(after[field]);
    if (action === "Updated" && oldValue === newValue) return [];
    return [{
      memberId: after.id || before.id || "",
      memberName: after.name || before.name || "",
      action,
      field,
      oldValue,
      newValue,
      ...auditActor(actor)
    }];
  });
}

function sanitizeCorrectionChanges(body, member) {
  const input = asObject(body);
  const changes = {};
  for (const field of correctionRequestFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const next = String(input[field] ?? "").trim();
    if (next !== valueForAudit(member[field]).trim()) changes[field] = next;
  }
  return changes;
}

async function tryCreateAuditLogs(logs) {
  try {
    await store.createAuditLogs(logs);
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

async function api(req, res, pathname) {
  const user = await currentUser(req);

  if (pathname === "/api/public-config" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const scope = joinScopeFromParams(url.searchParams);
    return json(res, 200, { lists: masterLists(), scope });
  }

  if (pathname === "/api/public-summary" && req.method === "GET") {
    return json(res, 200, await store.getPublicSummary());
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await parseBody(req);
    const found = await store.findUserByLogin(body.username, body.password);
    if (!found) return json(res, 401, { error: "Invalid username or password" });
    const token = crypto.randomBytes(24).toString("hex");
    const userSession = await store.startUserSession(found);
    sessions.set(token, { userId: found.id, userSessionId: userSession?.id || "", createdAt: Date.now() });
    return json(res, 200, { user: publicUser(found) }, {
      "Set-Cookie": `session=${token}; HttpOnly; SameSite=Lax; Path=/`
    });
  }

  if (pathname === "/api/public-membership" && req.method === "POST") {
    const body = asObject(await parseBody(req));
    const member = normalizeMember({
      ...body,
      status: "Pending verification",
      remarks: `Public form submission${body.remarks ? ` - ${body.remarks}` : ""}`
    });
    const validation = assertMember(member);
    if (validation) return json(res, 400, { error: validation });
    const required = [
      ["phoneNumber", "Mobile number is required"],
      ["dateOfBirth", "Date of birth is required"],
      ["gender", "Gender is required"],
      ["maritalStatus", "Marital status is required"],
      ["kalyanaKarnataka", "Kalyana Karnataka selection is required"],
      ["category", "Category is required"],
      ["caste", "Caste is required"],
      ["religion", "Religion is required"],
      ["disability", "Disability selection is required"],
      ["loginId", "Login ID is required"],
      ["batchYear", "Batch year is required"],
      ["qualification", "Education is required"],
      ["address", "Permanent address is required"]
    ];
    for (const [key, message] of required) {
      if (!member[key]) return json(res, 400, { error: message });
    }
    if (!/^\d{10}$/.test(member.phoneNumber)) return json(res, 400, { error: "Enter a valid 10-digit mobile number" });
    if (!member.declarationAccepted) return json(res, 400, { error: "Declaration must be accepted" });
    const duplicate = await store.findDuplicateMember(member);
    if (duplicate) return json(res, 409, { error: store.duplicateReason(duplicate, member) });
    const created = await store.createMember(member);
    await tryCreateAuditLogs(auditDiffs({ action: "Created", after: created, actor: null }));
    return json(res, 201, { ok: true, member: created });
  }

  if (pathname === "/api/public-taluk-team-request" && req.method === "POST") {
    const requestBody = normalizeTeamRequest(asObject(await parseBody(req)));
    const validation = assertTeamRequest(requestBody);
    if (validation) return json(res, 400, { error: validation });
    if (await store.talukLoginExists(requestBody.district, requestBody.taluk)) {
      return json(res, 409, { error: "This taluk already has a technical team login" });
    }
    if (await store.usernameExists(requestBody.requestedUsername)) return json(res, 409, { error: "This User ID is already used" });
    const duplicate = await store.findTeamRequestDuplicate(requestBody);
    if (duplicate) return json(res, 409, { error: "A pending request already exists for this phone number, User ID, or taluk" });
    return json(res, 201, { ok: true, request: await store.createTeamRequest(requestBody) });
  }

  if (pathname === "/api/public-status" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = (url.searchParams.get("query") || "").trim();
    if (!query) return json(res, 400, { error: "Enter phone number or LS number" });
    const member = await store.findPublicMemberStatus({ query });
    if (!member) return json(res, 404, { error: "No application found for this phone number or LS number" });
    return json(res, 200, { member });
  }

  if (pathname === "/api/member-activate" && req.method === "POST") {
    const body = asObject(await parseBody(req));
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters" });
    if (password !== confirmPassword) return json(res, 400, { error: "Passwords do not match" });
    const member = await store.findMemberForActivation({
      phoneNumber: body.phoneNumber,
      lsNumber: body.lsNumber,
      dateOfBirth: body.dateOfBirth
    });
    if (!member) return json(res, 404, { error: "Member not found. Check phone number, LS number and date of birth." });
    const activated = await store.activateMemberLogin(member.id, password);
    await tryCreateAuditLogs([{
      memberId: activated.id,
      memberName: activated.name,
      action: "Member login activated",
      field: "memberLoginActive",
      oldValue: member.memberLoginActive ? "Yes" : "No",
      newValue: "Yes",
      ...auditActor({ id: activated.id, name: activated.name, role: "member" })
    }]);
    return json(res, 200, { ok: true, member: publicMember(activated) });
  }

  if (pathname === "/api/member-forgot-password" && req.method === "POST") {
    const body = asObject(await parseBody(req));
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters" });
    if (password !== confirmPassword) return json(res, 400, { error: "Passwords do not match" });
    const member = await store.findMemberForActivation({
      phoneNumber: body.phoneNumber,
      lsNumber: body.lsNumber,
      dateOfBirth: body.dateOfBirth
    });
    if (!member) return json(res, 404, { error: "Member not found. Check phone number, LS number and date of birth." });
    const updated = await store.updateMemberPassword(member.id, password);
    await tryCreateAuditLogs([{
      memberId: updated.id,
      memberName: updated.name,
      action: "Member password reset",
      field: "memberPassword",
      oldValue: "Hidden",
      newValue: "Reset by member",
      ...auditActor({ id: updated.id, name: updated.name, role: "member" })
    }]);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/member-login" && req.method === "POST") {
    const body = asObject(await parseBody(req));
    const member = await store.findMemberByLogin(body.identifier, body.password);
    if (!member) return json(res, 401, { error: "Invalid member login or login not activated" });
    const token = crypto.randomBytes(24).toString("hex");
    memberSessions.set(token, { memberId: member.id, createdAt: Date.now() });
    return json(res, 200, { member: publicMember(member) }, {
      "Set-Cookie": `member_session=${token}; HttpOnly; SameSite=Lax; Path=/`
    });
  }

  if (pathname === "/api/member-logout" && req.method === "POST") {
    const token = getCookie(req, "member_session");
    if (token) memberSessions.delete(token);
    return json(res, 200, { ok: true }, { "Set-Cookie": "member_session=; Max-Age=0; Path=/" });
  }

  if (pathname === "/api/member-me" && req.method === "GET") {
    const member = await currentMember(req);
    if (!member) return json(res, 401, { error: "Member login required" });
    const auditLogs = await store.listAuditLogs({ id: member.id, role: "taluk", district: member.district, taluk: member.taluk }, {
      memberId: member.id,
      limit: 100
    });
    const presidentMessages = await store.listPresidentMessagesForMember(member);
    const talukTeam = await store.findTalukTeamContactForMember(member);
    const problems = await store.listMemberProblems({ ...member, role: "member" }, { limit: 100 });
    return json(res, 200, { member: publicMember(member), auditLogs, presidentMessages, talukTeam, problems });
  }

  if (pathname === "/api/member-problems" && req.method === "POST") {
    const member = await currentMember(req);
    if (!member) return json(res, 401, { error: "Member login required" });
    const body = asObject(await parseBody(req));
    const problem = await store.createMemberProblem(member, body);
    await tryCreateAuditLogs([{
      memberId: member.id,
      memberName: member.name,
      action: "Problem submitted",
      field: problem.category,
      oldValue: "",
      newValue: `${problem.subject}: ${problem.description}`,
      ...auditActor({ id: member.id, name: member.name, role: "member" })
    }]);
    return json(res, 201, { problem });
  }

  if (pathname === "/api/member-correction-request" && req.method === "POST") {
    const member = await currentMember(req);
    if (!member) return json(res, 401, { error: "Member login required" });
    const body = asObject(await parseBody(req));
    const reason = String(body.reason || "").trim();
    const requestedChanges = sanitizeCorrectionChanges(body.changes || {}, member);
    const fillsMissingData = Object.entries(requestedChanges).some(([field, value]) => {
      return !String(member[field] ?? "").trim() && String(value ?? "").trim();
    });
    if (member.status !== "Needs correction" && !fillsMissingData) {
      return json(res, 400, { error: "You can submit only missing data or details requested for correction" });
    }
    if (!reason) return json(res, 400, { error: "Reason is required" });
    if (!Object.keys(requestedChanges).length) return json(res, 400, { error: "Change at least one field before submitting" });
    return json(res, 201, {
      request: await store.createDataCorrectionRequest({
        memberId: member.id,
        memberName: member.name,
        requestedChanges,
        reason,
        requestedById: member.id,
        requestedByName: member.name,
        requestedByRole: "member"
      })
    });
  }

  if (pathname === "/api/member-change-password" && req.method === "POST") {
    const member = await currentMember(req);
    if (!member) return json(res, 401, { error: "Member login required" });
    const body = asObject(await parseBody(req));
    const currentPassword = String(body.currentPassword || "");
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (!(await store.verifyMemberPassword(member.id, currentPassword))) return json(res, 400, { error: "Current password is incorrect" });
    if (password.length < 6) return json(res, 400, { error: "New password must be at least 6 characters" });
    if (password !== confirmPassword) return json(res, 400, { error: "Passwords do not match" });
    const updated = await store.updateMemberPassword(member.id, password);
    await tryCreateAuditLogs([{
      memberId: updated.id,
      memberName: updated.name,
      action: "Member password changed",
      field: "memberPassword",
      oldValue: "Hidden",
      newValue: "Changed by member",
      ...auditActor({ id: updated.id, name: updated.name, role: "member" })
    }]);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const loginSession = currentLoginSession(req);
    if (loginSession?.session?.userSessionId) await store.endUserSession(loginSession.session.userSessionId);
    if (loginSession?.token) sessions.delete(loginSession.token);
    return json(res, 200, { ok: true }, { "Set-Cookie": "session=; Max-Age=0; Path=/" });
  }

  if (!user) return json(res, 401, { error: "Login required" });

  if (pathname === "/api/session-heartbeat" && req.method === "POST") {
    const loginSession = currentLoginSession(req);
    if (loginSession?.session?.userSessionId) await store.touchUserSession(loginSession.session.userSessionId);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/me" && req.method === "GET") {
    return json(res, 200, { user: publicUser(user) });
  }

  if (pathname === "/api/dashboard" && req.method === "GET") {
    return json(res, 200, await store.getDashboard(user));
  }

  if (pathname === "/api/session-analytics" && req.method === "GET") {
    if (!canViewSessionAnalytics(user)) return json(res, 403, { error: "Team time analytics access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listUserSessionStats(user, {
      search: url.searchParams.get("search") || "",
      role: url.searchParams.get("role") || "taluk",
      from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || ""
    }));
  }

  if (pathname === "/api/member-problems" && req.method === "GET") {
    if (!["admin", "state_president", "division", "district"].includes(user.role)) return json(res, 403, { error: "Member problems access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, {
      problems: await store.listMemberProblems(user, {
        search: (url.searchParams.get("search") || "").trim(),
        status: (url.searchParams.get("status") || "").trim(),
        limit: Number(url.searchParams.get("limit") || 200)
      })
    });
  }

  const memberProblemMatch = pathname.match(/^\/api\/member-problems\/([^/]+)$/);
  if (memberProblemMatch && req.method === "PUT") {
    if (!["admin", "state_president", "division", "district"].includes(user.role)) return json(res, 403, { error: "Leadership access required" });
    const body = asObject(await parseBody(req));
    const problem = await store.updateMemberProblem(user, memberProblemMatch[1], body);
    if (!problem) return json(res, 404, { error: "Problem not found or outside your area" });
    return json(res, 200, { problem });
  }

  if (pathname === "/api/admin/backup" && req.method === "GET") {
    requireAdmin(user);
    const backup = await store.createBackup(user);
    const date = new Date().toISOString().slice(0, 10);
    return send(res, 200, JSON.stringify(backup, null, 2), {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="klswa-backup-${date}.json"`
    });
  }

  if (pathname === "/api/admin/restore" && req.method === "POST") {
    requireAdmin(user);
    const body = asObject(await parseBody(req));
    if (String(body.adminPassword || "") !== String(user.password || "")) {
      return json(res, 403, { error: "Admin password confirmation failed" });
    }
    const backup = asObject(body.backup);
    const result = await store.restoreBackup(backup, user);
    return json(res, 200, { ok: true, result });
  }

  if (pathname === "/api/president-messages" && req.method === "GET") {
    if (!["admin", "state_president"].includes(user.role)) return json(res, 403, { error: "State President message access required" });
    return json(res, 200, { messages: await store.listPresidentMessages() });
  }

  if (pathname === "/api/president-messages" && req.method === "POST") {
    if (user.role !== "state_president") return json(res, 403, { error: "State President access required" });
    const body = asObject(await parseBody(req));
    const message = await store.createPresidentMessage({
      audience: body.audience,
      subject: body.subject,
      body: body.body,
      createdById: user.id,
      createdByName: user.name
    });
    return json(res, 201, { message });
  }

  if (pathname === "/api/team-chat" && req.method === "GET") {
    if (!canUseTeamChat(user)) return json(res, 403, { error: "Team chat access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, {
      messages: await store.listTeamChatMessages(user, Number(url.searchParams.get("limit") || 100))
    });
  }

  if (pathname === "/api/team-chat" && req.method === "POST") {
    if (!canUseTeamChat(user)) return json(res, 403, { error: "Team chat access required" });
    const body = asObject(await parseBody(req));
    return json(res, 201, { message: await store.createTeamChatMessage(user, body.body, { pinned: body.pinned === true || body.pinned === "true" || body.pinned === "on" }) });
  }

  if (pathname === "/api/members" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listMembers(user, {
      search: (url.searchParams.get("search") || "").trim(),
      district: url.searchParams.get("district") || "",
      taluk: url.searchParams.get("taluk") || "",
      status: url.searchParams.get("status") || "",
      gender: url.searchParams.get("gender") || "",
      batchYear: url.searchParams.get("batchYear") || "",
      missingOnly: url.searchParams.get("missingOnly") === "true",
      page: Math.max(1, Number(url.searchParams.get("page") || 1)),
      size: Math.min(100, Math.max(10, Number(url.searchParams.get("size") || 25)))
    }));
  }

  if (pathname === "/api/exports/members" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rows = await store.exportMembers(user, {
      search: (url.searchParams.get("search") || "").trim(),
      district: url.searchParams.get("district") || "",
      taluk: url.searchParams.get("taluk") || "",
      status: url.searchParams.get("status") || "",
      gender: url.searchParams.get("gender") || "",
      batchYear: url.searchParams.get("batchYear") || "",
      missingOnly: url.searchParams.get("missingOnly") === "true"
    });
    return csvDownload(res, "surveyor-members.csv", [
      "name", "lsNumber", "loginId", "district", "taluk", "gender",
      "dateOfBirth", "age", "phoneNumber", "qualification", "batchYear", "status",
      "remarks"
    ], rows);
  }

  if (pathname === "/api/missing-data" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listMissingDataMembers(user, {
      search: (url.searchParams.get("search") || "").trim(),
      limit: Number(url.searchParams.get("limit") || 200)
    }));
  }

  if (pathname === "/api/exports/corrections" && req.method === "GET") {
    if (!["admin", "state_president", "division", "district"].includes(user.role)) return json(res, 403, { error: "Export access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rows = await store.exportTalukCorrections(user, {
      search: (url.searchParams.get("search") || "").trim(),
      district: url.searchParams.get("district") || ""
    });
    return csvDownload(res, "pending-taluk-corrections.csv", [
      "name", "lsNumber", "loginId", "rawDistrict", "rawTaluk",
      "suggestedDistrict", "suggestedTaluk", "phoneNumber", "qualification"
    ], rows);
  }

  if (pathname === "/api/members" && req.method === "POST") {
    if (!canCreateMembers(user)) return json(res, 403, { error: "This login can review records but cannot create members" });
    const body = await parseBody(req);
    const member = normalizeMember(body);
    if (user.role !== "admin") {
      member.district = user.district || member.district;
      member.taluk = user.taluk;
    }
    const validation = assertMember(member);
    if (validation) return json(res, 400, { error: validation });
    const created = await store.createMember(member);
    await store.createAuditLogs(auditDiffs({ action: "Created", after: created, actor: user }));
    return json(res, 201, { member: created });
  }

  const memberMatch = pathname.match(/^\/api\/members\/([^/]+)$/);
  if (memberMatch && req.method === "PUT") {
    requireAdmin(user);
    const member = await store.getMember(memberMatch[1]);
    if (!member) return json(res, 404, { error: "Member not found" });
    if (!store.memberVisibleTo(user, member)) return json(res, 403, { error: "This member is outside your taluk" });
    const body = await parseBody(req);
    const next = normalizeMember(body, member);
    if (user.role !== "admin") {
      next.district = member.district;
      next.taluk = member.taluk;
    }
    const validation = assertMember(next);
    if (validation) return json(res, 400, { error: validation });
    const updated = await store.updateMember(member.id, next);
    await store.createAuditLogs(auditDiffs({ action: "Updated", before: member, after: updated, actor: user }));
    return json(res, 200, { member: updated });
  }

  if (memberMatch && req.method === "DELETE") {
    requireAdmin(user);
    const member = await store.getMember(memberMatch[1]);
    const deleted = await store.deleteMember(memberMatch[1]);
    if (!deleted) return json(res, 404, { error: "Member not found" });
    await store.createAuditLogs([{
      memberId: member?.id || memberMatch[1],
      memberName: member?.name || "",
      action: "Deleted",
      field: "record",
      oldValue: member ? `${member.name} / ${member.lsNumber} / ${member.district} / ${member.taluk}` : "",
      newValue: "",
      ...auditActor(user)
    }]);
    return json(res, 200, { ok: true });
  }

  const statusMatch = pathname.match(/^\/api\/members\/([^/]+)\/status$/);
  if (statusMatch && req.method === "PUT") {
    if (!canReviewMembers(user)) return json(res, 403, { error: "Status review access required" });
    const member = await store.getMember(statusMatch[1]);
    if (!member) return json(res, 404, { error: "Member not found" });
    if (!store.memberVisibleTo(user, member)) return json(res, 403, { error: "This member is outside your area" });
    const body = await parseBody(req);
    const status = String(body.status || "").trim();
    const remarks = String(body.remarks || "").trim();
    if (["Rejected", "Needs correction"].includes(status) && !remarks) {
      return json(res, 400, { error: "Reason is required for rejection or correction" });
    }
    const updated = await store.updateMemberStatus(member.id, status, remarks);
    if (!updated) return json(res, 404, { error: "Member not found" });
    await tryCreateAuditLogs(auditDiffs({ action: "Status changed", before: member, after: updated, actor: user }));
    return json(res, 200, { member: updated });
  }

  const loginControlMatch = pathname.match(/^\/api\/members\/([^/]+)\/login-control$/);
  if (loginControlMatch && req.method === "PUT") {
    requireAdmin(user);
    const member = await store.getMember(loginControlMatch[1]);
    if (!member) return json(res, 404, { error: "Member not found" });
    const body = asObject(await parseBody(req));
    const password = String(body.password || "").trim();
    if (password && password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters" });
    const updated = await store.updateMemberLoginControl(member.id, {
      active: body.active === true || body.active === "true" || body.active === "on",
      password
    });
    await tryCreateAuditLogs([{
      memberId: updated.id,
      memberName: updated.name,
      action: "Member login control",
      field: "memberLoginActive",
      oldValue: member.memberLoginActive ? "Active" : "Disabled",
      newValue: updated.memberLoginActive ? "Active" : "Disabled",
      ...auditActor(user)
    }, ...(password ? [{
      memberId: updated.id,
      memberName: updated.name,
      action: "Member login control",
      field: "memberPassword",
      oldValue: "Hidden",
      newValue: "Reset by admin",
      ...auditActor(user)
    }] : [])]);
    return json(res, 200, { member: updated });
  }

  const memberNotesMatch = pathname.match(/^\/api\/members\/([^/]+)\/notes$/);
  if (memberNotesMatch && req.method === "GET") {
    const data = await store.listMemberNotes(user, memberNotesMatch[1]);
    if (!data) return json(res, 404, { error: "Member not found or outside your area" });
    return json(res, 200, data);
  }

  if (memberNotesMatch && req.method === "POST") {
    if (!["admin", "state_president", "division", "district", "taluk"].includes(user.role)) return json(res, 403, { error: "Member notes access required" });
    const body = asObject(await parseBody(req));
    const data = await store.createMemberNote(user, memberNotesMatch[1], body);
    if (!data) return json(res, 404, { error: "Member not found or outside your area" });
    await tryCreateAuditLogs([{
      memberId: data.member.id,
      memberName: data.member.name,
      action: "Member note added",
      field: data.note.noteType,
      oldValue: "",
      newValue: data.note.note,
      ...auditActor(user)
    }]);
    return json(res, 201, data);
  }

  if (pathname === "/api/audit-logs" && req.method === "GET") {
    if (!["admin", "state_president", "taluk"].includes(user.role)) return json(res, 403, { error: "Activity log access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listAuditLogs(user, {
      search: (url.searchParams.get("search") || "").trim(),
      editor: (url.searchParams.get("editor") || "").trim(),
      action: (url.searchParams.get("action") || "").trim(),
      from: (url.searchParams.get("from") || "").trim(),
      to: (url.searchParams.get("to") || "").trim(),
      memberId: (url.searchParams.get("memberId") || "").trim(),
      limit: Number(url.searchParams.get("limit") || 100)
    }));
  }

  if (pathname === "/api/exports/audit-logs" && req.method === "GET") {
    if (!["admin", "state_president", "taluk"].includes(user.role)) return json(res, 403, { error: "Activity log export access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rows = await store.listAuditLogs(user, {
      search: (url.searchParams.get("search") || "").trim(),
      editor: (url.searchParams.get("editor") || "").trim(),
      action: (url.searchParams.get("action") || "").trim(),
      from: (url.searchParams.get("from") || "").trim(),
      to: (url.searchParams.get("to") || "").trim(),
      memberId: (url.searchParams.get("memberId") || "").trim(),
      limit: 5000
    });
    return csvDownload(res, "audit-history.csv", [
      "createdAt", "memberName", "action", "field", "oldValue", "newValue", "actorName", "actorRole"
    ], rows);
  }

  if (pathname === "/api/duplicates" && req.method === "GET") {
    if (!["admin", "state_president"].includes(user.role)) return json(res, 403, { error: "Duplicate dashboard access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listDuplicateGroups({
      type: (url.searchParams.get("type") || "").trim(),
      search: (url.searchParams.get("search") || "").trim(),
      limit: Number(url.searchParams.get("limit") || 200)
    }));
  }

  if (pathname === "/api/data-correction-requests" && req.method === "GET") {
    if (!["admin", "state_president", "division", "taluk"].includes(user.role)) return json(res, 403, { error: "Correction request access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, {
      requests: await store.listDataCorrectionRequests(user, {
        search: (url.searchParams.get("search") || "").trim()
      })
    });
  }

  if (pathname === "/api/data-correction-requests" && req.method === "POST") {
    if (user.role !== "taluk") return json(res, 403, { error: "Taluk team can submit correction requests" });
    const body = asObject(await parseBody(req));
    const member = await store.getMember(String(body.memberId || ""));
    if (!member) return json(res, 404, { error: "Member not found" });
    if (!store.memberVisibleTo(user, member)) return json(res, 403, { error: "This member is outside your taluk" });
    const requestedChanges = sanitizeCorrectionChanges(body.changes || {}, member);
    if (!Object.keys(requestedChanges).length) return json(res, 400, { error: "Enter at least one changed value" });
    const reason = String(body.reason || "").trim();
    if (!reason) return json(res, 400, { error: "Reason is required" });
    return json(res, 201, {
      request: await store.createDataCorrectionRequest({
        memberId: member.id,
        memberName: member.name,
        requestedChanges,
        reason,
        requestedById: user.id,
        requestedByName: user.name,
        requestedByRole: user.role
      })
    });
  }

  const dataCorrectionMatch = pathname.match(/^\/api\/data-correction-requests\/([^/]+)$/);
  if (dataCorrectionMatch && req.method === "PUT") {
    if (!["admin", "division"].includes(user.role)) return json(res, 403, { error: "Admin or division approval access required" });
    const target = await store.getDataCorrectionRequest(dataCorrectionMatch[1]);
    if (!target) return json(res, 404, { error: "Request not found" });
    if (target.status !== "Pending") return json(res, 400, { error: "Request is already reviewed" });
    const member = await store.getMember(target.memberId);
    if (!member) return json(res, 404, { error: "Member not found" });
    if (!store.memberVisibleTo(user, member)) return json(res, 403, { error: "This correction request is outside your division" });
    const body = asObject(await parseBody(req));
    const status = String(body.status || "").trim();
    const adminRemarks = String(body.adminRemarks || "").trim();
    if (status === "Approved") {
      const next = normalizeMember({ ...member, ...asObject(target.requestedChanges) }, member);
      const validation = assertMember(next);
      if (validation) return json(res, 400, { error: validation });
      const updated = await store.updateMember(member.id, next);
      await store.createAuditLogs(auditDiffs({ action: "Correction approved", before: member, after: updated, actor: user }));
      return json(res, 200, {
        request: await store.updateDataCorrectionRequest(target.id, {
          status: "Approved",
          adminRemarks: adminRemarks || `Approved by ${user.role === "division" ? "division team" : "admin"}`,
          reviewedById: user.id,
          reviewedByName: user.name
        }),
        member: updated
      });
    }
    if (status === "Rejected") {
      return json(res, 200, {
        request: await store.updateDataCorrectionRequest(target.id, {
          status: "Rejected",
          adminRemarks: adminRemarks || `Rejected by ${user.role === "division" ? "division team" : "admin"}`,
          reviewedById: user.id,
          reviewedByName: user.name
        })
      });
    }
    return json(res, 400, { error: "Use Approved or Rejected" });
  }

  if (pathname === "/api/users" && req.method === "GET") {
    if (!canViewUsers(user)) return json(res, 403, { error: "User list access required" });
    const dashboard = await store.getDashboard(user);
    const users = await store.listUsers(user);
    return json(res, 200, { users: users.map(publicUser), lists: dashboard.lists });
  }

  if (pathname === "/api/join-links" && req.method === "POST") {
    requireAdmin(user);
    const body = await parseBody(req);
    const district = canonicalDistrict(body.district || "");
    const taluk = String(body.taluk || "").trim();
    if (!district || !taluk) return json(res, 400, { error: "District and taluk are required" });
    if (!isMasterTaluk(district, taluk)) return json(res, 400, { error: "Select a valid taluk for this district" });
    const params = new URLSearchParams({ district, taluk });
    return json(res, 201, {
      link: `/taluk-join.html?${params.toString()}`,
      scope: { district, taluk, title: `${taluk} Taluk Team Join Form` }
    });
  }

  if (pathname === "/api/taluk-team-requests" && req.method === "GET") {
    if (!canReviewTeamRequests(user)) return json(res, 403, { error: "Taluk team approval access required" });
    return json(res, 200, { requests: await store.listTeamRequests(user) });
  }

  const teamRequestMatch = pathname.match(/^\/api\/taluk-team-requests\/([^/]+)$/);
  if (teamRequestMatch && req.method === "PUT") {
    if (!canReviewTeamRequests(user)) return json(res, 403, { error: "Taluk team approval access required" });
    const target = await store.getTeamRequest(teamRequestMatch[1]);
    if (!target) return json(res, 404, { error: "Request not found" });
    if (!canSeeTeamRequest(user, target)) return json(res, 403, { error: "This request is outside your division" });
    const body = await parseBody(req);
    const status = String(body.status || "").trim();
    const remarks = String(body.remarks || "").trim();
    const reviewer = user.role === "division" ? "division team" : "admin";
    if (status === "Approved") {
      if (await store.usernameExists(target.requestedUsername)) return json(res, 409, { error: "This User ID is already used" });
      if (await store.talukLoginExists(target.district, target.taluk)) {
        return json(res, 409, { error: "This taluk already has a technical team login" });
      }
      const newUser = await store.createUser({
        username: target.requestedUsername,
        password: target.requestedPassword,
        name: target.name,
        role: "taluk",
        district: target.district,
        taluk: target.taluk,
        active: true
      });
      const request = await store.updateTeamRequest(target.id, {
        status: "Approved",
        remarks: remarks || `Login activated by ${reviewer}`,
        userId: newUser.id
      });
      return json(res, 200, { request, user: publicUser(newUser) });
    }
    if (status === "Rejected") {
      return json(res, 200, {
        request: await store.updateTeamRequest(target.id, {
          status: "Rejected",
          remarks: remarks || `Rejected by ${reviewer}`
        })
      });
    }
    return json(res, 400, { error: "Use Approved or Rejected" });
  }

  if (pathname === "/api/taluk-corrections" && req.method === "GET") {
    if (!canCorrectTaluks(user)) return json(res, 403, { error: "Taluk correction access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listTalukCorrections({
      search: (url.searchParams.get("search") || "").trim(),
      district: url.searchParams.get("district") || "",
      page: Math.max(1, Number(url.searchParams.get("page") || 1)),
      size: Math.min(100, Math.max(10, Number(url.searchParams.get("size") || 50))),
      user
    }));
  }

  const correctionMatch = pathname.match(/^\/api\/taluk-corrections\/([^/]+)$/);
  if (correctionMatch && req.method === "PUT") {
    if (!canCorrectTaluks(user)) return json(res, 403, { error: "Taluk correction access required" });
    const body = await parseBody(req);
    const before = await store.getMember(correctionMatch[1]);
    if (!before) return json(res, 404, { error: "Member not found" });
    if (user.role === "division") {
      const districts = divisionDistricts(user.district);
      const currentDistrict = canonicalDistrict(before.district);
      const nextDistrict = canonicalDistrict(body.district || "");
      if (!districts.includes(currentDistrict) || !districts.includes(nextDistrict)) {
        return json(res, 403, { error: "This correction is outside your division" });
      }
    }
    const member = await store.correctMemberTaluk(correctionMatch[1], body.district, body.taluk);
    if (!member) return json(res, 404, { error: "Member not found" });
    await store.createAuditLogs(auditDiffs({ action: "Taluk corrected", before, after: member, actor: user }));
    return json(res, 200, { member });
  }

  if (pathname === "/api/users" && req.method === "POST") {
    requireAdmin(user);
    const body = await parseBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    if (!username || !password) return json(res, 400, { error: "Username and password are required" });
    if (await store.usernameExists(username)) return json(res, 409, { error: "Username already exists" });
    const newUser = {
      username,
      password,
      name: String(body.name || username).trim(),
      role: ["admin", "state_president", "division", "district", "taluk"].includes(body.role) ? body.role : "taluk",
      district: body.role === "division" ? canonicalDivision(body.district || "") : String(body.district || "").trim(),
      taluk: body.role === "taluk" ? String(body.taluk || "").trim() : "",
      active: body.active !== false
    };
    if (newUser.role === "taluk" && !newUser.taluk) return json(res, 400, { error: "Taluk user must be assigned a taluk" });
    if (newUser.role === "district" && !newUser.district) return json(res, 400, { error: "District President must be assigned a district" });
    if (newUser.role === "division" && !divisionDistricts(newUser.district).length) return json(res, 400, { error: "Division team must be assigned a valid division" });
    if (newUser.role === "taluk" && await store.talukLoginExists(newUser.district, newUser.taluk)) {
      return json(res, 409, { error: "This taluk already has a technical team login" });
    }
    return json(res, 201, { user: publicUser(await store.createUser(newUser)) });
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && req.method === "PUT") {
    requireAdmin(user);
    const target = await store.getUserById(userMatch[1]);
    if (!target) return json(res, 404, { error: "User not found" });
    const body = await parseBody(req);
    const next = {
      name: String(body.name || target.name).trim(),
      role: ["admin", "state_president", "division", "district", "taluk"].includes(body.role) ? body.role : "taluk",
      district: body.role === "division" ? canonicalDivision(body.district || "") : String(body.district || "").trim(),
      taluk: body.role === "taluk" ? String(body.taluk || "").trim() : "",
      active: body.active !== false
    };
    if (next.role === "division" && !divisionDistricts(next.district).length) return json(res, 400, { error: "Division team must be assigned a valid division" });
    if (next.role === "taluk" && await store.talukLoginExists(next.district, next.taluk, target.id)) {
      return json(res, 409, { error: "This taluk already has a technical team login" });
    }
    if (body.password) next.password = String(body.password);
    if (target.username === "admin") {
      next.role = "admin";
      next.active = true;
    }
    return json(res, 200, { user: publicUser(await store.updateUser(target.id, next)) });
  }

  if (userMatch && req.method === "DELETE") {
    requireAdmin(user);
    if (userMatch[1] === user.id) return json(res, 400, { error: "You cannot delete your current login" });
    const deleted = await store.deleteUser(userMatch[1]);
    if (!deleted) return json(res, 404, { error: "User not found" });
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Not found" });
}

function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function publicMember(member) {
  const {
    memberPassword,
    password,
    sourceRow,
    ...safe
  } = member || {};
  return safe;
}

async function staticFile(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
  if (!fssync.existsSync(resolved)) return send(res, 404, "Not found");
  const ext = path.extname(resolved).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[ext] || "application/octet-stream";
  const body = await fs.readFile(resolved);
  send(res, 200, body, { "Content-Type": type });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await api(req, res, url.pathname);
    } else {
      await staticFile(req, res, url.pathname);
    }
  } catch (error) {
    if ([
      "/api/public-membership",
      "/api/public-status",
      "/api/member-activate",
      "/api/member-login",
      "/api/member-me",
      "/api/member-correction-request",
      "/api/member-forgot-password",
      "/api/member-change-password"
    ].includes(url?.pathname)) {
      console.error(`${url.pathname} failed:`, error);
      const publicMessage = url.pathname === "/api/public-status"
        ? "Could not check status. Please verify the phone number or LS number and try again."
        : url.pathname.startsWith("/api/member")
          ? "Member request failed. Please check the details and try again."
        : "Could not submit membership. Please check all fields and try again.";
      return json(res, error.status || 500, { error: error.status ? error.message : publicMessage });
    }
    json(res, error.status || 500, { error: error.message || "Server error" });
  }
});

store.initDb().then(() => {
  server.listen(PORT, () => {
    const storage = store.hasPostgres ? "PostgreSQL" : "JSON file";
    console.log(`Surveyor taluk admin app running at http://localhost:${PORT} using ${storage}`);
  });
}).catch((error) => {
  console.error("Database startup failed:", error);
  process.exit(1);
});
