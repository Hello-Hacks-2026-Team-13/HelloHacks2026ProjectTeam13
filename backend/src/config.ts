import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
try {
  const legacyApiSettings = dotenv.parse(
    readFileSync(fileURLToPath(new URL("../apis.env", import.meta.url))),
  );
  for (const key of [
    "TMDB_READ_ACCESS_TOKEN",
    "RAWG_API_KEY",
    "THEMEALDB_API_KEY",
  ]) {
    if (
      process.env.NODE_ENV !== "test" &&
      !process.env[key]?.trim() &&
      legacyApiSettings[key]?.trim()
    )
      process.env[key] = legacyApiSettings[key].trim();
  }
} catch {
  // apis.env is optional; backend/.env is the documented settings file.
}
export const live = process.env.APP_MODE === "live";
export const origin = (
  process.env.APP_ORIGIN || "http://localhost:8081"
).replace(/\/$/, "");
export const allowedOrigins = new Set([
  origin,
  ...(process.env.APP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean),
]);
export const rawgReady = Boolean(process.env.RAWG_API_KEY?.trim());
export const mealdbReady = Boolean(
  process.env.THEMEALDB_API_KEY?.trim() || "1",
);
if (
  live &&
  (!process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY ||
    !process.env.SUPABASE_SECRET_KEY)
)
  throw new Error(
    "Live mode requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY. See backend/.env.example.",
  );
if (process.env.NODE_ENV === "production" && !live)
  throw new Error(
    "Demo mode is local only. Configure live mode before production.",
  );
