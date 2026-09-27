import express from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { getRoom, mutateRoom } from "./store.ts";
import {
  prepareMoments,
  momentsView,
  activeRound,
  requireUpload,
  canReadPhoto,
} from "./moment-domain.ts";
import {
  saveMomentFile,
  readMomentFile,
  deleteMomentFiles,
} from "./moment-storage.ts";
import { MOMENT_EMOJIS } from "../../shared/moments.ts";
const router = express.Router();
const id = z.string().regex(/^\d{13}$/);
const uploadLimit = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
router.get("/", async (_req, res) => {
  const userId = res.locals.userId;
  let room = await getRoom(userId);
  if (!room) throw new Error("Create or join a space first.");
  const before = JSON.stringify(room.moments);
  prepareMoments(room);
  if (before !== JSON.stringify(room.moments)) {
    room = await mutateRoom(userId, (current) => {
      prepareMoments(current);
    });
  }
  res.json(momentsView(room, userId));
});
router.put(
  "/:round/photo",
  uploadLimit,
  express.text({ type: "text/plain", limit: "7mb" }),
  async (req, res) => {
    const roundId = id.parse(req.params.round);
    const userId = res.locals.userId;
    const room = await getRoom(userId);
    if (!room || room.profiles.length !== 2)
      throw new Error("Pair with your partner first.");
    const round = requireUpload(room, roundId);
    const encoded = z
      .string()
      .min(1)
      .max(7 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .parse(req.body);
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > 5 * 1024 * 1024)
      throw new Error("Choose a photo smaller than 5 MB.");
    let compressed: Buffer;
    try {
      const input = sharp(bytes, {
        limitInputPixels: 40000000,
        failOn: "warning",
      });
      const metadata = await input.metadata();
      if (
        !["jpeg", "png", "webp", "heif"].includes(metadata.format || "") ||
        (metadata.pages || 1) > 1
      )
        throw new Error();
      // Decode real image bytes, orient, resize, strip EXIF/GPS, and encode JPEG.
      compressed = await input
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 78 })
        .toBuffer();
      if (compressed.length > 2 * 1024 * 1024) throw new Error();
    } catch {
      throw new Error(
        "Use a still JPEG, PNG, or WebP photo under 5 MB. Export HEIC photos as JPEG if needed.",
      );
    }
    const revision = randomUUID();
    const file = `${Date.parse(round.expiresAt)}_${room.id}_${Date.now()}_${revision}.jpg`;
    await saveMomentFile(file, compressed);
    let oldFile: string | undefined;
    try {
      await mutateRoom(userId, (current) => {
        if (current.id !== room.id)
          throw new Error("Your pairing changed. Open the new prompt.");
        const target = requireUpload(current, roundId);
        oldFile = target.photos[userId]?.file;
        target.photos[userId] = { file, revision, reactions: [] };
      });
    } catch (error) {
      await deleteMomentFiles([file]).catch(() => {});
      throw error;
    }
    if (oldFile) await deleteMomentFiles([oldFile]).catch(() => {});
    res.json({ ok: true });
  },
);
router.get("/:round/photos/:owner", async (req, res) => {
  const room = await getRoom(res.locals.userId);
  if (!room) throw new Error("This photo is no longer available.");
  const round = activeRound(room, id.parse(req.params.round));
  const owner = z.string().max(100).parse(req.params.owner);
  const photo = round.photos[owner];
  if (!photo || !canReadPhoto(round, owner, res.locals.userId)) {
    res.status(403).json({ error: "This photo is private until the reveal." });
    return;
  }
  const bytes = await readMomentFile(photo.file);
  // Recheck after I/O so a deletion, unpairing, or expiry cannot race the read.
  const current = await getRoom(res.locals.userId);
  if (
    !current ||
    current.id !== room.id ||
    !canReadPhoto(activeRound(current, round.id), owner, res.locals.userId)
  )
    throw new Error("This moment is no longer available.");
  res.json({ dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` });
});
router.put("/:round/photos/:owner/reaction", async (req, res) => {
  const roundId = id.parse(req.params.round);
  const owner = z.string().max(100).parse(req.params.owner);
  const reaction = z
    .object({
      emoji: z.enum(["", ...MOMENT_EMOJIS]),
      message: z.string().trim().max(240),
    })
    .parse(req.body);
  await mutateRoom(res.locals.userId, (room) => {
    const round = activeRound(room, roundId);
    if (Date.now() < Date.parse(round.revealAt))
      throw new Error("Reactions open after the reveal.");
    const photo = round.photos[owner];
    if (!photo) throw new Error("No photo was submitted.");
    photo.reactions = photo.reactions.filter(
      (r) => r.userId !== res.locals.userId,
    );
    if (reaction.emoji || reaction.message)
      photo.reactions.push({ userId: res.locals.userId, ...reaction });
  });
  res.json({ ok: true });
});
export default router;
