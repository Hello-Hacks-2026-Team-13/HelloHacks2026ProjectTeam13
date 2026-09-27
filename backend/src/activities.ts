import { randomInt, randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { Activity, Room, Offer } from "../../shared/types.ts";
import { findSlots } from "./domain.ts";
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
    throw new Error(
      `${provider} suggestions are unavailable. Try again later.`,
    );
  }
  if (!response.ok)
    throw new Error(`${provider} returned HTTP ${response.status}.`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${provider} returned an invalid response.`);
  }
}

function titleKey(activity: Activity) {
  const title = activity.title
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
  return `title:${activity.kind}:${title}`;
}

function wasSeen(activity: Activity, seen: Set<string>) {
  return (
    seen.has(activity.id) ||
    ((activity.kind === "movie" || activity.kind === "game") &&
      seen.has(titleKey(activity)))
  );
}

function rememberActivity(activity: Activity, seen: Set<string>) {
  seen.add(activity.id);
  if (activity.kind === "movie" || activity.kind === "game")
    seen.add(titleKey(activity));
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapWith = randomInt(index + 1);
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

async function movies(
  room: Room,
  seen: Set<string>,
  max: number,
): Promise<Activity[]> {
  const combined = [
    ...new Set(room.profiles.flatMap((profile) => profile.genres)),
  ];
  const common = combined.filter((genre) =>
    room.profiles.every((profile) => profile.genres.includes(genre)),
  );
  // Search shared tastes first, including later pages, before broadening to
  // any genre either partner likes. Empty preferences leave genres unrestricted.
  const searches =
    common.length && common.length < combined.length
      ? [common, combined]
      : [combined];
  const checked = new Set(seen);
  for (const genres of searches) {
    for (let page = 1; page <= 5; page++) {
      const result = await tmdb(
        `/discover/movie?sort_by=popularity.desc&include_adult=false&vote_count.gte=100&${genres.length ? `with_genres=${genres.join("|")}&` : ""}with_runtime.lte=${max}&page=${page}`,
      );
      const candidates = await Promise.all(
        (result.results || [])
          .filter(
            (movie: any) =>
              !checked.has(`tmdb-${movie.id}`) &&
              !wasSeen(
                {
                  id: `tmdb-${movie.id}`,
                  title: movie.title,
                  kind: "movie",
                } as Activity,
                seen,
              ),
          )
          .map(async (movie: any) => {
            checked.add(`tmdb-${movie.id}`);
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
      const eligible = candidates.filter((v): v is Activity => v !== null);
      if (eligible.length) return shuffled(eligible);
      if (!result.results?.length || page >= (result.total_pages || 1)) break;
    }
  }
  return [];
}

type RawgGame = {
  id: number;
  slug: string;
  name: string;
  background_image: string | null;
  rating: number;
  genres?: { name: string }[];
};

async function games(seen: Set<string>): Promise<Activity[]> {
  const apiKey = process.env.RAWG_API_KEY?.trim();
  if (!apiKey) return [];

  const url = new URL("https://api.rawg.io/api/games");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("tags", "online-co-op");
  url.searchParams.set("ordering", "-rating");
  url.searchParams.set("page_size", "12");

  for (let page = 1; page <= 5; page++) {
    url.searchParams.set("page", String(page));
    const result = await externalJson<{
      results?: RawgGame[];
      next?: string | null;
    }>(url, "RAWG");
    const eligible = (result.results || [])
      .filter(
        (game) =>
          !wasSeen(
            {
              id: `rawg-${game.id}`,
              title: game.name,
              kind: "game",
            } as Activity,
            seen,
          ),
      )
      .map((game): Activity => ({
        id: `rawg-${game.id}`,
        title: game.name,
        subtitle: [
          game.rating
            ? `${game.rating.toFixed(1)} RAWG rating`
            : "Online co-op",
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
      }));
    if (eligible.length) return shuffled(eligible);
    if (!result.next) break;
  }
  return [];
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

async function mealIdeas(seen: Set<string>): Promise<Activity[]> {
  const apiKey = process.env.THEMEALDB_API_KEY?.trim() || "1";
  const url = new URL(
    `/api/json/v1/${encodeURIComponent(apiKey)}/random.php`,
    "https://www.themealdb.com",
  );
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await externalJson<{ meals?: Meal[] | null }>(
      url,
      "TheMealDB",
    );
    const meal = result.meals?.[0];
    if (!meal || seen.has(`themealdb-${meal.idMeal}`)) continue;
    const instructions = meal.strInstructions?.trim() || "";

    const idea: Activity = {
      id: `themealdb-${meal.idMeal}`,
      title: meal.strMeal,
      subtitle:
        [meal.strCategory, meal.strArea].filter(Boolean).join(" · ") ||
        "Recipe for two",
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
  return [];
}

// Includes legacy offers/plans so deployment does not immediately repeat them.
export function seenActivities(room: Room) {
  const seen = new Set(room.suggestionHistory || []);
  [...room.offers, ...room.plans].forEach((entry) =>
    rememberActivity(entry.activity, seen),
  );
  return seen;
}

function selectionVersion(room: Room) {
  return JSON.stringify([
    room.profiles,
    room.plans,
    room.offers,
    room.suggestionHistory || [],
  ]);
}

export function commitSuggestions(
  current: Room,
  snapshot: Room,
  offers: Offer[],
) {
  if (
    current.id !== snapshot.id ||
    selectionVersion(current) !== selectionVersion(snapshot)
  )
    throw new Error(
      "Your partner changed this space while searching. Try again for a fresh set.",
    );
  const seen = seenActivities(current);
  if (
    offers.length !== 3 ||
    new Set(offers.map((o) => o.activity.kind)).size !== 3 ||
    !["movie", "game", "meal"].every((kind) =>
      offers.some((o) => o.activity.kind === kind),
    ) ||
    offers.some((o) => wasSeen(o.activity, seen))
  )
    throw new Error(
      "Could not create a completely new set. Your previous ideas are unchanged.",
    );
  offers.forEach((o) => rememberActivity(o.activity, seen));
  current.suggestionHistory = [...seen];
  current.offers = offers;
}

// Honest placeholders for credential-free demos, each used at most once.
function demoIdeas(
  kind: "movie" | "game" | "meal",
  seen: Set<string>,
): Activity[] {
  const themes = {
    movie: ["A comedy night", "An animated adventure", "A mystery night"],
    game: [
      "A co-op puzzle session",
      "A shared building session",
      "A co-op adventure",
    ],
    meal: ["A pasta night", "A taco night", "A homemade pizza night"],
  };
  return shuffled(
    themes[kind]
      .map((title, index): Activity => ({
        id: `demo-${kind}-${index}`,
        title,
        kind,
        source: "demo",
        minutes: kind === "movie" ? 90 : kind === "game" ? 60 : 90,
        subtitle: "Demo idea · not a live provider recommendation",
        description:
          "A sample for trying the shared planning flow. Configure the provider to discover specific titles or recipes.",
      }))
      .filter((activity) => !seen.has(activity.id)),
  );
}

export async function suggest(room: Room, demo: boolean) {
  if (room.profiles.length !== 2)
    throw new Error("Pair with your partner first.");
  const max = Math.min(...room.profiles.map((p) => p.duration));
  const blocked = room.plans
    .filter((p) => p.status !== "cancelled")
    .map((p) => p.slot);
  const now = DateTime.utc();
  const slotFor = (minutes: number) =>
    findSlots(room.profiles, blocked, minutes, now, 1)[0];
  // Keep the requested three-category promise; do not replace missing categories.
  if (max < 90)
    throw new Error(
      `A full set needs a 90-minute shared window, but ${room.profiles
        .filter((p) => p.duration < 90)
        .map((p) => `${p.name}'s saved date length is ${p.duration} minutes`)
        .join(
          " and ",
        )}. Both partners must allow at least 1.5 hours and save their preferences. Your previous ideas are unchanged.`,
    );
  if (!slotFor(90)) {
    let available = 0,
      upper = 89;
    while (available < upper) {
      const middle = Math.ceil((available + upper) / 2);
      if (slotFor(middle)) available = middle;
      else upper = middle - 1;
    }
    const conflicts = findSlots(room.profiles, [], 90, now, 1).length > 0;
    const reason = conflicts
      ? "Existing plans reduce your shared free time"
      : "Your saved hours and days, compared across both time zones, overlap";
    throw new Error(
      `${reason} for at most ${available} minutes in the next 7 days. A full set needs 90 minutes together. Date length does not extend your available hours. ${conflicts ? "Review conflicts or choose wider hours" : "Adjust your hours or days"} in Our time and save preferences. Your previous ideas are unchanged.`,
    );
  }
  let low = 90,
    high = max;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (slotFor(middle)) low = middle;
    else high = middle - 1;
  }
  const seen = seenActivities(room);
  const movieRequest = process.env.TMDB_READ_ACCESS_TOKEN
    ? movies(room, seen, low)
    : Promise.resolve(demo ? demoIdeas("movie", seen) : []);
  const gameRequest = process.env.RAWG_API_KEY
    ? games(seen)
    : Promise.resolve(demo ? demoIdeas("game", seen) : []);
  const recipeRequest =
    demo && !process.env.TMDB_READ_ACCESS_TOKEN && !process.env.RAWG_API_KEY
      ? Promise.resolve(demoIdeas("meal", seen))
      : mealIdeas(seen);
  const results = await Promise.allSettled([
    movieRequest,
    gameRequest,
    recipeRequest,
  ]);
  const names = ["movie", "game", "recipe"];
  const offers: Offer[] = [];
  const missing: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      missing.push(`${names[index]} provider unavailable`);
      return;
    }
    const activity = result.value.find(
      (a) => !wasSeen(a, seen) && a.minutes <= max && slotFor(a.minutes),
    );
    if (!activity)
      missing.push(`no unseen suitable ${names[index]} found in this search`);
    else
      offers.push({
        id: randomUUID(),
        activity,
        slot: slotFor(activity.minutes)!,
      });
  });
  if (missing.length)
    throw new Error(
      `Could not find three new ideas: ${missing.join("; ")}. Your previous ideas are unchanged. Try again or adjust your preferences and provider settings.`,
    );
  return {
    offers,
    slots: findSlots(room.profiles, blocked, 30, now),
    notice: offers.some((o) => o.activity.source === "demo")
      ? "Sample ideas are included because a provider is not configured."
      : "",
  };
}
