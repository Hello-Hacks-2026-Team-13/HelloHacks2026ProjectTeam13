import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { defaultProfile } from "../src/domain.ts";
import {
  prepareMoments,
  requireUpload,
  activeRound,
  canReadPhoto,
  momentsView,
  setMomentRevealTime,
  DAY,
} from "../src/moment-domain.ts";
import type { Room } from "../../shared/types.ts";
import { MOMENT_PROMPTS } from "../../shared/moments.ts";
function pair(zones = ["America/Vancouver", "Asia/Tokyo"]): Room {
  return {
    id: "test-pair",
    createdAt: new Date().toISOString(),
    profiles: zones.map((zone, i) => ({
      ...defaultProfile(String(i), `Partner ${i}`),
      timezone: zone,
    })),
    plans: [],
    offers: [],
  };
}
test("daily moment reveals one local day after setup and keeps its timezone fixed", () => {
  const room = pair();
  const now = Date.parse("2026-09-26T12:00:00Z");
  const round = prepareMoments(room, now);
  assert.equal(room.moments?.zone, "Asia/Tokyo");
  assert.equal(room.moments?.revealTime, "21:00");
  assert.equal(Date.parse(round.revealAt) - now, DAY);
  assert.equal(Date.parse(round.revealAt) - Date.parse(round.promptAt!), 12 * 3600000);
  assert.equal(
    DateTime.fromISO(round.revealAt).setZone("Asia/Tokyo").hour,
    DateTime.fromMillis(now, { zone: "Asia/Tokyo" }).hour,
  );
  room.profiles[1].timezone = "America/Los_Angeles";
  assert.equal(prepareMoments(room, now + 1000).id, round.id);
});
test("legacy first reveals more than 24 hours away are moved to the daily cadence", () => {
  const room = pair();
  const now = Date.parse("2026-09-26T12:00:00Z");
  const oldReveal = DateTime.fromMillis(now + 42 * 3600000, {
    zone: "Asia/Tokyo",
  });
  const oldRound = {
    id: String(oldReveal.toMillis()),
    prompt: "An existing prompt",
    revealAt: oldReveal.toISO()!,
    expiresAt: new Date(oldReveal.toMillis() + DAY).toISOString(),
    photos: {
      "0": { file: "kept.jpg", revision: "rev", reactions: [] },
    },
  };
  room.moments = {
    zone: "Asia/Tokyo",
    firstReveal: oldRound.revealAt,
    rounds: [oldRound],
  };

  const round = prepareMoments(room, now);

  assert.equal(Date.parse(round.revealAt) - now, DAY);
  assert.equal(round.photos["0"].file, "kept.jpg");
  assert.equal(room.moments?.cadenceVersion, 2);
});
test("custom reveal time releases one prompt 12 hours before each daily reveal", () => {
  const room = pair();
  const now = Date.parse("2026-09-26T00:00:00Z");
  prepareMoments(room, now);

  setMomentRevealTime(room, "21:00", now);
  const first = prepareMoments(room, now);

  assert.equal(
    DateTime.fromISO(first.revealAt).setZone("Asia/Tokyo").toFormat("HH:mm"),
    "21:00",
  );
  assert.equal(Date.parse(first.promptAt!), now);
  assert.equal(
    Date.parse(first.promptAt!),
    DateTime.fromISO(first.revealAt).minus({ hours: 12 }).toMillis(),
  );

  const viewBeforeRelease = momentsView(room, "0", now - 1);
  assert.equal(viewBeforeRelease.rounds[0].prompt, null);
  assert.throws(() => requireUpload(room, first.id, now - 1), /not available yet/);
  const viewAtRelease = momentsView(room, "0", now);
  assert.equal(viewAtRelease.rounds[0].promptReleased, true);
  assert.equal(viewAtRelease.rounds[0].prompt, first.prompt);
  assert.equal(requireUpload(room, first.id, now).id, first.id);

  const next = prepareMoments(room, Date.parse(first.revealAt));
  assert.equal(
    DateTime.fromISO(next.revealAt).setZone("Asia/Tokyo").toFormat("HH:mm"),
    "21:00",
  );
  assert.equal(Date.parse(next.revealAt) - Date.parse(first.revealAt), DAY);
  assert.equal(Date.parse(next.revealAt) - Date.parse(next.promptAt!), 12 * 3600000);
  assert.equal(room.moments!.rounds.length, 2);
});
test("date line and fractional offsets use the leading local calendar zone", () => {
  for (const [zones, expected] of [
    [["Pacific/Honolulu", "Pacific/Kiritimati"], "Pacific/Kiritimati"],
    [["Asia/Kolkata", "Asia/Kathmandu"], "Asia/Kathmandu"],
  ] as const) {
    const room = pair([...zones]);
    const now = Date.parse("2026-09-26T10:00:00Z");
    const round = prepareMoments(room, now);
    assert.equal(room.moments!.zone, expected);
    assert.equal(
      DateTime.fromISO(round.revealAt).setZone(expected).hour,
      DateTime.fromMillis(now, { zone: expected }).hour,
    );
  }
});
test("daily reveal preserves local time across daylight saving; expiry is exactly 24 elapsed hours", () => {
  const room = pair(["America/New_York", "America/Los_Angeles"]);
  const first = prepareMoments(room, Date.parse("2026-03-06T12:00:00Z"));
  const firstLocalHour = DateTime.fromISO(first.revealAt)
    .setZone("America/New_York")
    .hour;
  const next = prepareMoments(room, Date.parse(first.revealAt));
  assert.equal(
    DateTime.fromISO(next.revealAt).setZone("America/New_York").hour,
    firstLocalHour,
  );
  assert.equal(
    Date.parse(next.revealAt) - Date.parse(first.revealAt),
    23 * 3600000,
  );
  assert.equal(Date.parse(next.expiresAt) - Date.parse(next.revealAt), DAY);
});
test("photos stay private until their scheduled reveal and expire after 24 hours", () => {
  const room = pair();
  const now = Date.parse("2026-09-26T12:00:00Z");
  const round = prepareMoments(room, now);
  round.photos = {
    "0": { file: "secret-a", revision: "a", reactions: [] },
    "1": { file: "secret-b", revision: "b", reactions: [] },
  };
  const reveal = Date.parse(round.revealAt);
  assert.equal(canReadPhoto(round, "1", "0", reveal - 1), false);
  assert.equal(canReadPhoto(round, "0", "0", now), true);
  const view = momentsView(room, "0", now);
  assert.equal(view.rounds[0].photos[1].visible, false);
  assert.equal(view.rounds[0].photos[1].revision, undefined);
  assert.ok(!JSON.stringify(view).includes("secret"));
  assert.equal(canReadPhoto(round, "1", "0", reveal), true);
  assert.throws(() => requireUpload(room, round.id, reveal), /revealed/);
  assert.equal(
    canReadPhoto(round, "0", "0", Date.parse(round.expiresAt)),
    false,
  );
  assert.throws(
    () => activeRound(room, round.id, Date.parse(round.expiresAt)),
    /expired/,
  );
});
test("prompts rotate without adjacent repetition, wrap, and prune expired reactions", () => {
  const room = pair(["UTC", "UTC"]);
  let now = Date.parse("2026-09-26T12:00:00Z");
  const prompts: string[] = [];
  for (let i = 0; i <= MOMENT_PROMPTS.length; i++) {
    const round = prepareMoments(room, now);
    prompts.push(round.prompt);
    assert.ok(room.moments!.rounds.length <= 2);
    now = Date.parse(round.revealAt);
  }
  assert.equal(new Set(prompts.slice(0, -1)).size, MOMENT_PROMPTS.length);
  assert.equal(prompts[0], prompts.at(-1));
  prepareMoments(room, now + 10 * DAY);
  assert.equal(room.moments!.rounds.length, 1);
});

