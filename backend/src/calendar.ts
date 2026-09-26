import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { admin, hash, mutateRoom } from "./store.ts";
import { calendarReady, origin } from "./config.ts";
import type { Room, Slot } from "../../shared/types.ts";
const redirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI || `${origin}/api/calendar/callback`;
function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, "hex"),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function unseal(value: string) {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, "hex"),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString(),
  );
}
async function tokenRequest(fields: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...fields,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Google Calendar needs to be reconnected.");
  return response.json();
}
export async function startCalendar(userId: string) {
  if (!admin || !calendarReady)
    throw new Error(
      "Google Calendar credentials have not been configured yet.",
    );
  const state = randomBytes(32).toString("hex");
  await admin
    .from("oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("oauth_states").insert({
    digest: hash(state),
    user_id: userId,
    expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  if (error) throw error;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.freebusy",
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return { url: url.toString(), state };
}
export async function finishCalendar(code: string, state: string) {
  if (!admin || !calendarReady) throw new Error("Calendar is not configured.");
  const { data, error } = await admin
    .from("oauth_states")
    .delete()
    .eq("digest", hash(state))
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .single();
  if (error || !data)
    throw new Error("Calendar connection expired. Please try again.");
  const tokens = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
  });
  if (!tokens.refresh_token)
    throw new Error(
      "Google did not grant offline access. Reconnect Calendar with consent.",
    );
  const { error: saveError } = await admin.from("calendar_tokens").upsert({
    user_id: data.user_id,
    encrypted: seal({ refresh: tokens.refresh_token }),
  });
  if (saveError) throw saveError;
  await mutateRoom(data.user_id, (room) => {
    const p = room.profiles.find((p) => p.id === data.user_id);
    if (p) p.calendarConnected = true;
    room.offers = [];
  });
}
export async function disconnectCalendar(userId: string) {
  if (!admin) return;
  const { error } = await admin
    .from("calendar_tokens")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
  await mutateRoom(userId, (room) => {
    room.profiles.find((p) => p.id === userId)!.calendarConnected = false;
    room.offers = [];
  });
}
export async function calendarBusy(
  room: Room,
  from = new Date(),
  until = new Date(Date.now() + 8 * 86400000),
): Promise<Slot[]> {
  if (!admin) return [];
  return (
    await Promise.all(
      room.profiles
        .filter((p) => p.calendarConnected)
        .map(async (p) => {
          const { data, error } = await admin!
            .from("calendar_tokens")
            .select("encrypted")
            .eq("user_id", p.id)
            .single();
          if (error || !data)
            throw new Error(`${p.name} needs to reconnect Google Calendar.`);
          const tokens = await tokenRequest({
            refresh_token: unseal(data.encrypted).refresh,
            grant_type: "refresh_token",
          });
          const response = await fetch(
            "https://www.googleapis.com/calendar/v3/freeBusy",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                timeMin: from.toISOString(),
                timeMax: until.toISOString(),
                items: [{ id: "primary" }],
              }),
              signal: AbortSignal.timeout(12000),
            },
          );
          if (!response.ok)
            throw new Error(
              `Could not check ${p.name}'s calendar. Please reconnect it and try again.`,
            );
          const result = await response.json();
          const calendar = result.calendars?.primary;
          if (!calendar || calendar.errors?.length)
            throw new Error(
              `Google could not read ${p.name}'s calendar availability.`,
            );
          return calendar.busy as Slot[];
        }),
    )
  ).flat();
}
