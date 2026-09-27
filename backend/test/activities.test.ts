import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { suggest, commitSuggestions } from "../src/activities.ts";
import { defaultProfile } from "../src/domain.ts";
import type { Room } from "../../shared/types.ts";
function room(): Room {
  return {
    id: "room",
    createdAt: new Date().toISOString(),
    offers: [],
    plans: [],
    profiles: ["a", "b"].map((id) => ({
      ...defaultProfile(id, id),
      timezone: "UTC",
      startHour: 0,
      endHour: 24,
      duration: 120,
      days: [1, 2, 3, 4, 5, 6, 7],
      genres: [35],
      country: "CA",
    })),
  };
}
function providers(
  t: TestContext,
  options: {
    failGame?: boolean;
    repeatRecipe?: boolean;
    unavailableMovies?: boolean;
    movieSearch?: (
      genres: string | null,
      page: number,
    ) => { ids: number[]; totalPages: number };
    runtimeFor?: (id: number) => number;
    unavailableMovieIds?: number[];
  } = {},
) {
  process.env.TMDB_READ_ACCESS_TOKEN = "test-token";
  process.env.RAWG_API_KEY = "test-key";
  let meal = 0;
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    const page = Number(url.searchParams.get("page") || 1);
    let data: unknown;
    if (url.hostname === "api.themoviedb.org") {
      const id = Number(url.pathname.split("/")[3]);
      if (url.pathname.includes("discover")) {
        const search = options.movieSearch?.(
          url.searchParams.get("with_genres"),
          page,
        ) || { ids: [page], totalPages: 2 };
        data = {
          results: search.ids.map((id) => ({
            id,
            title: `Movie ${id}`,
            overview: "Movie",
          })),
          total_pages: search.totalPages,
        };
      } else if (url.pathname.endsWith("/watch/providers"))
        data = {
          results:
            options.unavailableMovies ||
            options.unavailableMovieIds?.includes(id)
              ? {}
              : { CA: { rent: [{}] } },
        };
      else data = { runtime: options.runtimeFor?.(id) ?? 95 };
    } else if (url.hostname === "api.rawg.io") {
      if (options.failGame) return new Response("", { status: 503 });
      data = {
        results: [
          { id: page, name: `Game ${page}`, slug: `game-${page}`, rating: 4 },
        ],
        next: page === 1 ? "next" : null,
      };
    } else if (url.hostname === "www.themealdb.com") {
      meal++;
      data = {
        meals: [
          {
            idMeal: String(options.repeatRecipe ? 1 : meal),
            strMeal: `Meal ${meal}`,
          },
        ],
      };
    } else throw new Error("Unexpected provider");
    return Response.json(data);
  });
  return urls;
}

test("refresh gets exactly one unseen movie/game/recipe, paging beyond seen results", async (t) => {
  const urls = providers(t);
  const state = room();
  const first = await suggest(state, [], false);
  commitSuggestions(state, structuredClone(state), first.offers);
  const second = await suggest(state, [], false);
  assert.deepEqual(
    second.offers.map((o) => o.activity.kind),
    ["movie", "game", "meal"],
  );
  assert.ok(
    second.offers.every(
      (o) => !state.suggestionHistory!.includes(o.activity.id),
    ),
  );
  assert.ok(
    urls.some(
      (url) => url.includes("discover/movie") && url.includes("page=2"),
    ),
  );
  assert.ok(
    urls.some((url) => url.includes("rawg.io") && url.includes("page=2")),
  );
  commitSuggestions(state, structuredClone(state), second.offers);
  assert.equal(state.suggestionHistory!.length, 6);
});

test("repeated random recipes cannot silently repeat or partly replace a set", async (t) => {
  providers(t, { repeatRecipe: true });
  const state = room();
  const first = await suggest(state, [], false);
  commitSuggestions(state, structuredClone(state), first.offers);
  const before = JSON.stringify(state);
  await assert.rejects(suggest(state, [], false), /no unseen suitable recipe/);
  assert.equal(JSON.stringify(state), before);
});

