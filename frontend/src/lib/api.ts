import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../../../shared/types";
let supabase: SupabaseClient | null = null;
let demoToken = localStorage.getItem("across-demo-session") || "";
let initialization: Promise<Config> | undefined;
export function initialize(): Promise<Config> {
  return (initialization ??= initializeOnce());
}
async function initializeOnce(): Promise<Config> {
  const response = await fetch("/api/config");
  if (!response.ok)
    throw new Error(
      "Could not reach the API. Run npm run dev from the repository root.",
    );
  const config = (await response.json()) as Config;
  if (config.mode === "live") {
    const { createClient } = await import("@supabase/supabase-js");
    supabase = createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      { auth: { flowType: "pkce" } },
    );
  } else if (!demoToken) {
    const response = await fetch("/api/demo/session", { method: "POST" });
    if (!response.ok)
      throw new Error("Could not start a demo session. Try again.");
    demoToken = (await response.json()).token;
    localStorage.setItem("across-demo-session", demoToken);
  }
  return config;
}
export async function signedIn() {
  return !supabase || Boolean((await supabase.auth.getSession()).data.session);
}
export function watchAuth(callback: () => void) {
  return supabase?.auth.onAuthStateChange(() => {
    setTimeout(callback, 0);
  }).data.subscription;
}
export async function signIn(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}
export async function signOut() {
  const { error } = await supabase!.auth.signOut();
  if (error) throw error;
}
export async function api<T = { ok: boolean }>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = supabase
    ? (await supabase.auth.getSession()).data.session?.access_token
    : demoToken;
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token || ""}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => {
    throw new Error("The API is unavailable. Check the server and try again.");
  });
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
