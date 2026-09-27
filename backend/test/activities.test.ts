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
      if (url.pathname.includes("discover"))
        data = {
          results: [{ id: page, title: `Movie ${page}`, overview: "Movie" }],
          total_pages: 2,
        };
      else if (url.pathname.endsWith("/watch/providers"))
        data = {
          results: options.unavailableMovies ? {} : { CA: { rent: [{}] } },
        };
      else data = { runtime: 95 };
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

test("provider failure, incompatible availability, and no shared genres keep the old set", async (t) => {
  providers(t, { failGame: true });
  const state = room();
  await assert.rejects(suggest(state, [], false), /game provider unavailable/);
  assert.deepEqual(state.offers, []);
  state.profiles[1].genres = [18];
  await assert.rejects(suggest(state, [], false), /no unseen suitable movie/);
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
