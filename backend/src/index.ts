import "./config.ts";
import express, { type Request } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z, ZodError } from "zod";
import { DateTime } from "luxon";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  live,
  origin,
  apiOrigin,
  allowedOrigins,
  calendarReady,
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
import {
  startCalendar,
  resumeCalendarStart,
  finishCalendar,
  disconnectCalendar,
  calendarBusy,
} from "./calendar.ts";
import { suggest } from "./activities.ts";
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
    calendarReady,
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
app.get("/api/calendar/start", async (req, res, next) => {
  try {
    const { state, native } = z
      .object({
        state: z.string().length(64),
        native: z.enum(["0", "1"]).optional(),
      })
      .parse(req.query);
    const url = await resumeCalendarStart(state);
    res.cookie("calendar_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: apiOrigin.startsWith("https:"),
      path: "/api/calendar",
      maxAge: 600000,
    });
    if (native === "1") {
      res.cookie("calendar_return", "native", {
        httpOnly: true,
        sameSite: "lax",
        secure: apiOrigin.startsWith("https:"),
        path: "/api/calendar",
        maxAge: 600000,
      });
    }
    res.redirect(url);
  } catch (error) {
    next(error);
  }
});
app.get("/api/calendar/callback", async (req, res) => {
  const native =
    req.headers.cookie
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("calendar_return="))
      ?.split("=")[1] === "native";
  try {
    const { code, state } = z
      .object({ code: z.string(), state: z.string() })
      .parse(req.query);
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("calendar_state="))
        ?.split("=")[1] || "";
    if (
      cookie.length !== state.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(state))
    )
      throw new Error("Calendar state mismatch");
    res.clearCookie("calendar_state", { path: "/api/calendar" });
    res.clearCookie("calendar_return", { path: "/api/calendar" });
    await finishCalendar(code, state);
    res.redirect(
      native
        ? "across:///connections?calendar=connected"
        : `${origin}/?calendar=connected`,
    );
  } catch {
    res.clearCookie("calendar_state", { path: "/api/calendar" });
    res.clearCookie("calendar_return", { path: "/api/calendar" });
    res.redirect(
      native
        ? "across:///connections?calendar=error"
        : `${origin}/?calendar=error`,
    );
  }
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
    calendarReady,
    tmdbReady: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
    rawgReady,
    mealdbReady,
  }),
);
const readProfile = (req: Request, id: string) => ({
  ...profileInput.parse(req.body.profile),
  id,
  calendarConnected: false,
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
  const result = await suggest(room, await calendarBusy(room), !live);
  await mutateRoom(res.locals.userId, (current) => {
    if (JSON.stringify(current.profiles) !== JSON.stringify(room.profiles))
      throw new Error("Preferences changed while searching. Try again.");
    current.offers = result.offers;
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
  if (
    (
      await calendarBusy(
        room,
        new Date(plan.slot.start),
        new Date(plan.slot.end),
      )
    ).some((b) => overlaps(b, plan.slot))
  )
    throw new Error(
      "A calendar conflict appeared. Cancel and find a new time.",
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
app.post("/api/calendar/connect", async (_req, res) => {
  await requireRoom(res.locals.userId);
  const { url, state } = await startCalendar(res.locals.userId);
  res.cookie("calendar_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: apiOrigin.startsWith("https:"),
    path: "/api/calendar",
    maxAge: 600000,
  });
  const browserUrl = new URL("/api/calendar/start", apiOrigin);
  browserUrl.searchParams.set("state", state);
  browserUrl.searchParams.set("native", "1");
  res.json({ url, browserUrl: browserUrl.toString() });
});
app.delete("/api/calendar", async (_req, res) => {
  await disconnectCalendar(res.locals.userId);
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
