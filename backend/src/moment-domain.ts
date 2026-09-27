import { DateTime } from "luxon";
import type { Room } from "../../shared/types.ts";
import type { MomentRound, MomentsView } from "../../shared/moments.ts";
import { MOMENT_PROMPTS } from "../../shared/moments.ts";

export const DAY = 86400000;

// Select the zone whose 21:00 occurs first for the same calendar date.
// Persist it: travel or edits to preferences cannot move an active deadline.
export function prepareMoments(room: Room, now = Date.now()) {
  if (room.profiles.length !== 2)
    throw new Error("Pair with your partner to start Our daily moment.");
  if (!room.moments) {
    const zones = room.profiles.map((p) => p.timezone);
    const zone = zones.sort(
      (a, b) =>
        DateTime.fromMillis(now, { zone: b }).offset -
          DateTime.fromMillis(now, { zone: a }).offset || a.localeCompare(b),
    )[0];
    let first = DateTime.fromMillis(now + DAY, { zone }).set({
      hour: 21,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    if (first.toMillis() < now + DAY) first = first.plus({ days: 1 });
    room.moments = { zone, firstReveal: first.toISO()!, rounds: [] };
  }
  const schedule = room.moments;
  const first = DateTime.fromISO(schedule.firstReveal, { zone: schedule.zone });
  let reveal = DateTime.fromMillis(now, { zone: schedule.zone }).set({
    hour: 21,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  if (reveal.toMillis() <= now) reveal = reveal.plus({ days: 1 });
  if (reveal < first) reveal = first;
  const id = String(reveal.toMillis());
  schedule.rounds = schedule.rounds.filter(
    (r) => Date.parse(r.expiresAt) > now,
  );
  if (!schedule.rounds.some((r) => r.id === id)) {
    const days = Math.round(
      reveal.startOf("day").diff(first.startOf("day"), "days").days,
    );
    const seed = [...room.id].reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0,
    );
    schedule.rounds.push({
      id,
      prompt: MOMENT_PROMPTS[(seed + days) % MOMENT_PROMPTS.length],
      revealAt: reveal.toISO()!,
      expiresAt: new Date(reveal.toMillis() + DAY).toISOString(),
      photos: {},
    });
  }
  return schedule.rounds.find((r) => r.id === id)!;
}

export function activeRound(
  room: Room,
  id: string,
  now = Date.now(),
): MomentRound {
  const round = room.moments?.rounds.find((r) => r.id === id);
  if (!round || Date.parse(round.expiresAt) <= now)
    throw new Error("This moment has expired. Open the current prompt.");
  return round;
}

export function requireUpload(room: Room, id: string, now = Date.now()) {
  const round = activeRound(room, id, now);
  if (Date.parse(round.revealAt) <= now)
    throw new Error(
      "This moment has revealed. Add a photo to the new prompt instead.",
    );
  return round;
}

export function canReadPhoto(
  round: MomentRound,
  owner: string,
  viewer: string,
  now = Date.now(),
) {
  return (
    Date.parse(round.expiresAt) > now &&
    (owner === viewer || Date.parse(round.revealAt) <= now)
  );
}

export function momentsView(
  room: Room,
  userId: string,
  now = Date.now(),
): MomentsView {
  return {
    serverNow: new Date(now).toISOString(),
    zone: room.moments!.zone,
    rounds: room
      .moments!.rounds.filter((r) => Date.parse(r.expiresAt) > now)
      .map((r) => ({
        id: r.id,
        prompt: r.prompt,
        revealAt: r.revealAt,
        expiresAt: r.expiresAt,
        revealed: Date.parse(r.revealAt) <= now,
        photos: room.profiles.map((p) => {
          const photo = r.photos[p.id];
          const visible = !!photo && canReadPhoto(r, p.id, userId, now);
          return {
            userId: p.id,
            name: p.name,
            submitted: !!photo,
            visible,
            revision: visible ? photo.revision : undefined,
            reactions: visible ? photo.reactions : [],
          };
        }),
      })),
  };
}