test("provider failure and incompatible availability keep the old set", async (t) => {
  providers(t, { failGame: true });
  const state = room();
  await assert.rejects(suggest(state, [], false), /game provider unavailable/);
  assert.deepEqual(state.offers, []);
  state.profiles[0].duration = 60;
  await assert.rejects(suggest(state, [], false), /90-minute/);
});

test("movies still require availability in both countries", async (t) => {
  providers(t, { unavailableMovies: true });
  await assert.rejects(suggest(room(), [], false), /no unseen suitable movie/);
});

test("simultaneous refreshes cannot commit duplicates or overwrite changed plans", async (t) => {
  providers(t);
  const state = room();
  const snapshot = structuredClone(state);
  const first = await suggest(snapshot, [], false);
  commitSuggestions(state, snapshot, first.offers);
  assert.throws(
    () => commitSuggestions(state, snapshot, first.offers),
    /partner changed/,
  );
  const snapshot2 = structuredClone(state);
  const second = await suggest(snapshot2, [], false);
  state.plans.push({
    ...state.offers[0],
    createdBy: "a",
    acceptedBy: ["a"],
    status: "pending",
  });
  assert.throws(
    () => commitSuggestions(state, snapshot2, second.offers),
    /partner changed/,
  );
});

test("legacy offers and plans are excluded without requiring a migration", async (t) => {
  providers(t);
  const state = room();
  const initial = await suggest(state, [], false);
  state.offers = initial.offers;
  const next = await suggest(state, [], false);
  assert.ok(
    next.offers.every(
      (o) => !initial.offers.some((old) => old.activity.id === o.activity.id),
    ),
  );
});

test("long date lengths do not hide a one-hour cross-timezone overlap", async () => {
  const state = room();
  Object.assign(state.profiles[0], {
    name: "You",
    timezone: "America/Vancouver",
    startHour: 20,
    endHour: 23,
    duration: 150,
  });
  Object.assign(state.profiles[1], {
    name: "Alex",
    timezone: "America/New_York",
    startHour: 20,
    endHour: 24,
    duration: 120,
  });
  await assert.rejects(
    suggest(state, [], false),
    /overlap for at most 60 minutes/,
  );
});

test("short partner date preference identifies the limiting saved setting", async () => {
  const state = room();
  state.profiles[0].duration = 150;
  state.profiles[1].duration = 60;
  state.profiles[1].name = "Alex";
  await assert.rejects(
    suggest(state, [], false),
    /Alex's saved date length is 60 minutes/,
  );
});

test("calendar or plan conflicts are distinguished from incompatible saved hours", async () => {
  const state = room();
  const now = Date.now();
  await assert.rejects(
    suggest(
      state,
      [
        {
          start: new Date(now).toISOString(),
          end: new Date(now + 8 * 86400000).toISOString(),
        },
      ],
      false,
    ),
    /Calendar conflicts or existing plans.*at most 0 minutes/,
  );
});

function movieQueries(urls: string[]) {
  return urls
    .map((url) => new URL(url))
    .filter((url) => url.pathname.includes("discover/movie"));
}

test("different tastes use Adventure OR Animation OR Mystery, without requiring overlap", async (t) => {
  const urls = providers(t, {
    movieSearch: (genres) => ({
      ids: genres === "12|16|9648" ? [31] : [],
      totalPages: 1,
    }),
  });
  const state = room();
  state.profiles[0].genres = [12, 16];
  state.profiles[1].genres = [9648];
  const result = await suggest(state, [], false);
  assert.equal(result.offers[0].activity.id, "tmdb-31");
  assert.equal(result.offers.length, 3);
  assert.deepEqual(
    movieQueries(urls).map((url) => url.searchParams.get("with_genres")),
    ["12|16|9648"],
  );
});