test("retention worker deletes expired photo bytes and reactions without a page visit", async () => {
  const { mkdtemp, readdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { randomUUID } = await import("node:crypto");
  const directory = await mkdtemp(join(tmpdir(), "across-retention-"));
  process.env.APP_MODE = "demo";
  process.env.DEMO_DATA_DIR = directory;
  const store = await import("../src/store.ts");
  const storage = await import("../src/moment-storage.ts");
  try {
    const a = await store.newDemoUser();
    const b = await store.newDemoUser();
    const code = await store.createRoom(a, defaultProfile(a, "A"));
    await store.joinRoom(b, code, defaultProfile(b, "B"));
    const room = await store.mutateRoom(a, (current) => {
      prepareMoments(current);
    });
    const round = room.moments!.rounds[0];
    const file = `${Date.parse(round.expiresAt)}_${room.id}_${Date.now()}_${randomUUID()}.jpg`;
    await storage.saveMomentFile(file, Buffer.from("temporary test bytes"));
    await store.mutateRoom(a, (current) => {
      current.moments!.rounds[0].photos[a] = {
        file,
        revision: "test",
        reactions: [{ userId: b, emoji: "❤️", message: "Temporary" }],
      };
    });
    await storage.cleanupMoments(Date.parse(round.expiresAt));
    assert.deepEqual(await readdir(join(directory, "moments")), []);
    assert.deepEqual((await store.getRoom(a))!.moments!.rounds, []);
    // A failed metadata commit leaves an orphan; the grace period then reclaims it.
    const orphan = `${Date.now() + DAY}_${room.id}_${Date.now() - 16 * 60000}_${randomUUID()}.jpg`;
    await storage.saveMomentFile(orphan, Buffer.from("orphan"));
    await storage.cleanupMoments();
    assert.deepEqual(await readdir(join(directory, "moments")), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
