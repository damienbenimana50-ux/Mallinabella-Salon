import { getAuth, clerkClient } from "@clerk/express";
import type { RequestHandler } from "express";
import { prisma } from "@workspace/db";
import { getVerifiedClerkEmail } from "../lib/salon-domain";

export const requireSalonAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to access the staff dashboard." });
    return;
  }

  const clerkUser = await clerkClient.users.getUser(userId);
  const email = getVerifiedClerkEmail(clerkUser);
  if (!email) {
    res.status(403).json({ error: "A verified email address is required." });
    return;
  }

  const staffUser =
    (await prisma.user.findUnique({ where: { clerkUserId: userId } })) ??
    (await prisma.user.findUnique({ where: { email } }));

  if (!staffUser || staffUser.role !== "admin") {
    res.status(403).json({ error: "This account is not authorized for staff access." });
    return;
  }

  if (staffUser.clerkUserId !== userId) {
    await prisma.user.update({
      where: { id: staffUser.id },
      data: { clerkUserId: userId },
    });
  }

  next();
};
