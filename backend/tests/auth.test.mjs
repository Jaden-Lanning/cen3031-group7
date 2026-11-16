import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import bcrypt from "bcrypt";

process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
const { app } = await import("../server.ts");
const { db } = await import("../src/prisma/db.ts");

const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const originals = { findUnique: db.user.findUnique, create: db.user.create, hash: bcrypt.hash, compare: bcrypt.compare };
let user;

beforeEach(() => {
  user = { id: userId, name: "Student", email: "student@example.com", passwordHash: "hashed-test-password", role: "user", attributes: {} };
  db.user.findUnique = mock.fn(async ({ where }) =>
    where.id === user.id || where.email === user.email ? { ...user } : null
  );
  db.user.create = mock.fn(async ({ data }) => ({ ...user, ...data }));
  bcrypt.hash = mock.fn(async () => "new-password-hash");
  bcrypt.compare = mock.fn(async (password, hash) => password === "valid-password" && hash === user.passwordHash);
});

afterEach(() => {
  db.user.findUnique = originals.findUnique;
  db.user.create = originals.create;
  bcrypt.hash = originals.hash;
  bcrypt.compare = originals.compare;
});

async function request(method, path, { body = {}, session = {} } = {}) {
  const route = app.router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    clearCookie(name) { this.clearedCookie = name; return this; },
  };
  await route.stack[0].handle({ body, session }, res);
  return { res, session };
}

test("public registration always creates a normal user and never exposes a password hash", async () => {
  const { res } = await request("post", "/api/register", {
    body: { name: "New User", email: "  NEW@example.com  ", password: "password", role: "admin", isAdmin: true },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, "user");
  assert.equal(res.body.user.passwordHash, undefined);
  const data = db.user.create.mock.calls[0].arguments[0].data;
  assert.equal(data.role, "user");
  assert.equal(data.email, "new@example.com");
  assert.equal(data.passwordHash, "new-password-hash");
  assert.deepEqual(bcrypt.hash.mock.calls[0].arguments, ["password", 10]);
});

test("registration validation and duplicate email behavior remain intact", async () => {
  assert.equal((await request("post", "/api/register", { body: {} })).res.statusCode, 400);
  assert.equal((await request("post", "/api/register", {
    body: { name: "Duplicate", email: user.email, password: "password", role: "admin" },
  })).res.statusCode, 409);
  assert.equal(db.user.create.mock.callCount(), 0);
});

test("login keeps only the user ID in the session and returns the database role safely", async () => {
  user.role = "admin";
  const { res, session } = await request("post", "/api/login", {
    body: { email: "  STUDENT@example.com  ", password: "valid-password", role: "user" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(session, { userId });
  assert.equal(res.body.user.role, "admin");
  assert.equal(res.body.user.passwordHash, undefined);
  assert.deepEqual(bcrypt.compare.mock.calls[0].arguments, ["valid-password", "hashed-test-password"]);
});

test("invalid login credentials cannot authenticate or grant admin access", async () => {
  for (const body of [
    { email: user.email, password: "wrong", role: "admin" },
    { email: "unknown@example.com", password: "valid-password", role: "admin" },
  ]) {
    const { res, session } = await request("post", "/api/login", { body });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(session, {});
    assert.equal(res.body.user, undefined);
  }
});

test("session lookup rejects absent sessions and users that no longer exist", async () => {
  assert.equal((await request("get", "/api/me")).res.statusCode, 401);
  assert.equal((await request("get", "/api/me", { session: { userId: "missing" } })).res.statusCode, 401);
});

test("session lookup returns the current database role rather than a claimed session role", async () => {
  const options = { session: { userId, role: "admin" } };
  const first = await request("get", "/api/me", options);
  assert.equal(first.res.statusCode, 200);
  assert.equal(first.res.body.user.role, "user");
  assert.equal(first.res.body.user.passwordHash, undefined);
  user.role = "admin";
  assert.equal((await request("get", "/api/me", options)).res.body.user.role, "admin");
});

test("logout still destroys the session and clears its cookie", async () => {
  let destroyed = false;
  const { res } = await request("post", "/api/logout", {
    session: { userId, destroy(callback) { destroyed = true; callback(); } },
  });
  assert.equal(destroyed, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.clearedCookie, "connect.sid");
});
