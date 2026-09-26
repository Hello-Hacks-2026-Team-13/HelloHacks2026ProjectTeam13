import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
export const live = process.env.APP_MODE === "live";
export const origin = process.env.APP_ORIGIN || "http://localhost:5173";
export const calendarReady = Boolean(
  live &&
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.TOKEN_ENCRYPTION_KEY,
);
if (
  live &&
  (!process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY)
)
  throw new Error(
    "Live mode requires all three Supabase environment variables. See backend/.env.example.",
  );
if (
  process.env.TOKEN_ENCRYPTION_KEY &&
  !/^[a-fA-F0-9]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY)
)
  throw new Error(
    "TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.",
  );
if (process.env.NODE_ENV === "production" && !live)
  throw new Error(
    "Demo mode is local only. Configure live mode before production.",
  );
