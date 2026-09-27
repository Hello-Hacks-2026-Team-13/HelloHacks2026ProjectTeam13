import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  defaultProfile,
  findSlots,
  acceptPlan,
  overlaps,
  profileInput,
} from "../src/domain.ts";
import type { Room, Plan } from "../../shared/types.ts";
const first = {
  ...defaultProfile("one"),
  timezone: "America/Vancouver",
  startHour: 17,
  endHour: 22,
};
const second = {
  ...defaultProfile("two"),
  timezone: "America/New_York",
  startHour: 20,
  endHour: 24,
};
test("matches different time zones and blocks supplied busy slots", () => {
  const busy = [{ start: "2026-09-27T00:00:00Z", end: "2026-09-27T01:00:00Z" }];
  const slots = findSlots(
    [first, second],
    busy,
    60,
    DateTime.fromISO("2026-09-26T22:00:00Z"),
  );
  assert.equal(slots[0].start, "2026-09-27T01:00:00.000Z");
  assert.equal(slots[0].end, "2026-09-27T02:00:00.000Z");
  assert.ok(slots.every((s) => !overlaps(s, busy[0])));
});
test("handles daylight saving changes using local hours", () => {
  const slots = findSlots(
    [first, second],
    [],
    60,
    DateTime.fromISO("2026-11-01T20:00:00Z"),
  );
  assert.equal(slots[0].start, "2026-11-02T01:00:00.000Z");
});
test("handles fractional timezone offsets", () => {
  const slots = findSlots(
    [
      { ...first, timezone: "Asia/Kolkata", startHour: 18, endHour: 20 },
      { ...second, timezone: "Europe/London", startHour: 12, endHour: 15 },
    ],
    [],
    30,
    DateTime.fromISO("2026-12-01T10:00:00Z"),
  );
  assert.equal(slots[0].start, "2026-12-01T12:30:00.000Z");
});
test("does not invent availability with no overlap or absent partner", () => {
  assert.deepEqual(
    findSlots(
      [first, { ...first, id: "two", startHour: 8, endHour: 12 }],
      [],
      30,
    ),
    [],
  );
  assert.deepEqual(findSlots([first], [], 30), []);
});
test("requires entire activity to fit and respects selected days", () => {
  const p = {
    ...first,
    timezone: "UTC",
    startHour: 20,
    endHour: 21,
    days: [1],
  };
  assert.deepEqual(
    findSlots(
      [p, { ...p, id: "two" }],
      [],
      90,
      DateTime.fromISO("2026-09-28T10:00:00Z"),
    ),
    [],
  );
  const slots = findSlots(
    [p, { ...p, id: "two" }],
    [],
    60,
    DateTime.fromISO("2026-09-27T10:00:00Z"),
  );
  assert.equal(slots[0].start, "2026-09-28T20:00:00.000Z");
});
test("touching endpoints are not conflicts", () =>
  assert.equal(
    overlaps(
      { start: "2026-09-27T00:00:00Z", end: "2026-09-27T01:00:00Z" },
      { start: "2026-09-27T01:00:00Z", end: "2026-09-27T02:00:00Z" },
    ),
    false,
  ));
function fixture(): Room {
  const start = DateTime.utc().plus({ days: 1 });
  const plan: Plan = {
    id: "plan",
    slot: { start: start.toISO()!, end: start.plus({ hours: 1 }).toISO()! },
    activity: {
      id: "idea",
      title: "A date",
      description: "",
      subtitle: "",
      kind: "conversation",
      source: "curated",
      minutes: 60,
    },
    acceptedBy: ["one"],
    status: "pending",
    createdBy: "one",
  };
  return {
    id: "room",
    profiles: [first, second],
    offers: [],
    plans: [plan],
    createdAt: start.toISO()!,
  };
}
test("cannot save until both distinct partners accept; repeated votes are idempotent", () => {
  const room = fixture();
  assert.equal(acceptPlan(room, "plan", "one").status, "pending");
  assert.deepEqual(room.plans[0].acceptedBy, ["one"]);
  assert.equal(acceptPlan(room, "plan", "two").status, "saved");
  assert.deepEqual(acceptPlan(room, "plan", "two").acceptedBy, ["one", "two"]);
});
test("rejects outsiders, cancelled plans, past dates and conflicting saved plans", () => {
  const room = fixture();
  assert.throws(() => acceptPlan(room, "plan", "outsider"));
  room.plans[0].status = "cancelled";
  assert.throws(() => acceptPlan(room, "plan", "two"));
  room.plans[0].status = "pending";
  room.plans.push({ ...room.plans[0], id: "other", status: "saved" });
  assert.throws(() => acceptPlan(room, "plan", "two"));
  room.plans.pop();
  room.plans[0].slot.start = "2020-01-01T00:00:00Z";
  assert.throws(() => acceptPlan(room, "plan", "two"));
});
test("validates hours and real IANA zones", () => {
  assert.equal(
    profileInput.safeParse({ ...first, timezone: "not-a-zone" }).success,
    false,
  );
  assert.equal(profileInput.safeParse({ ...first, endHour: 3 }).success, false);
  assert.equal(profileInput.safeParse({ ...first, days: [] }).success, false);
  assert.equal(profileInput.safeParse(first).success, true);
});
