import { z } from "zod";

import { SESSION_COOKIE } from "../constants";
import { writeAudit } from "../repos/audit";
import {
  createSession,
  deleteOtherSessions,
  deleteSessionByToken,
} from "../repos/sessions";
import {
  createUser,
  EmailTakenError,
  findUserByEmail,
  toPublicUser,
  updateUser,
} from "../repos/users";
import { createWorkspace } from "../repos/workspaces";
import { HttpError } from "../http";
import {
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from "../security/password";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ObjectId } from "mongodb";

// Profile photos: raster formats only (no SVG, which can carry script; no GIF).
// The client downsizes before upload, so this is only a hard cap.
const AVATAR_CHECKS: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) =>
    b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8,
  "image/webp": (b) =>
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP",
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_BODY_LIMIT = Math.ceil(MAX_AVATAR_BYTES * 1.4);
const avatarKey = (userId: ObjectId | string) => `avatars/${String(userId)}`;
const OBJECT_ID = /^[a-f0-9]{24}$/;
const avatarBody = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, "at least 10 characters").max(128);
const displayName = z.string().trim().min(1).max(80);
const avatarUrl = z
  .string()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), "must be http(s)");

const registerBody = z.object({ email, password, displayName });
const loginBody = z.object({ email, password: z.string().min(1).max(128) });
const profileBody = z
  .object({
    displayName: displayName.optional(),
    avatarUrl: avatarUrl.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "nothing to update");
const passwordBody = z.object({
  currentPassword: z.string().max(128),
  newPassword: password,
});

export const authRoutes = async (app: FastifyInstance) => {
  const { config, database } = app;

  const startSession = async (
    req: FastifyRequest,
    reply: FastifyReply,
    userId: ObjectId,
  ) => {
    const { token, expiresAt } = await createSession(database, {
      userId,
      secret: config.sessionSecret,
      ttlMs: config.sessionTtlMs,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      path: "/",
      expires: expiresAt,
    });
  };

  const strict = {
    config: {
      rateLimit: { max: config.authRateLimitMax, timeWindow: "1 minute" },
    },
  };

  app.post("/auth/register", strict, async (req, reply) => {
    const body = registerBody.parse(req.body);
    let user;
    try {
      user = await createUser(database, {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        displayName: body.displayName,
      });
    } catch (e) {
      if (e instanceof EmailTakenError) {
        return reply.code(409).send({ error: "email_taken" });
      }
      throw e;
    }
    // Every account starts with a personal workspace so the dashboard is usable.
    await createWorkspace(database, {
      name: `${body.displayName}'s workspace`.slice(0, 80),
      ownerId: user._id,
    });
    await startSession(req, reply, user._id);
    await writeAudit(database, {
      action: "USER_REGISTERED",
      actorId: user._id,
      ip: req.ip,
    });
    return reply.code(201).send({ user: toPublicUser(user) });
  });

  // Per-IP + per-email limiting to slow credential stuffing.
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: config.authRateLimitMax,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) =>
            `${req.ip}:${String((req.body as any)?.email ?? "").toLowerCase()}`,
        },
      },
    },
    async (req, reply) => {
      const body = loginBody.parse(req.body);
      const user = await findUserByEmail(database, body.email);
      const ok = user
        ? await verifyPassword(body.password, user.passwordHash)
        : (await burnPasswordCheck(body.password), false);
      if (!user || !ok || user.status !== "active") {
        await writeAudit(database, {
          action: "USER_LOGIN_FAILED",
          actorId: user?._id ?? null,
          ip: req.ip,
        });
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      const updated = await updateUser(database, user._id, {
        lastLoginAt: new Date(),
      });
      await startSession(req, reply, user._id);
      await writeAudit(database, {
        action: "USER_LOGIN",
        actorId: user._id,
        ip: req.ip,
      });
      return { user: toPublicUser(updated ?? user) };
    },
  );

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      await deleteSessionByToken(database, token, config.sessionSecret);
    }
    if (req.auth) {
      await writeAudit(database, {
        action: "USER_LOGOUT",
        actorId: req.auth.user._id,
        ip: req.ip,
      });
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  const guard = { preHandler: app.requireAuth };

  app.get("/auth/me", guard, async (req) => ({
    user: toPublicUser(req.auth!.user),
  }));

  app.patch("/me", guard, async (req) => {
    const patch = profileBody.parse(req.body);
    const updated = await updateUser(database, req.auth!.user._id, patch);
    await writeAudit(database, {
      action: "PROFILE_UPDATED",
      actorId: req.auth!.user._id,
      meta: { fields: Object.keys(patch) },
      ip: req.ip,
    });
    return { user: toPublicUser(updated!) };
  });

  // ---- profile photo ---------------------------------------------------------

  app.put(
    "/me/avatar",
    { ...guard, bodyLimit: AVATAR_BODY_LIMIT },
    async (req) => {
      const body = avatarBody.parse(req.body);
      const data = Buffer.from(body.dataBase64, "base64");
      if (data.length === 0 || data.length > MAX_AVATAR_BYTES) {
        throw new HttpError(413, "file_too_large");
      }
      if (!AVATAR_CHECKS[body.mimeType]?.(data)) {
        throw new HttpError(415, "content_does_not_match_type");
      }
      const userId = req.auth!.user._id;
      await app.storage.put(avatarKey(userId), data, body.mimeType);
      // `v` busts the long-lived cache whenever the photo changes.
      const updated = await updateUser(database, userId, {
        avatarUrl: `/api/v1/avatars/${userId.toHexString()}?v=${Date.now()}`,
      });
      await writeAudit(database, {
        action: "PROFILE_UPDATED",
        actorId: userId,
        meta: { fields: ["avatar"] },
        ip: req.ip,
      });
      return { user: toPublicUser(updated!) };
    },
  );

  app.delete("/me/avatar", guard, async (req) => {
    const userId = req.auth!.user._id;
    await app.storage.delete(avatarKey(userId));
    const updated = await updateUser(database, userId, { avatarUrl: null });
    await writeAudit(database, {
      action: "PROFILE_UPDATED",
      actorId: userId,
      meta: { fields: ["avatar"], removed: true },
      ip: req.ip,
    });
    return { user: toPublicUser(updated!) };
  });

  // Any signed-in user may load any avatar (people see each other in presence,
  // comments and member lists). Unknown / malformed ids are indistinguishable 404s.
  app.get("/avatars/:userId", guard, async (req, reply) => {
    const id = String((req.params as any).userId);
    if (!OBJECT_ID.test(id)) {
      throw new HttpError(404, "not_found");
    }
    const file = await app.storage.get(avatarKey(id));
    if (!file) {
      throw new HttpError(404, "not_found");
    }
    return reply
      .header("content-security-policy", "default-src 'none'; sandbox")
      .header("cache-control", "private, max-age=31536000, immutable")
      .type(file.contentType)
      .send(file.data);
  });

  app.post("/me/password", { ...guard, ...strict }, async (req, reply) => {
    const body = passwordBody.parse(req.body);
    const { user, session } = req.auth!;
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return reply.code(403).send({ error: "invalid_credentials" });
    }
    await updateUser(database, user._id, {
      passwordHash: await hashPassword(body.newPassword),
    });
    // Sign out every other device.
    await deleteOtherSessions(database, user._id, session._id);
    await writeAudit(database, {
      action: "PASSWORD_CHANGED",
      actorId: user._id,
      ip: req.ip,
    });
    return reply.code(204).send();
  });
};
