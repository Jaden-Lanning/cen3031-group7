import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
const { app } = await import("../server.ts");
const { db } = await import("../src/prisma/db.ts");

const adminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherAdminId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const missingId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const listPath = "/api/admin/users";
const rolePath = "/api/admin/users/:id/role";
const safeSelect = { id: true, name: true, email: true, role: true, createdAt: true };
const originals = { findUnique: db.user.findUnique, findMany: db.user.findMany, update: db.user.update };
let users;

const selectFields = (row, select) => row ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : null;

beforeEach(() => {
  users = [
    { id: adminId, name: "Admin", email: "admin@example.com", role: "admin" },
    { id: otherAdminId, name: "Other Admin", email: "other@example.com", role: "admin" },
    { id: userId, name: "Student", email: "student@example.com", role: "user" },
  ].map((user) => ({ ...user, createdAt: new Date("2026-01-01"), passwordHash: "secret-password-hash", attributes: { private: "secret-attributes" } }));
  db.user.findUnique = mock.fn(async ({ where, select }) => selectFields(users.find((user) => user.id === where.id), select));
  db.user.findMany = mock.fn(async ({ select }) => users.map((user) => selectFields(user, select)));
  db.user.update = mock.fn(async ({ where, data, select }) => {
    const user = users.find((candidate) => candidate.id === where.id);
    if (!user) throw Object.assign(new Error("Missing user"), { code: "P2025" });
    Object.assign(user, data);
    return selectFields(user, select);
  });
});

afterEach(() => {
  db.user.findUnique = originals.findUnique;
  db.user.findMany = originals.findMany;
  db.user.update = originals.update;
});

async function request(method, path, { actorId = adminId, targetId = userId, body = {}, sessionRole = "admin" } = {}) {
  const route = app.router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { session: { userId: actorId, role: sessionRole }, params: { id: targetId }, body };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  for (const layer of route.stack) {
    let nextCalled = false;
    await layer.handle(req, res, () => { nextCalled = true; });
    if (!nextCalled) break;
  }
  return res;
}

test("both admin endpoints return 401 without a session user", async () => {
  assert.equal((await request("get", listPath, { actorId: null })).statusCode, 401);
  assert.equal((await request("patch", rolePath, { actorId: null, body: { role: "admin" } })).statusCode, 401);
  assert.equal(db.user.findUnique.mock.callCount(), 0);
  assert.equal(db.user.findMany.mock.callCount(), 0);
  assert.equal(db.user.update.mock.callCount(), 0);
});

test("both admin endpoints return 403 to a normal user despite a forged session role", async () => {
  assert.equal((await request("get", listPath, { actorId: userId })).statusCode, 403);
  assert.equal((await request("patch", rolePath, { actorId: userId, targetId: userId, body: { role: "admin" } })).statusCode, 403);
  assert.equal(db.user.findMany.mock.callCount(), 0);
  assert.equal(db.user.update.mock.callCount(), 0);
  assert.equal(users.find((user) => user.id === userId).role, "user");
});

test("authorization accepts only the exact database role admin", async () => {
  for (const role of ["Admin", "administrator", "user", "", null]) {
    users[0].role = role;
    assert.equal((await request("get", listPath)).statusCode, 403);
    assert.equal((await request("patch", rolePath, { body: { role: "admin" } })).statusCode, 403);
  }
});

test("a session whose user no longer exists receives 401", async () => {
  assert.equal((await request("get", listPath, { actorId: missingId })).statusCode, 401);
  assert.equal((await request("patch", rolePath, { actorId: missingId, body: { role: "admin" } })).statusCode, 401);
  assert.equal(db.user.update.mock.callCount(), 0);
});

