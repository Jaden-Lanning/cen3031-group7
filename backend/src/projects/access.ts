import { db } from "../prisma/db.js";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function findOwnedProject(projectId: string, userId: string) {
  return db.project.findFirst({
    where: { id: projectId, ownerId: userId },
    select: { id: true },
  });
}
