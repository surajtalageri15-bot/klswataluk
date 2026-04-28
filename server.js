const http = require("http");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./db");
const { canonicalDistrict, isMasterTaluk, masterLists } = require("./taluks");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const sessions = new Map();

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

function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    const error = new Error("Admin access required");
    error.status = 403;
    throw error;
  }
}

function canViewUsers(user) {
  return user && (user.role === "admin" || user.role === "district");
}

function canEditMembers(user) {
  return user && (user.role === "admin" || user.role === "taluk");
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
  const changes = {};
  for (const field of correctionRequestFields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const next = String(body[field] ?? "").trim();
    if (next !== valueForAudit(member[field]).trim()) changes[field] = next;
  }
  return changes;
}

async function api(req, res, pathname) {
  const user = await currentUser(req);

  if (pathname === "/api/public-config" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const scope = joinScopeFromParams(url.searchParams);
    return json(res, 200, { lists: masterLists(), scope });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await parseBody(req);
    const found = await store.findUserByLogin(body.username, body.password);
    if (!found) return json(res, 401, { error: "Invalid username or password" });
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { userId: found.id, createdAt: Date.now() });
    return json(res, 200, { user: publicUser(found) }, {
      "Set-Cookie": `session=${token}; HttpOnly; SameSite=Lax; Path=/`
    });
  }

  if (pathname === "/api/public-membership" && req.method === "POST") {
    const body = await parseBody(req);
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
    await store.createAuditLogs(auditDiffs({ action: "Created", after: created, actor: null }));
    return json(res, 201, { ok: true, member: created });
  }

  if (pathname === "/api/public-taluk-team-request" && req.method === "POST") {
    const requestBody = normalizeTeamRequest(await parseBody(req));
    const validation = assertTeamRequest(requestBody);
    if (validation) return json(res, 400, { error: validation });
    if (await store.usernameExists(requestBody.requestedUsername)) return json(res, 409, { error: "This User ID is already used" });
    const duplicate = await store.findTeamRequestDuplicate(requestBody);
    if (duplicate) return json(res, 409, { error: "A pending request already exists for this phone number or User ID" });
    return json(res, 201, { ok: true, request: await store.createTeamRequest(requestBody) });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const token = getCookie(req, "session");
    if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, { "Set-Cookie": "session=; Max-Age=0; Path=/" });
  }

  if (!user) return json(res, 401, { error: "Login required" });

  if (pathname === "/api/me" && req.method === "GET") {
    return json(res, 200, { user: publicUser(user) });
  }

  if (pathname === "/api/dashboard" && req.method === "GET") {
    return json(res, 200, await store.getDashboard(user));
  }

  if (pathname === "/api/members" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listMembers(user, {
      search: (url.searchParams.get("search") || "").trim(),
      district: url.searchParams.get("district") || "",
      taluk: url.searchParams.get("taluk") || "",
      page: Math.max(1, Number(url.searchParams.get("page") || 1)),
      size: Math.min(100, Math.max(10, Number(url.searchParams.get("size") || 25)))
    }));
  }

  if (pathname === "/api/exports/members" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rows = await store.exportMembers(user, {
      search: (url.searchParams.get("search") || "").trim(),
      district: url.searchParams.get("district") || "",
      taluk: url.searchParams.get("taluk") || ""
    });
    return csvDownload(res, "surveyor-members.csv", [
      "name", "lsNumber", "loginId", "district", "taluk", "gender",
      "dateOfBirth", "age", "phoneNumber", "qualification", "batchYear", "status",
      "remarks"
    ], rows);
  }

  if (pathname === "/api/exports/corrections" && req.method === "GET") {
    if (!["admin", "district"].includes(user.role)) return json(res, 403, { error: "Export access required" });
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
    if (!canEditMembers(user)) return json(res, 403, { error: "District President access is view-only" });
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
    if (!canEditMembers(user)) return json(res, 403, { error: "District President access is view-only" });
    const member = await store.getMember(statusMatch[1]);
    if (!member) return json(res, 404, { error: "Member not found" });
    if (!store.memberVisibleTo(user, member)) return json(res, 403, { error: "This member is outside your area" });
    const body = await parseBody(req);
    const updated = await store.updateMemberStatus(member.id, String(body.status || ""), String(body.remarks || ""));
    await store.createAuditLogs(auditDiffs({ action: "Status changed", before: member, after: updated, actor: user }));
    return json(res, 200, { member: updated });
  }

  if (pathname === "/api/audit-logs" && req.method === "GET") {
    requireAdmin(user);
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listAuditLogs(user, {
      search: (url.searchParams.get("search") || "").trim(),
      limit: Number(url.searchParams.get("limit") || 100)
    }));
  }

  if (pathname === "/api/duplicates" && req.method === "GET") {
    requireAdmin(user);
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listDuplicateGroups({
      type: (url.searchParams.get("type") || "").trim(),
      search: (url.searchParams.get("search") || "").trim(),
      limit: Number(url.searchParams.get("limit") || 200)
    }));
  }

  if (pathname === "/api/data-correction-requests" && req.method === "GET") {
    if (!["admin", "taluk"].includes(user.role)) return json(res, 403, { error: "Correction request access required" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, {
      requests: await store.listDataCorrectionRequests(user, {
        search: (url.searchParams.get("search") || "").trim()
      })
    });
  }

  if (pathname === "/api/data-correction-requests" && req.method === "POST") {
    if (user.role !== "taluk") return json(res, 403, { error: "Taluk team can submit correction requests" });
    const body = await parseBody(req);
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
    requireAdmin(user);
    const target = await store.getDataCorrectionRequest(dataCorrectionMatch[1]);
    if (!target) return json(res, 404, { error: "Request not found" });
    if (target.status !== "Pending") return json(res, 400, { error: "Request is already reviewed" });
    const body = await parseBody(req);
    const status = String(body.status || "").trim();
    const adminRemarks = String(body.adminRemarks || "").trim();
    if (status === "Approved") {
      const member = await store.getMember(target.memberId);
      if (!member) return json(res, 404, { error: "Member not found" });
      const next = normalizeMember({ ...member, ...target.requestedChanges }, member);
      const validation = assertMember(next);
      if (validation) return json(res, 400, { error: validation });
      const updated = await store.updateMember(member.id, next);
      await store.createAuditLogs(auditDiffs({ action: "Correction approved", before: member, after: updated, actor: user }));
      return json(res, 200, {
        request: await store.updateDataCorrectionRequest(target.id, {
          status: "Approved",
          adminRemarks: adminRemarks || "Approved by admin",
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
          adminRemarks: adminRemarks || "Rejected by admin",
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
    requireAdmin(user);
    return json(res, 200, { requests: await store.listTeamRequests() });
  }

  const teamRequestMatch = pathname.match(/^\/api\/taluk-team-requests\/([^/]+)$/);
  if (teamRequestMatch && req.method === "PUT") {
    requireAdmin(user);
    const target = await store.getTeamRequest(teamRequestMatch[1]);
    if (!target) return json(res, 404, { error: "Request not found" });
    const body = await parseBody(req);
    const status = String(body.status || "").trim();
    const remarks = String(body.remarks || "").trim();
    if (status === "Approved") {
      if (await store.usernameExists(target.requestedUsername)) return json(res, 409, { error: "This User ID is already used" });
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
        remarks: remarks || "Login activated by admin",
        userId: newUser.id
      });
      return json(res, 200, { request, user: publicUser(newUser) });
    }
    if (status === "Rejected") {
      return json(res, 200, {
        request: await store.updateTeamRequest(target.id, {
          status: "Rejected",
          remarks: remarks || "Rejected by admin"
        })
      });
    }
    return json(res, 400, { error: "Use Approved or Rejected" });
  }

  if (pathname === "/api/taluk-corrections" && req.method === "GET") {
    requireAdmin(user);
    const url = new URL(req.url, `http://${req.headers.host}`);
    return json(res, 200, await store.listTalukCorrections({
      search: (url.searchParams.get("search") || "").trim(),
      district: url.searchParams.get("district") || "",
      page: Math.max(1, Number(url.searchParams.get("page") || 1)),
      size: Math.min(100, Math.max(10, Number(url.searchParams.get("size") || 50)))
    }));
  }

  const correctionMatch = pathname.match(/^\/api\/taluk-corrections\/([^/]+)$/);
  if (correctionMatch && req.method === "PUT") {
    requireAdmin(user);
    const body = await parseBody(req);
    const before = await store.getMember(correctionMatch[1]);
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
      role: ["admin", "district", "taluk"].includes(body.role) ? body.role : "taluk",
      district: String(body.district || "").trim(),
      taluk: body.role === "taluk" ? String(body.taluk || "").trim() : "",
      active: body.active !== false
    };
    if (newUser.role === "taluk" && !newUser.taluk) return json(res, 400, { error: "Taluk user must be assigned a taluk" });
    if (newUser.role === "district" && !newUser.district) return json(res, 400, { error: "District President must be assigned a district" });
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
      role: ["admin", "district", "taluk"].includes(body.role) ? body.role : "taluk",
      district: String(body.district || "").trim(),
      taluk: body.role === "taluk" ? String(body.taluk || "").trim() : "",
      active: body.active !== false
    };
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
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await api(req, res, url.pathname);
    } else {
      await staticFile(req, res, url.pathname);
    }
  } catch (error) {
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
