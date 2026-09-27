import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";

import type { AppState as AcrossState, Config } from "../../../shared/types";

function getDefaultApiUrl() {
  if (Platform.OS !== "web") {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      try {
        const host = new URL(`http://${hostUri}`).hostname;
        return `http://${host}:3001`;
      } catch {
        // Fall back to localhost if Expo provides an invalid development host.
      }
    }
  }
  return "http://localhost:3001";
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const configuredHost = configuredApiUrl
  ? new URL(configuredApiUrl).hostname
  : "";
const configuredUrlPointsToThisDevice =
  Platform.OS !== "web" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(configuredHost);
const API_URL = (
  configuredUrlPointsToThisDevice
    ? getDefaultApiUrl()
    : configuredApiUrl || getDefaultApiUrl()
).replace(/\/$/, "");
const DEMO_TOKEN_KEY = "across-demo-session";
const nativeClientHeader: Record<string, string> =
  Platform.OS === "web" ? {} : { "X-Across-Client": "native" };

let client: SupabaseClient | null = null;
let demoToken = "";
let mode: Config["mode"] = "demo";
let configPromise: Promise<Config> | undefined;

async function fetchApi(url: string, options?: RequestInit) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      `Can't connect to Across at ${API_URL}. Start the app with "npm run dev" from the project root. For a phone, keep it on the same Wi-Fi as your computer.`,
    );
  }
}

async function initializeClient(): Promise<Config> {
  const response = await fetchApi(`${API_URL}/api/config`, {
    headers: nativeClientHeader,
  });
  if (!response.ok) {
    throw new Error(
      `Can't reach Across at ${API_URL}. Start the backend and check EXPO_PUBLIC_API_URL.`,
    );
  }
  const config = (await response.json()) as Config;
  mode = config.mode;

  if (config.mode === "live") {
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
      },
    });
  } else {
    demoToken = (await AsyncStorage.getItem(DEMO_TOKEN_KEY)) || "";
    if (!demoToken) {
      const sessionResponse = await fetchApi(`${API_URL}/api/demo/session`, {
        method: "POST",
        headers: nativeClientHeader,
      });
      if (!sessionResponse.ok)
        throw new Error("Could not start a demo session. Try again.");
      demoToken = (await sessionResponse.json()).token as string;
      await AsyncStorage.setItem(DEMO_TOKEN_KEY, demoToken);
    }
  }
  return config;
}

export function initializeAcross() {
  if (!configPromise) {
    configPromise = initializeClient().catch((error: unknown) => {
      configPromise = undefined;
      throw error;
    });
  }
  return configPromise;
}

function currentToken() {
  return client ? client.auth.getSession() : null;
}

export async function acrossApi<T = { ok: boolean }>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  return acrossRequest<T>(
    path,
    method,
    body === undefined ? undefined : JSON.stringify(body),
    "application/json",
  );
}

export async function uploadMomentPhoto(roundId: string, base64: string) {
  return acrossRequest(
    `/moments/${roundId}/photo`,
    "PUT",
    base64,
    "text/plain",
  );
}

