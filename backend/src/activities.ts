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

async function externalJson<T>(url: URL, provider: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error(`${provider} suggestions are unavailable. Try again later.`);
  }
  if (!response.ok)
    throw new Error(`${provider} returned HTTP ${response.status}.`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${provider} returned an invalid response.`);
  }
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

type RawgGame = {
  id: number;
  slug: string;
  name: string;
  background_image: string | null;
  rating: number;
  genres?: { name: string }[];
};

async function games(): Promise<Activity[]> {
  const apiKey = process.env.RAWG_API_KEY?.trim();
  if (!apiKey) return [];

  const url = new URL("https://api.rawg.io/api/games");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("tags", "online-co-op");
  url.searchParams.set("ordering", "-rating");
  url.searchParams.set("page_size", "12");

  const result = await externalJson<{ results?: RawgGame[] }>(url, "RAWG");
  return (result.results || []).slice(0, 6).map(
    (game): Activity => ({
      id: `rawg-${game.id}`,
      title: game.name,
      subtitle: [
        game.rating ? `${game.rating.toFixed(1)} RAWG rating` : "Online co-op",
        game.genres?.[0]?.name,
      ]
        .filter(Boolean)
        .join(" · "),
      description:
        "Try this online co-op game together. Check its supported platforms and access requirements before your date.",
      minutes: 60,
      kind: "game",
      source: "rawg",
      poster: game.background_image || undefined,
      url: `https://rawg.io/games/${encodeURIComponent(game.slug)}`,
    }),
  );
}

type Meal = {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  strSource: string | null;
  strYoutube: string | null;
};

async function mealIdeas(): Promise<Activity[]> {
  const apiKey = process.env.THEMEALDB_API_KEY?.trim() || "1";
  const url = new URL(
    `/api/json/v1/${encodeURIComponent(apiKey)}/random.php`,
    "https://www.themealdb.com",
  );
  const result = await externalJson<{ meals?: Meal[] | null }>(url, "TheMealDB");
  const meal = result.meals?.[0];
  if (!meal) return [];
  const instructions = meal.strInstructions?.trim() || "";

  const idea: Activity = {
    id: `themealdb-${meal.idMeal}`,
    title: meal.strMeal,
    subtitle: [meal.strCategory, meal.strArea]
      .filter(Boolean)
      .join(" · ") || "Recipe for two",
    description: instructions
      ? `${instructions.slice(0, 220).trim()}${instructions.length > 220 ? "…" : ""}`
      : "Pick up the ingredients beforehand, then follow the recipe together over a call and enjoy dinner at the same time.",
    minutes: 90,
    kind: "meal",
    source: "themealdb",
    poster: meal.strMealThumb || undefined,
    url: meal.strSource || meal.strYoutube || undefined,
  };
  return [idea];
}

export async function suggest(room: Room, busy: Slot[], demo: boolean) {
  const max = Math.min(...room.profiles.map((p) => p.duration));
  const notices: string[] = [];
  const hasTmdbToken = Boolean(process.env.TMDB_READ_ACCESS_TOKEN);
  const sampleMovie: Activity = {
    id: "demo-movie",
    title: "A little movie magic",
    subtitle: "Sample movie-night activity",
    description:
      "Pick a feel-good favorite you both have access to, bring your favorite snacks, and press play together. Live movie picks appear after TMDB is configured.",
    minutes: 100,
    kind: "movie",
    source: "demo",
  };
  const movieRequest = hasTmdbToken
    ? movies(room)
    : Promise.resolve(demo && max >= sampleMovie.minutes ? [sampleMovie] : []);
  const gameRequest = process.env.RAWG_API_KEY
    ? games()
    : Promise.resolve([] as Activity[]);
  const [movieResult, gameResult, recipeResult] = await Promise.allSettled([
    movieRequest,
    gameRequest,
    mealIdeas(),
  ]);

  const movieIdeas = movieResult.status === "fulfilled" ? movieResult.value : [];
  const gameIdeas = gameResult.status === "fulfilled" ? gameResult.value : [];
  const recipeIdeas =
    recipeResult.status === "fulfilled" ? recipeResult.value : [];

  if (movieResult.status === "rejected")
    notices.push(
      movieResult.reason instanceof Error
        ? movieResult.reason.message
        : "TMDB suggestions are unavailable.",
    );
  if (!hasTmdbToken && !(demo && max >= sampleMovie.minutes)) {
    notices.push("TMDB is not configured; live movie picks are unavailable.");
  }
  if (gameResult.status === "rejected")
    notices.push(
      gameResult.reason instanceof Error
        ? gameResult.reason.message
        : "RAWG suggestions are unavailable.",
    );
  if (!process.env.RAWG_API_KEY)
    notices.push("Add RAWG_API_KEY in backend/.env to enable game picks.");
  if (recipeResult.status === "rejected")
    notices.push(
      recipeResult.reason instanceof Error
        ? recipeResult.reason.message
        : "TheMealDB suggestions are unavailable.",
    );

  const featured = [movieIdeas[0], gameIdeas[0], recipeIdeas[0]].filter(
    (activity): activity is Activity => Boolean(activity),
  );
  const activities: Activity[] = [
    ...featured,
    ...curated,
    ...movieIdeas.slice(1),
    ...gameIdeas.slice(1),
    ...recipeIdeas.slice(1),
  ];
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
  return { offers, slots, notice: notices.join(" ") };
}