test("shared genres stay ahead of either-partner genres even on later pages", async (t) => {
  const urls = providers(t, {
    movieSearch: (genres, page) => ({
      ids: genres === "16" ? [page] : [99],
      totalPages: 2,
    }),
  });
  const state = room();
  state.profiles[0].genres = [12, 16];
  state.profiles[1].genres = [16, 9648];
  state.suggestionHistory = ["tmdb-1"];
  const result = await suggest(state, [], false);
  assert.equal(result.offers[0].activity.id, "tmdb-2");
  assert.deepEqual(
    movieQueries(urls).map((url) => url.searchParams.get("with_genres")),
    ["16", "16"],
  );
});

test("fallback broadens genres but still excludes repeats, long runtimes, and unavailable movies", async (t) => {
  const urls = providers(t, {
    movieSearch: (genres) => ({
      ids: genres === "16" ? [1, 2, 3] : [1, 2, 3, 4, 5, 6],
      totalPages: 1,
    }),
    runtimeFor: (id) => ([2, 4].includes(id) ? 180 : 95),
    unavailableMovieIds: [3, 5],
  });
  const state = room();
  state.profiles[0].genres = [12, 16];
  state.profiles[1].genres = [16, 9648];
  state.suggestionHistory = ["tmdb-1"];
  const result = await suggest(state, [], false);
  assert.equal(result.offers[0].activity.id, "tmdb-6");
  assert.deepEqual(
    movieQueries(urls).map((url) => url.searchParams.get("with_genres")),
    ["16", "12|16|9648"],
  );
  assert.equal(
    urls.filter((url) => new URL(url).pathname === "/3/movie/2").length,
    1,
  );
  assert.equal(
    urls.filter((url) => new URL(url).pathname === "/3/movie/1").length,
    0,
  );
  commitSuggestions(state, structuredClone(state), result.offers);
  const before = JSON.stringify(state);
  await assert.rejects(suggest(state, [], false), /no unseen suitable movie/);
  assert.equal(JSON.stringify(state), before);
});

test("an empty shared-genre result falls back to the deduplicated union", async (t) => {
  const urls = providers(t, {
    movieSearch: (genres) => ({
      ids: genres === "16" ? [] : [7],
      totalPages: 1,
    }),
  });
  const state = room();
  state.profiles[0].genres = [12, 16, 16];
  state.profiles[1].genres = [16, 9648, 9648];
  assert.equal(
    (await suggest(state, [], false)).offers[0].activity.id,
    "tmdb-7",
  );
  assert.deepEqual(
    movieQueries(urls).map((url) => url.searchParams.get("with_genres")),
    ["16", "12|16|9648"],
  );
});

test("identical tastes do not repeat the same exhausted genre search", async (t) => {
  const urls = providers(t, {
    movieSearch: () => ({ ids: [], totalPages: 1 }),
  });
  await assert.rejects(suggest(room(), [], false), /no unseen suitable movie/);
  assert.equal(movieQueries(urls).length, 1);
});

test("one partner with no genre preference uses the other partner's genres", async (t) => {
  const urls = providers(t);
  const state = room();
  state.profiles[0].genres = [];
  state.profiles[1].genres = [12, 16];
  assert.equal((await suggest(state, [], false)).offers.length, 3);
  assert.equal(movieQueries(urls)[0].searchParams.get("with_genres"), "12|16");
});

test("both partners with no genre preference can receive unrestricted genre suggestions", async (t) => {
  const urls = providers(t);
  const state = room();
  state.profiles.forEach((profile) => {
    profile.genres = [];
  });
  assert.equal((await suggest(state, [], false)).offers.length, 3);
  assert.equal(movieQueries(urls)[0].searchParams.has("with_genres"), false);
  assert.equal(
    movieQueries(urls)[0].searchParams.get("include_adult"),
    "false",
  );
});
