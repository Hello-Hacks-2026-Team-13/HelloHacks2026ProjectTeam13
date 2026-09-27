import "./config.ts";
import express, { type Request } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z, ZodError } from "zod";
import { DateTime } from "luxon";
import { fileURLToPath } from "node:url";
import {
  live,
  allowedOrigins,
  rawgReady,
  mealdbReady,
} from "./config.ts";
import {
  admin,
  newDemoUser,
  validDemoUser,
  getRoom,
  createRoom,
  joinRoom,
  rotateInvite,
  removePairing,
  mutateRoom,
} from "./store.ts";
import {
  defaultProfile,
  profileInput,
  acceptPlan,
  fitsHours,
  overlaps,
} from "./domain.ts";
import { suggest, commitSuggestions } from "./activities.ts";
import type { Room } from "../../shared/types.ts";
import momentsRouter from "./moments.ts";
import { startMomentCleanup, deleteMomentFiles } from "./moment-storage.ts";
const app = express();
const port = Number(process.env.PORT) || 3001;
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": [
          "'self'",
          "https://image.tmdb.org",
          "https://www.themoviedb.org",
          "https://media.rawg.io",
          "https://www.themealdb.com",
          "data:",
        ],
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "connect-src": [
          "'self'",
          ...(process.env.SUPABASE_URL ? [process.env.SUPABASE_URL] : []),
        ],
      },
    },
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  const requestOrigin = req.headers.origin?.replace(/\/$/, "");
  const nativeClient = req.headers["x-across-client"] === "native";
  if (requestOrigin) {
    if (!allowedOrigins.has(requestOrigin) && !nativeClient) {
      res.status(403).json({ error: "Unrecognized application origin." });
      return;
    }
    if (allowedOrigins.has(requestOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type",
      );
    }
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.get("/api/config", (_req, res) =>
  res.json({
    mode: live ? "live" : "demo",
    supabaseUrl: live ? process.env.SUPABASE_URL : "",
    supabasePublishableKey: live ? process.env.SUPABASE_PUBLISHABLE_KEY : "",
    tmdbReady: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
    rawgReady,
    mealdbReady,
  }),
);
app.post("/api/demo/session", async (_req, res) => {
  if (live) {
    res.sendStatus(404);
    return;
  }
  res.json({ token: await newDemoUser() });
});
app.use("/api", async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  if (admin) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) {
      res
        .status(401)
        .json({ error: "Your session expired. Please sign in again." });
      return;
    }
    res.locals.userId = data.user.id;
  } else {
    if (!validDemoUser(token)) {
      res
        .status(401)
        .json({ error: "Demo session expired. Reload to start again." });
      return;
    }
    res.locals.userId = token;
  }
  next();
});
app.use("/api/moments", momentsRouter);
const requireRoom = async (userId: string): Promise<Room> => {
  const room = await getRoom(userId);
  if (!room) throw new Error("Create or join a space first.");
  return room;
};
app.get("/api/state", async (_req, res) =>
  res.json({
    mode: live ? "live" : "demo",
    userId: res.locals.userId,
    room: await getRoom(res.locals.userId).then((room) => {
      if (!room) return null;
      const { moments: _privateMoments, ...publicRoom } = room;
      return publicRoom;
    }),
    tmdbReady: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
    rawgReady,
    mealdbReady,
  }),
);
const readProfile = (req: Request, id: string) => ({
  ...profileInput.parse(req.body.profile),
  id,
});
app.post("/api/pair/create", async (req, res) =>
  res.json({
    code: await createRoom(
      res.locals.userId,
      readProfile(req, res.locals.userId),
    ),
  }),
);
app.post("/api/pair/join", async (req, res) => {
  const code = z.string().trim().length(24).parse(req.body.code).toLowerCase();
  await joinRoom(res.locals.userId, code, readProfile(req, res.locals.userId));
  res.json({ ok: true });
});
app.post("/api/pair/invite", async (_req, res) =>
  res.json({ code: await rotateInvite(res.locals.userId) }),
);
app.post("/api/pair/remove", async (_req, res) => {
  const room = await getRoom(res.locals.userId);
  await removePairing(res.locals.userId);
  const files =
    room?.moments?.rounds.flatMap((r) =>
      Object.values(r.photos).map((p) => p.file),
    ) || [];
  await deleteMomentFiles(files).catch((error) =>
    console.error("Moment file deletion will retry:", error.message),
  );
  res.json({ ok: true });
});
app.post("/api/demo/partner", async (_req, res) => {
  if (live) {
    res.sendStatus(404);
    return;
  }
  await mutateRoom(res.locals.userId, (room) => {
    if (room.profiles.length !== 1)
      throw new Error("Your partner has already joined.");
    const me = room.profiles[0];
    room.profiles.push({
      ...defaultProfile(`demo-partner-${room.id}`, "Alex"),
      timezone: "America/New_York",
      startHour: Math.min(me.startHour + 3, 20),
      endHour: 24,
    });
    room.connectedAt = new Date().toISOString();
  });
  res.json({ ok: true });
});
app.put("/api/preferences", async (req, res) => {
  const profile = profileInput.parse(req.body.profile);
  await mutateRoom(res.locals.userId, (room) => {
    const actor =
      !live && req.body.asPartner
        ? room.profiles.find((p) => p.id !== res.locals.userId)?.id
        : res.locals.userId;
    const index = room.profiles.findIndex((p) => p.id === actor);
    if (index < 0) throw new Error("Partner not found.");
    room.profiles[index] = { ...room.profiles[index], ...profile };
    room.offers = [];
  });
  res.json({ ok: true });
});
app.post("/api/suggestions", async (_req, res) => {
  const room = await requireRoom(res.locals.userId);
  if (room.profiles.length !== 2)
    throw new Error("Pair with your partner first.");
  const result = await suggest(room, !live);
  await mutateRoom(res.locals.userId, (current) => {
    commitSuggestions(current, room, result.offers);
  });
  res.json(result);
});
app.post("/api/plans", async (req, res) => {
  const id = z.string().uuid().parse(req.body.offerId);
  await mutateRoom(res.locals.userId, (room) => {
    const offer = room.offers.find((o) => o.id === id);
    if (!offer)
      throw new Error("Find fresh suggestions before proposing a plan.");
    if (Date.parse(offer.slot.start) <= Date.now())
      throw new Error("This time has passed. Find a new time.");
    if (
      room.plans.some(
        (p) => p.status !== "cancelled" && overlaps(p.slot, offer.slot),
      )
    )
      throw new Error("You already have a plan at this time.");
    room.plans.unshift({
      ...offer,
      acceptedBy: [res.locals.userId],
      status: "pending",
      createdBy: res.locals.userId,
    });
    room.offers = [];
  });
  res.json({ ok: true });
});
app.post("/api/plans/:id/accept", async (req, res) => {
  const room = await requireRoom(res.locals.userId);
  const plan = room.plans.find((p) => p.id === req.params.id);
  if (!plan) throw new Error("Plan not found.");
  if (
    !room.profiles.every((p) =>
      fitsHours(
        p,
        DateTime.fromISO(plan.slot.start),
        DateTime.fromISO(plan.slot.end),
      ),
    )
  )
    throw new Error(
      "This no longer fits both partners’ hours. Cancel and find a new time.",
    );
  await mutateRoom(res.locals.userId, (current) => {
    if (JSON.stringify(current.profiles) !== JSON.stringify(room.profiles))
      throw new Error("Preferences changed. Try again.");
    const actor =
      !live && req.body.asPartner
        ? current.profiles.find((p) => p.id !== res.locals.userId)!.id
        : res.locals.userId;
    acceptPlan(current, req.params.id as string, actor);
  });
  res.json({ ok: true });
});
app.post("/api/plans/:id/cancel", async (req, res) => {
  await mutateRoom(res.locals.userId, (room) => {
    const plan = room.plans.find((p) => p.id === req.params.id);
    if (!plan) throw new Error("Plan not found.");
    plan.status = "cancelled";
  });
  res.json({ ok: true });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
if (process.env.NODE_ENV === "production") {
  const dist = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(`${dist}/index.html`));
}
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "The database request failed. Check the schema and server configuration.";
    res.status(error instanceof ZodError ? 400 : 409).json({ error: message });
  },
);
app.listen(port, process.env.HOST || "0.0.0.0", () =>
  console.log(
    `Across API: http://localhost:${port} (${live ? "live" : "demo"})`,
  ),
);

startMomentCleanup();
