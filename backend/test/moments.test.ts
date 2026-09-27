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
test("daily moment selects earlier 9pm, grants at least 24h, and keeps its deadline fixed", () => {
  const room = pair();
  const now = Date.parse("2026-09-26T12:00:00Z");
  const round = prepareMoments(room, now);
  assert.equal(room.moments?.zone, "Asia/Tokyo");
  assert.equal(DateTime.fromISO(round.revealAt).setZone("Asia/Tokyo").hour, 21);
  assert.ok(Date.parse(round.revealAt) - now >= DAY);
  room.profiles[1].timezone = "America/Los_Angeles";
  assert.equal(prepareMoments(room, now + 1000).id, round.id);
});
test("date line and fractional offsets use the leading local calendar zone", () => {
  for (const [zones, expected] of [
    [["Pacific/Honolulu", "Pacific/Kiritimati"], "Pacific/Kiritimati"],
    [["Asia/Kolkata", "Asia/Kathmandu"], "Asia/Kathmandu"],
  ] as const) {
    const room = pair([...zones]);
    const round = prepareMoments(room, Date.parse("2026-09-26T10:00:00Z"));
    assert.equal(room.moments!.zone, expected);
    assert.equal(DateTime.fromISO(round.revealAt).setZone(expected).hour, 21);
  }
});
test("reveal respects local 9pm across daylight saving; expiry is exactly 24 elapsed hours", () => {
  const room = pair(["America/New_York", "America/Los_Angeles"]);
  const first = prepareMoments(room, Date.parse("2026-03-06T12:00:00Z"));
  const next = prepareMoments(room, Date.parse(first.revealAt));
  assert.equal(
    DateTime.fromISO(next.revealAt).setZone("America/New_York").hour,
    21,
  );
  assert.equal(
    Date.parse(next.revealAt) - Date.parse(first.revealAt),
    23 * 3600000,
  );
  assert.equal(Date.parse(next.expiresAt) - Date.parse(next.revealAt), DAY);
});
test("photos never reveal early, even when both submit; access ends at exact expiry", () => {
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
  process.env.TOKEN_ENCRYPTION_KEY = "";
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
