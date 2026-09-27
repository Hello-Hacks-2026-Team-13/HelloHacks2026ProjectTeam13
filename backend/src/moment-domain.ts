import { DateTime } from "luxon";
import type { Room } from "../../shared/types.ts";
import type { MomentRound, MomentsView } from "../../shared/moments.ts";
import { MOMENT_PROMPTS } from "../../shared/moments.ts";

export const DAY = 86400000;
const PROMPT_LEAD_HOURS = 12;

function scheduledTime(day: DateTime, revealTime: string) {
  const [hour, minute] = revealTime.split(":").map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

// Select the timezone whose local day begins first for the pair.
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
    const localNow = DateTime.fromMillis(now, { zone });
    const revealTime = localNow.toFormat("HH:mm");
    const first = localNow.plus({ days: 1 }).set({ second: 0, millisecond: 0 });
    room.moments = {
      zone,
      revealTime,
      firstReveal: first.toISO()!,
      rounds: [],
      cadenceVersion: 2,
    };
  }
  const schedule = room.moments;
  let first = DateTime.fromISO(schedule.firstReveal, { zone: schedule.zone });
  if (!schedule.cadenceVersion) {
    // Old schedules picked 9 pm at least 24 hours away, which could leave the
    // first reveal almost 48 hours out. Re-anchor only those long waits.
    if (first.toMillis() - now > DAY) {
      first = DateTime.fromMillis(now, { zone: schedule.zone }).plus({ days: 1 });
      schedule.firstReveal = first.toISO()!;
      let next = first;
      for (const round of schedule.rounds
        .filter((r) => Date.parse(r.revealAt) > now)
        .sort((a, b) => Date.parse(a.revealAt) - Date.parse(b.revealAt))) {
        round.id = String(next.toMillis());
        round.revealAt = next.toISO()!;
        round.expiresAt = new Date(next.toMillis() + DAY).toISOString();
        next = next.plus({ days: 1 });
      }
    }
    schedule.cadenceVersion = 1;
  }
  if (schedule.cadenceVersion === 1) {
    schedule.revealTime ||= first.toFormat("HH:mm");
    for (const round of schedule.rounds) {
      round.promptAt ||= DateTime.fromISO(round.revealAt, {
        zone: schedule.zone,
      })
        .minus({ hours: PROMPT_LEAD_HOURS })
        .toISO()!;
    }
    schedule.cadenceVersion = 2;
  }
  if (!schedule.revealTime) schedule.revealTime = first.toFormat("HH:mm");
  let reveal = first;
  while (reveal.toMillis() <= now) reveal = reveal.plus({ days: 1 });
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
    const previousPrompt = schedule.rounds
      .filter((round) => Date.parse(round.revealAt) < reveal.toMillis())
      .sort((a, b) => Date.parse(b.revealAt) - Date.parse(a.revealAt))[0]
      ?.prompt;
    const previousIndex = previousPrompt
      ? MOMENT_PROMPTS.indexOf(previousPrompt)
      : -1;
    schedule.rounds.push({
      id,
      prompt:
        MOMENT_PROMPTS[
          previousIndex >= 0
            ? (previousIndex + 1) % MOMENT_PROMPTS.length
            : (seed + days) % MOMENT_PROMPTS.length
        ],
      promptAt: reveal.minus({ hours: PROMPT_LEAD_HOURS }).toISO()!,
      revealAt: reveal.toISO()!,
      expiresAt: new Date(reveal.toMillis() + DAY).toISOString(),
      photos: {},
    });
  }
  return schedule.rounds.find((r) => r.id === id)!;
}

export function setMomentRevealTime(
  room: Room,
  revealTime: string,
  now = Date.now(),
) {
  const schedule = room.moments;
  if (!schedule)
    throw new Error("Open the daily check-in before setting its time.");
  if (schedule.revealTime === revealTime) return;

  let first = scheduledTime(
    DateTime.fromMillis(now, { zone: schedule.zone }),
    revealTime,
  );
  if (first.toMillis() <= now) first = first.plus({ days: 1 });
  while (first.toMillis() - now < PROMPT_LEAD_HOURS * 3600000)
    first = first.plus({ days: 1 });

  const activePrompt = schedule.rounds
    .filter(
      (round) =>
        Date.parse(round.promptAt || round.revealAt) <= now &&
        Date.parse(round.revealAt) > now,
    )
    .sort((a, b) => Date.parse(a.revealAt) - Date.parse(b.revealAt))[0];
  schedule.revealTime = revealTime;
  schedule.firstReveal = first.toISO()!;
  schedule.cadenceVersion = 2;
  let next = first;
  for (const round of schedule.rounds
    .filter((r) => r !== activePrompt && Date.parse(r.revealAt) > now)
    .sort((a, b) => Date.parse(a.revealAt) - Date.parse(b.revealAt))) {
    round.id = String(next.toMillis());
    round.promptAt = next.minus({ hours: PROMPT_LEAD_HOURS }).toISO()!;
    round.revealAt = next.toISO()!;
    round.expiresAt = new Date(next.toMillis() + DAY).toISOString();
    next = next.plus({ days: 1 });
  }
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
  if (round.promptAt && Date.parse(round.promptAt) > now)
    throw new Error("The daily prompt is not available yet.");
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
    revealTime: room.moments!.revealTime!,
    rounds: room
      .moments!.rounds.filter((r) => Date.parse(r.expiresAt) > now)
      .map((r) => ({
        id: r.id,
        prompt:
          Date.parse(r.promptAt || r.revealAt) <= now ? r.prompt : null,
        promptAt: r.promptAt || r.revealAt,
        promptReleased: Date.parse(r.promptAt || r.revealAt) <= now,
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
