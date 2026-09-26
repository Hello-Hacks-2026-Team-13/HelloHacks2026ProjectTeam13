export type Profile = {
  id: string;
  name: string;
  timezone: string;
  country: string;
  startHour: number;
  endHour: number;
  days: number[];
  genres: number[];
  duration: number;
  calendarConnected: boolean;
};
export type Activity = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  minutes: number;
  kind: "movie" | "game" | "meal" | "conversation" | "creative";
  poster?: string;
  source: "curated" | "tmdb" | "rawg" | "themealdb" | "demo";
  url?: string;
};
export type Slot = { start: string; end: string };
export type Offer = { id: string; slot: Slot; activity: Activity };
export type Plan = Offer & {
  acceptedBy: string[];
  status: "pending" | "saved" | "cancelled";
  createdBy: string;
};
export type Room = {
  id: string;
  profiles: Profile[];
  offers: Offer[];
  plans: Plan[];
  createdAt: string;
};
export type AppState = {
  mode: "demo" | "live";
  userId: string;
  room: Room | null;
  calendarReady: boolean;
  tmdbReady: boolean;
  rawgReady: boolean;
  mealdbReady: boolean;
};
export type Config = {
  mode: "demo" | "live";
  supabaseUrl: string;
  supabasePublishableKey: string;
  calendarReady: boolean;
  tmdbReady: boolean;
  rawgReady: boolean;
  mealdbReady: boolean;
};
