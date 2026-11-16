import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
const { app } = await import("../server.ts");
const { db } = await import("../src/prisma/db.ts");

const ownerId = "10000000-0000-0000-0000-000000000001";
const otherId = "10000000-0000-0000-0000-000000000002";
const projectId = "20000000-0000-0000-0000-000000000001";
const otherProjectId = "20000000-0000-0000-0000-000000000002";
const missingProjectId = "20000000-0000-0000-0000-000000000003";
const taskId = "30000000-0000-0000-0000-000000000001";
const completedId = "30000000-0000-0000-0000-000000000002";
const otherTaskId = "30000000-0000-0000-0000-000000000003";
const legacyTaskId = "30000000-0000-0000-0000-000000000004";
let tasks;
const originalMethods = {
  findFirst: db.project.findFirst,
  findMany: db.task.findMany,
  create: db.task.create,
  updateMany: db.task.updateMany,
};

beforeEach(() => {
  tasks = [
    { id: taskId, userId: ownerId, projectId, completedAt: null },
    { id: completedId, userId: ownerId, projectId, completedAt: new Date("2026-01-01") },
    { id: otherTaskId, userId: otherId, projectId: otherProjectId, completedAt: null },
    { id: legacyTaskId, userId: ownerId, projectId: null, completedAt: null },
  ];
  db.project.findFirst = mock.fn(async ({ where }) => {
    const projects = [{ id: projectId, ownerId }, { id: otherProjectId, ownerId: otherId }];
    return projects.find((project) => project.id === where.id && project.ownerId === where.ownerId) ?? null;
  });
  db.task.findMany = mock.fn(async ({ where }) => tasks.filter((task) =>
    task.userId === where.userId &&
    (where.projectId === undefined || task.projectId === where.projectId) &&
    (where.completedAt === undefined || task.completedAt === where.completedAt)
  ));
  db.task.create = mock.fn(async ({ data }) => ({ id: "new-task", ...data }));
  db.task.updateMany = mock.fn(async ({ where, data }) => {
    const matching = tasks.filter((task) => task.id === where.id && task.userId === where.userId && task.completedAt === where.completedAt);
    matching.forEach((task) => Object.assign(task, data));
    return { count: matching.length };
  });
});

afterEach(() => {
  db.project.findFirst = originalMethods.findFirst;
  db.task.findMany = originalMethods.findMany;
  db.task.create = originalMethods.create;
  db.task.updateMany = originalMethods.updateMany;
});

async function request(method, path, { userId = ownerId, query = {}, body = {}, params = {} } = {}) {
  const route = app.router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await route.stack[0].handle({ session: { userId }, query, body, params }, response);
  return response;
}

test("all task routes reject an unauthenticated user before querying the database", async () => {
  for (const [method, path] of [["get", "/api/tasks"], ["post", "/api/tasks"], ["patch", "/api/tasks/:id/complete"]]) {
    assert.equal((await request(method, path, { userId: null })).statusCode, 401);
  }
  assert.equal(db.project.findFirst.mock.callCount(), 0);
  assert.equal(db.task.findMany.mock.callCount(), 0);
  assert.equal(db.task.create.mock.callCount(), 0);
  assert.equal(db.task.updateMany.mock.callCount(), 0);
});

test("creation requires a project UUID, including when the request body is missing", async () => {
  for (const value of [undefined, null, "", "bad", [], {}, 42]) {
    assert.equal((await request("post", "/api/tasks", { body: { title: "Task", projectId: value } })).statusCode, 400);
  }
  assert.equal((await request("post", "/api/tasks", { body: null })).statusCode, 400);
  assert.equal(db.project.findFirst.mock.callCount(), 0);
  assert.equal(db.task.create.mock.callCount(), 0);
});

test("creation rejects another user's project and nonexistent projects", async () => {
  for (const id of [otherProjectId, missingProjectId]) {
    assert.equal((await request("post", "/api/tasks", { body: { title: "Task", projectId: id } })).statusCode, 404);
  }
  assert.equal(db.task.create.mock.callCount(), 0);
});