async function acrossRequest<T>(
  path: string,
  method: string,
  body: string | undefined,
  contentType: string,
): Promise<T> {
  let token = demoToken;
  if (client) token = (await currentToken())?.data.session?.access_token || "";
  const response = await fetchApi(`${API_URL}/api${path}`, {
    method,
    credentials: "include",
    headers: {
      ...nativeClientHeader,
      "Content-Type": contentType,
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  const result = await response.json().catch(() => {
    throw new Error(
      "The Across API is unavailable. Check the server and try again.",
    );
  });
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}

type AcrossContextValue = {
  config: Config | null;
  state: AcrossState | null;
  authenticated: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
  clearError: () => void;
  clearMessages: () => void;
  refresh: () => Promise<void>;
  execute: <T>(
    task: () => Promise<T>,
    successMessage?: string,
  ) => Promise<T | undefined>;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AcrossContext = createContext<AcrossContextValue | null>(null);

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function handleAuthLink(url: string) {
  if (!client) return;
  const params = Linking.parse(url).queryParams || {};
  const code = stringParam(params.code);
  const authError =
    stringParam(params.error_description) || stringParam(params.error);
  if (authError)
    throw new Error(decodeURIComponent(authError.replaceAll("+", " ")));
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
  }
  if (Platform.OS === "web") {
    const callbackUrl = new URL(window.location.href);
    for (const key of ["code", "error", "error_code", "error_description"])
      callbackUrl.searchParams.delete(key);
    if (new URLSearchParams(callbackUrl.hash.slice(1)).has("error"))
      callbackUrl.hash = "";
    window.history.replaceState(window.history.state, "", callbackUrl);
  }
}

export function AcrossProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<AcrossState | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setState(await acrossApi<AcrossState>("/state"));
  }, []);

  useEffect(() => {
    let mounted = true;
    let authSubscription: { unsubscribe: () => void } | undefined;
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthLink(url).catch((cause: unknown) => {
        if (mounted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not complete sign-in.",
          );
      });
    });

    void initializeAcross()
      .then(async (nextConfig) => {
        if (!mounted) return;
        setConfig(nextConfig);
        if (nextConfig.mode === "demo") {
          setAuthenticated(true);
          return refresh();
        }

        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await handleAuthLink(initialUrl);
        const { data } = await client!.auth.getSession();
        if (!mounted) return;
        const hasSession = Boolean(data.session);
        setAuthenticated(hasSession);
        if (hasSession) await refresh();
        authSubscription = client!.auth.onAuthStateChange((_event, session) => {
          setAuthenticated(Boolean(session));
          if (session)
            setTimeout(() => {
              void acrossApi<AcrossState>("/state")
                .then(setState)
                .catch((cause: unknown) => {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not load your space.",
                  );
                });
            }, 0);
          else setState(null);
        }).data.subscription;
      })
      .catch((cause: unknown) => {
        if (mounted)
          setError(
            cause instanceof Error ? cause.message : "Could not start Across.",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      linkSubscription.remove();
      authSubscription?.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!authenticated || mode === "demo") return;
    void client?.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void client?.auth.startAutoRefresh();
      else void client?.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => void refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [authenticated, refresh]);

  const sendMagicLink = useCallback(async (email: string) => {
    if (!client) throw new Error("Live sign-in is not configured.");
    const { error: authError } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo:
          Platform.OS === "web"
            ? window.location.origin
            : Linking.createURL("/"),
      },
    });
    if (authError) throw authError;
  }, []);

  const signOut = useCallback(async () => {
    if (!client) return;
    const { error: authError } = await client.auth.signOut();
    if (authError) throw authError;
  }, []);

  const clearMessages = useCallback(() => {
    setError("");
    setNotice("");
  }, []);

  const execute = useCallback(
    async <T,>(
      task: () => Promise<T>,
      successMessage = "",
    ): Promise<T | undefined> => {
      if (busy) return undefined;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const result = await task();
        if (
          demoToken ||
          (client && (await client.auth.getSession()).data.session)
        )
          await refresh();
        if (successMessage) setNotice(successMessage);
        return result;
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Something went wrong.",
        );
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const value = useMemo<AcrossContextValue>(
    () => ({
      config,
      state,
      authenticated,
      loading,
      busy,
      error,
      notice,
      clearError: () => setError(""),
      clearMessages,
      refresh,
      execute,
      sendMagicLink,
      signOut,
    }),
    [
      config,
      state,
      authenticated,
      loading,
      busy,
      error,
      notice,
      clearMessages,
      refresh,
      execute,
      sendMagicLink,
      signOut,
    ],
  );

  return (
    <AcrossContext.Provider value={value}>{children}</AcrossContext.Provider>
  );
}

export function useAcross() {
  const context = useContext(AcrossContext);
  if (!context)
    throw new Error("useAcross must be used inside AcrossProvider.");
  return context;
}
