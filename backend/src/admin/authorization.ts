import type { NextFunction, Request, Response } from "express";
import { db } from "../prisma/db.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const user = await db.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, role: true },
    });
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
  } catch (error) {
    console.error("Admin authorization error:", error);
    return res.status(500).json({ message: "Unable to verify admin access" });
  }

  next();
}