test("creation stores the authorized project and session user, ignoring a client-supplied user", async () => {
  const response = await request("post", "/api/tasks", {
    body: { projectId, title: "  Study  ", description: "  Chapter 1  ", userId: otherId, priority: "high", dueDate: "2026-12-01" },
  });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.task, {
    id: "new-task", projectId, userId: ownerId, title: "Study", description: "Chapter 1",
    priority: "high", dueDate: new Date("2026-12-01"),
  });
});

test("existing task validation and default priority remain effective", async () => {
  for (const body of [{ title: " " }, { title: "Task", priority: "urgent" }, { title: "Task", dueDate: "invalid" }]) {
    assert.equal((await request("post", "/api/tasks", { body: { ...body, projectId } })).statusCode, 400);
  }
  const response = await request("post", "/api/tasks", { body: { projectId, title: "Task" } });
  assert.equal(response.body.task.priority, "medium");
  assert.equal(response.body.task.description, null);
  assert.equal(response.body.task.dueDate, null);
});

test("default GET preserves the personal open-task overview, including legacy unassigned tasks", async () => {
  const response = await request("get", "/api/tasks");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.tasks.map((task) => task.id), [taskId, legacyTaskId]);
  assert.equal(db.project.findFirst.mock.callCount(), 0);
  assert.deepEqual(db.task.findMany.mock.calls[0].arguments[0].orderBy, { createdAt: "desc" });
});

test("project filtering returns only the selected project's open tasks", async () => {
  const response = await request("get", "/api/tasks", { query: { projectId } });
  assert.deepEqual(response.body.tasks.map((task) => task.id), [taskId]);
  assert.deepEqual(db.project.findFirst.mock.calls[0].arguments[0].where, { id: projectId, ownerId });
});

test("includeCompleted=true includes completed tasks for project progress", async () => {
  const response = await request("get", "/api/tasks", { query: { projectId, includeCompleted: "true" } });
  assert.deepEqual(response.body.tasks.map((task) => task.id), [taskId, completedId]);
});

test("includeCompleted=false continues returning only open tasks", async () => {
  const response = await request("get", "/api/tasks", { query: { projectId, includeCompleted: "false" } });
  assert.deepEqual(response.body.tasks.map((task) => task.id), [taskId]);
});

test("includeCompleted without a project still returns only the authenticated user's tasks", async () => {
  const response = await request("get", "/api/tasks", { query: { includeCompleted: "true" } });
  assert.deepEqual(response.body.tasks.map((task) => task.id), [taskId, completedId, legacyTaskId]);
});

test("GET rejects malformed project IDs and malformed completed-task options", async () => {
  for (const value of ["", "bad", [projectId], {}]) {
    assert.equal((await request("get", "/api/tasks", { query: { projectId: value } })).statusCode, 400);
  }
  for (const value of ["", "yes", ["true"], {}]) {
    assert.equal((await request("get", "/api/tasks", { query: { includeCompleted: value } })).statusCode, 400);
  }
  assert.equal(db.task.findMany.mock.callCount(), 0);
});

test("GET denies another user's project even when completed tasks are requested", async () => {
  for (const id of [otherProjectId, missingProjectId]) {
    assert.equal((await request("get", "/api/tasks", { query: { projectId: id, includeCompleted: "true" } })).statusCode, 404);
  }
  assert.equal(db.task.findMany.mock.callCount(), 0);
});

test("completion preserves the task and its project while setting completedAt", async () => {
  assert.equal((await request("patch", "/api/tasks/:id/complete", { params: { id: taskId } })).statusCode, 200);
  assert.equal(tasks[0].id, taskId);
  assert.equal(tasks[0].userId, ownerId);
  assert.equal(tasks[0].projectId, projectId);
  assert.ok(tasks[0].completedAt instanceof Date);
});

test("completion cannot change another user's task or an already completed task", async () => {
  const before = structuredClone(tasks);
  for (const id of [otherTaskId, completedId, missingProjectId, "invalid"]) {
    assert.equal((await request("patch", "/api/tasks/:id/complete", { params: { id } })).statusCode, 404);
  }
  assert.deepEqual(tasks, before);
});

test("legacy tasks can still be completed during the nullable stage", async () => {
  assert.equal((await request("patch", "/api/tasks/:id/complete", { params: { id: legacyTaskId } })).statusCode, 200);
  assert.ok(tasks.find((task) => task.id === legacyTaskId).completedAt instanceof Date);
});