test("an admin can list users with only safe fields and no password hashes or attributes", async () => {
  const response = await request("get", listPath, { sessionRole: "user" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.users.length, 3);
  for (const user of response.body.users) {
    assert.deepEqual(Object.keys(user).sort(), Object.keys(safeSelect).sort());
    assert.equal(user.passwordHash, undefined);
    assert.equal(user.attributes, undefined);
  }
  assert.equal(JSON.stringify(response.body).includes("secret"), false);
  assert.deepEqual(db.user.findMany.mock.calls[0].arguments[0].select, safeSelect);
  assert.deepEqual(db.user.findUnique.mock.calls[0].arguments[0], { where: { id: adminId }, select: { id: true, role: true } });
});

test("the current database role is checked again on every admin API request", async () => {
  assert.equal((await request("get", listPath)).statusCode, 200);
  users[0].role = "user";
  assert.equal((await request("get", listPath)).statusCode, 403);
  assert.equal((await request("patch", rolePath, { body: { role: "admin" } })).statusCode, 403);
  assert.equal(db.user.findUnique.mock.callCount(), 3);
  assert.equal(db.user.findMany.mock.callCount(), 1);
  assert.equal(db.user.update.mock.callCount(), 0);
});

test("an admin can promote another user and receives only safe public user information", async () => {
  const before = structuredClone(users[2]);
  const response = await request("patch", rolePath, { body: { role: "admin" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.id, userId);
  assert.equal(response.body.user.role, "admin");
  assert.deepEqual(Object.keys(response.body.user).sort(), Object.keys(safeSelect).sort());
  assert.deepEqual(users[2], { ...before, role: "admin" });
  assert.deepEqual(db.user.update.mock.calls[0].arguments[0], { where: { id: userId }, data: { role: "admin" }, select: safeSelect });
});

test("an admin can demote another admin to user", async () => {
  const response = await request("patch", rolePath, { targetId: otherAdminId, body: { role: "user" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.role, "user");
  assert.equal(users[1].role, "user");
  assert.equal(users[0].role, "admin");
});

test("role updates reject unsupported roles without writing", async () => {
  for (const role of [undefined, null, "", "Admin", "administrator", " user ", true, 1, [], {}]) {
    assert.equal((await request("patch", rolePath, { body: { role } })).statusCode, 400);
  }
  assert.equal((await request("patch", rolePath, { body: null })).statusCode, 400);
  assert.equal(db.user.update.mock.callCount(), 0);
});

test("role updates reject malformed target user IDs without writing", async () => {
  for (const targetId of ["", "invalid", "123", "../../user"]) {
    assert.equal((await request("patch", rolePath, { targetId, body: { role: "admin" } })).statusCode, 400);
  }
  assert.equal(db.user.update.mock.callCount(), 0);
});

test("a valid but nonexistent target user receives 404", async () => {
  const response = await request("patch", rolePath, { targetId: missingId, body: { role: "admin" } });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { message: "User not found" });
});

test("an admin cannot change their own role, even with an uppercase UUID", async () => {
  for (const targetId of [adminId, adminId.toUpperCase()]) {
    for (const role of ["user", "admin"]) {
      const response = await request("patch", rolePath, { targetId, body: { role } });
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.message, "You cannot change your own role");
    }
  }
  assert.equal(db.user.update.mock.callCount(), 0);
  assert.equal(users[0].role, "admin");
});

test("a normal user cannot choose another user or forge request fields to gain admin access", async () => {
  const response = await request("patch", rolePath, {
    actorId: userId, targetId: userId,
    body: { role: "admin", userId: adminId, session: { userId: adminId }, isAdmin: true },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(db.user.update.mock.callCount(), 0);
});

test("role management ignores attempts to change passwords, identity, and other user fields", async () => {
  const before = structuredClone(users[2]);
  const response = await request("patch", rolePath, {
    body: { role: "admin", id: adminId, passwordHash: "changed", email: "changed@example.com", attributes: {} },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(users[2], { ...before, role: "admin" });
  assert.equal(response.body.user.passwordHash, undefined);
});

test("authorization database failures deny access without exposing private information", async (context) => {
  context.mock.method(console, "error", () => {});
  db.user.findUnique = mock.fn(async () => { throw new Error("private database details"); });
  for (const [method, path] of [["get", listPath], ["patch", rolePath]]) {
    const response = await request(method, path, { body: { role: "admin" } });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { message: "Unable to verify admin access" });
  }
  assert.equal(db.user.findMany.mock.callCount(), 0);
  assert.equal(db.user.update.mock.callCount(), 0);
});

test("user list and role update failures return safe error messages", async (context) => {
  context.mock.method(console, "error", () => {});
  db.user.findMany = mock.fn(async () => { throw new Error("private details"); });
  const list = await request("get", listPath);
  assert.equal(list.statusCode, 500);
  assert.deepEqual(list.body, { message: "Unable to load users" });
  db.user.update = mock.fn(async () => { throw new Error("private details"); });
  const update = await request("patch", rolePath, { body: { role: "admin" } });
  assert.equal(update.statusCode, 500);
  assert.deepEqual(update.body, { message: "Unable to update user role" });
});
