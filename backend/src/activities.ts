import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { Activity, Room, Slot, Offer } from "../../shared/types.ts";
import { findSlots } from "./domain.ts";
const curated: Activity[] = [
  {
    id: "little-things",
    title: "The little things",
    subtitle: "A conversation worth making time for",
    description:
      "Bring a drink. Take turns sharing one small win, one thing you miss, and one thing you’re looking forward to together.",
    minutes: 30,
    kind: "conversation",
    source: "curated",
  },
  {
    id: "postcards",
    title: "Postcards from here",
    subtitle: "Two places. One little adventure.",
    description:
      "Each take five photos on a short walk, then meet on a call and give each other a tour of your day.",
    minutes: 45,
    kind: "creative",
    source: "curated",
  },
  {
    id: "future-weekend",
    title: "Our someday weekend",
    subtitle: "Make a tiny plan for your next hello",
    description:
      "Choose a city together. Spend ten minutes finding a café, an unusual stop, and somewhere to watch the sunset. Compare your picks.",
    minutes: 45,
    kind: "creative",
    source: "curated",
  },
  {
    id: "soundtrack",
    title: "The soundtrack of us",
    subtitle: "A few songs and the stories behind them",
    description:
      "Each pick three songs that remind you of a moment together. Share links and take turns telling the story behind each one.",
    minutes: 30,
    kind: "creative",
    source: "curated",
  },
  {
    id: "draw-each-other",
    title: "Portraits, imperfectly",
    subtitle: "No artistic talent required",
    description:
      "Grab paper and a pen. Take five minutes to draw each other without looking at the page, reveal your masterpieces, and give them ridiculously serious titles.",
    minutes: 30,
    kind: "creative",
    source: "curated",
  },
];
async function tmdb(path: string) {
  const response = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      "Movie suggestions are unavailable. Check the TMDB token or try again.",
    );
  return response.json();
}
async function movies(room: Room): Promise<Activity[]> {
  const common = room.profiles[0].genres.filter((g) =>
    room.profiles[1].genres.includes(g),
  );
  if (!common.length) return [];
  const max = Math.min(...room.profiles.map((p) => p.duration));
  const result = await tmdb(
    `/discover/movie?sort_by=popularity.desc&include_adult=false&vote_count.gte=100&with_genres=${common.join("|")}&with_runtime.lte=${max}`,
  );
  const candidates = await Promise.all(
    (result.results || []).slice(0, 9).map(async (movie: any) => {
      const [details, providers] = await Promise.all([
        tmdb(`/movie/${movie.id}`),
        tmdb(`/movie/${movie.id}/watch/providers`),
      ]);
      if (
        !details.runtime ||
        details.runtime > max ||
        !room.profiles.every((p) => {
          const region = providers.results?.[p.country];
          return (
            region &&
            ["flatrate", "free", "ads", "rent", "buy"].some(
              (k) => region[k]?.length,
            )
          );
        })
      )
        return null;
      return {
        id: `tmdb-${movie.id}`,
        title: movie.title,
        subtitle: `${details.runtime} minutes · Available in both countries`,
        description: movie.overview,
        minutes: details.runtime,
        kind: "movie",
        source: "tmdb",
        poster: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : undefined,
        url: `https://www.themoviedb.org/movie/${movie.id}/watch`,
      } as Activity;
    }),
  );
  return candidates.filter((v): v is Activity => v !== null);
}
export async function suggest(room: Room, busy: Slot[], demo: boolean) {
  const max = Math.min(...room.profiles.map((p) => p.duration));
  const activities: Activity[] = [...curated];
  let notice = "";
  if (process.env.TMDB_READ_ACCESS_TOKEN) {
    try {
      activities.unshift(...(await movies(room)));
    } catch (error) {
      notice =
        (error as Error).message + " Showing curated activities instead.";
    }
  } else if (demo && max >= 100) {
    activities.unshift({
      id: "demo-movie",
      title: "A little movie magic",
      subtitle: "Sample movie-night activity",
      description:
        "Pick a feel-good favorite you both have access to, bring your favorite snacks, and press play together. Live movie picks appear after TMDB is configured.",
      minutes: 100,
      kind: "movie",
      source: "demo",
    });
  } else notice = "TMDB is not configured. Showing curated activities.";
  const blocked = [
    ...busy,
    ...room.plans.filter((p) => p.status !== "cancelled").map((p) => p.slot),
  ];
  const slots = findSlots(room.profiles, blocked, 30);
  const offers: Offer[] = [];
  for (const activity of activities.filter((a) => a.minutes <= max)) {
    const slot = findSlots(
      room.profiles,
      blocked,
      activity.minutes,
      DateTime.utc(),
      1,
    )[0];
    if (slot) offers.push({ id: randomUUID(), slot, activity });
    if (offers.length === 3) break;
  }
  return { offers, slots, notice };
}
