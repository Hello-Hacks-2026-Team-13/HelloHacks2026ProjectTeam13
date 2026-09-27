import { DateTime } from "luxon";
import { z } from "zod";
import type { Profile, Slot, Room, Plan } from "../../shared/types.ts";

export const profileInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    timezone: z
      .string()
      .refine(
        (v) => DateTime.now().setZone(v).isValid,
        "Choose a valid time zone",
      ),
    country: z.string().regex(/^[A-Z]{2}$/),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    genres: z.array(z.number().int().positive()).max(10),
    duration: z.number().int().min(30).max(240),
  })
  .refine(
    (p) => p.endHour > p.startHour,
    "End hour must be later than start hour. Split overnight availability into daytime hours.",
  );
export function defaultProfile(id: string, name = "You"): Profile {
  return {
    id,
    name,
    timezone: "America/Vancouver",
    country: "CA",
    startHour: 17,
    endHour: 22,
    days: [1, 2, 3, 4, 5, 6, 7],
    genres: [35, 10749],
    duration: 120,
  };
}
export function fitsHours(profile: Profile, start: DateTime, end: DateTime) {
  const local = start.setZone(profile.timezone);
  const last = end.minus({ milliseconds: 1 }).setZone(profile.timezone);
  if (
    local.toISODate() !== last.toISODate() ||
    !profile.days.includes(local.weekday)
  )
    return false;
  const from = local.startOf("day").set({ hour: profile.startHour });
  const until =
    profile.endHour === 24
      ? local.startOf("day").plus({ days: 1 })
      : local.startOf("day").set({ hour: profile.endHour });
  return +start >= +from && +end <= +until;
}
export function overlaps(a: Slot, b: Slot) {
  return (
    Date.parse(a.start) < Date.parse(b.end) &&
    Date.parse(b.start) < Date.parse(a.end)
  );
}
export function findSlots(
  profiles: Profile[],
  busy: Slot[],
  minutes: number,
  now: DateTime = DateTime.utc(),
  limit = 12,
): Slot[] {
  if (profiles.length !== 2) return [];
  const slots: Slot[] = [];
  let start = DateTime.fromMillis(Math.ceil(+now / 900000) * 900000, {
    zone: "utc",
  }).plus({ minutes: 15 });
  const horizon = now.plus({ days: 7 });
  while (+start < +horizon && slots.length < limit) {
    const end = start.plus({ minutes });
    const slot = { start: start.toISO()!, end: end.toISO()! };
    if (
      profiles.every((p) => fitsHours(p, start, end)) &&
      !busy.some((b) => overlaps(slot, b))
    ) {
      slots.push(slot);
      start = end;
    } else start = start.plus({ minutes: 15 });
  }
  return slots;
}
export function acceptPlan(room: Room, planId: string, actor: string): Plan {
  if (!room.profiles.some((p) => p.id === actor))
    throw new Error("Only a partner can accept this plan.");
  const plan = room.plans.find((p) => p.id === planId);
  if (!plan || plan.status === "cancelled")
    throw new Error("This plan is no longer available.");
  if (Date.parse(plan.slot.start) <= Date.now())
    throw new Error("That time has passed. Find a new time.");
  if (
    room.plans.some(
      (p) =>
        p.id !== plan.id && p.status === "saved" && overlaps(p.slot, plan.slot),
    )
  )
    throw new Error("This overlaps an existing plan.");
  if (!plan.acceptedBy.includes(actor)) plan.acceptedBy.push(actor);
  plan.status =
    room.profiles.length === 2 &&
    room.profiles.every((p) => plan.acceptedBy.includes(p.id))
      ? "saved"
      : "pending";
  return plan;
}
