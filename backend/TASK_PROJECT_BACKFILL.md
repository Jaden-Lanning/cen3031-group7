# Project-based tasks: manual database procedure

No database changes are applied by installing, generating the Prisma client, or building this branch. This procedure continues to use `prisma db push`; it introduces no migration framework or migration folders. Do not run the updated backend against the old database schema: apply the nullable column first.

## Current stage

`Task.projectId` and `Task.project` are intentionally nullable until the data is backfilled and verified. The API requires an authorized project for every new task. Existing unassigned tasks remain visible and completable during this stage.

The earlier read-only inspection found two tasks (one completed), belonging to two users who had no projects. Counts may have changed since then; the script discovers affected users rather than hardcoding IDs or assuming those counts.

`onDelete: Cascade` means a future project deletion also deletes its tasks. This supports deleting a project as a container and avoids blocking Sprint 2 project deletion. No project deletion endpoint is added here, and the backfill deletes nothing. The future deletion UI should tell users that the project's tasks will also be deleted. User-to-task ownership remains unchanged.

## 1. Prepare and apply the nullable schema

Review the schema diff and backfill script. Take a database backup/provider snapshot. Stop the backend and any other writers for the entire procedure, including old versions that can still create tasks without projects. Confirm the backend environment points to the intended database without sharing its credentials.

From `backend` in PowerShell, run manually:

```powershell
npx.cmd prisma validate
npx.cmd prisma db push
```

Do not add `--force-reset` or `--accept-data-loss`. If Prisma proposes a reset, dropping records, or other unexpected changes, stop and inspect the drift instead of accepting. This stage should only add the nullable UUID column, foreign key, and index.

## 2. Preview, backfill, and verify

From `backend`, run manually:

```powershell
node scripts/backfill-task-projects.mjs --dry-run
node scripts/backfill-task-projects.mjs --apply
node scripts/backfill-task-projects.mjs --verify
```

The default mode is also `--dry-run`. Dry run and verify use read-only transactions. They require the new column to exist.

Apply runs in one transaction with table locks and timeouts. For each owner of unassigned tasks, it creates one project named **Imported Tasks**, owned by that user, and updates only those tasks' `projectId` values. It tags created projects with `attributes.taskProjectBackfill = "v1"` so a later rerun can reuse the same project. It does not repurpose unrelated projects that happen to have the same name. Already assigned tasks are left alone.

Before committing, it checks that no task is unassigned, every task's project owner matches its task user, and a fingerprint of all task data except `projectId` is unchanged. IDs, completion state, user ownership, dates, descriptions, priorities, and attributes are preserved. A failed check rolls the transaction back. Existing invalid ownership causes the script to stop rather than silently reassign data. A successful rerun with no unassigned tasks makes no record changes.

Review the reported counts. Based on the earlier inspection, the first apply should create two projects and assign two tasks while retaining one completed task. If the data has changed, inspect the dry-run counts first.

## 3. Make the relationship required only after verification

Keep writers stopped. Only after `--verify` succeeds, change these two lines in `src/prisma/schema.prisma`:

```prisma
projectId String  @db.Uuid
project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

The current nullable lines use `String?` and `Project?`. Keep `Project.tasks Task[]`, `@@index([projectId])`, and the existing User-to-Task relationship.

Then run manually from `backend`:

```powershell
npx.cmd prisma validate
npx.cmd prisma db push
npx.cmd prisma generate
npx.cmd tsc --noEmit
node --import tsx --test tests/*.test.mjs
node scripts/backfill-task-projects.mjs --verify
```

Again, stop if Prisma requests a reset or unexpected destructive action. Only this step makes the column NOT NULL. The frontend's nullable task type can remain during rollout; it safely handles old API data.

From `frontend`, run `npm.cmd run build`. Restart the updated backend/frontend and check creating a task under your own project, viewing its project name, and completing it. Do not restart an older backend that omits `projectId` on task creation.

## Task API

- `POST /api/tasks` requires `projectId` in addition to the existing task fields. It must be a UUID identifying a project owned by the session user. A client-supplied task `userId` is ignored.
- `GET /api/tasks` keeps the personal open-task overview, including temporary unassigned legacy tasks.
- `GET /api/tasks?projectId=<uuid>` verifies project ownership and returns that user's open tasks in the project.
- Add `includeCompleted=true` to include open and completed tasks for progress calculations. Omit it or use `false` to return open tasks. Other values are rejected.
- `PATCH /api/tasks/:id/complete` retains its existing task-user ownership guard and completion behavior.

Project membership/invitations and the progress UI are future work. Being friends does not grant project access. Owner-only task authorization must be extended deliberately when project membership is implemented.

## Checks that do not change the database

Prisma validation, client generation, backend TypeScript checking, the frontend build, and `node --import tsx --test tests/*.test.mjs` can run before the database procedure. Task route tests use a mocked database and do not query or alter database records; they exercise the registered handlers, not the session middleware or a live PostgreSQL server.
