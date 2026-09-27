import { useEffect, useState, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Film,
  Gamepad2,
  Globe2,
  Heart,
  House,
  Link2,
  LoaderCircle,
  LogOut,
  Moon,
  Plus,
  Settings2,
  Sparkles,
  Sun,
  Utensils,
  Users,
  X,
  WandSparkles,
  MessageCircle,
  Camera,
} from "lucide-react";
import type {
  AppState,
  Config,
  Profile,
  Offer,
  Plan,
} from "../../shared/types";
import {
  api,
  initialize,
  getAuthCallbackError,
  signedIn,
  watchAuth,
  signIn,
  signOut,
} from "./lib/api";

type Tab = "home" | "time" | "ideas" | "plans";
const tabs: { id: Tab; label: string; icon: typeof House }[] = [
  { id: "home", label: "Our space", icon: House },
  { id: "time", label: "Our time", icon: CalendarDays },
  { id: "ideas", label: "Date ideas", icon: Sparkles },
  { id: "plans", label: "Our plans", icon: Heart },
];
const genres = [
  { id: 35, label: "Comedy" },
  { id: 10749, label: "Romance" },
  { id: 12, label: "Adventure" },
  { id: 16, label: "Animation" },
  { id: 18, label: "Drama" },
  { id: 878, label: "Sci-fi" },
  { id: 9648, label: "Mystery" },
  { id: 99, label: "Documentary" },
];
const initialProfile: Profile = {
  id: "",
  name: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  country: "CA",
  startHour: 17,
  endHour: 22,
  days: [1, 2, 3, 4, 5, 6, 7],
  genres: [35, 10749],
  duration: 120,
};
const zones = [
  "America/Vancouver",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];
const localTime = (date: string, zone: string) =>
  new Intl.DateTimeFormat("en", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
const localDate = (date: string, zone: string) =>
  new Intl.DateTimeFormat("en", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
const city = (zone: string) => zone.split("/").at(-1)!.replaceAll("_", " ");
function Button({
  children,
  onClick,
  disabled = false,
  secondary = false,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`${secondary ? "button secondary" : "button"} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,a[href]",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
function ProfileForm({
  profile,
  busy,
  onSave,
}: {
  profile: Profile;
  busy: boolean;
  onSave: (p: Profile) => void;
}) {
  const [form, setForm] = useState(profile);
  const change = (key: keyof Profile, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }));
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <label>
        Your name
        <input
          required
          maxLength={40}
          value={form.name}
          onChange={(e) => change("name", e.target.value)}
          placeholder="What should we call you?"
        />
      </label>
      <div className="form-grid">
        <label>
          Time zone
          <select
            value={form.timezone}
            onChange={(e) => change("timezone", e.target.value)}
          >
            {[...new Set([form.timezone, ...zones])].map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Movie region
          <select
            value={form.country}
            onChange={(e) => change("country", e.target.value)}
          >
            {[
              ["CA", "Canada"],
              ["US", "United States"],
              ["GB", "United Kingdom"],
              ["AU", "Australia"],
              ["IN", "India"],
              ["FR", "France"],
              ["DE", "Germany"],
              ["JP", "Japan"],
              ["SG", "Singapore"],
              ["BR", "Brazil"],
              ["NZ", "New Zealand"],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Days you usually have time</legend>
        <div className="days-picker">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
            <button
              type="button"
              key={i}
              aria-label={
                [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ][i]
              }
              aria-pressed={form.days.includes(i + 1)}
              className={form.days.includes(i + 1) ? "chosen" : ""}
              onClick={() =>
                change(
                  "days",
                  form.days.includes(i + 1)
                    ? form.days.filter((d) => d !== i + 1)
                    : [...form.days, i + 1],
                )
              }
            >
              {day}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Available from
          <select
            value={form.startHour}
            onChange={(e) => change("startHour", +e.target.value)}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {String(i).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <label>
          Until
          <select
            value={form.endHour}
            onChange={(e) => change("endHour", +e.target.value)}
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
              <option key={i} value={i}>
                {i === 24 ? "Midnight" : `${String(i).padStart(2, "0")}:00`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Time for a date
        <select
          value={form.duration}
          onChange={(e) => change("duration", +e.target.value)}
        >
          {[30, 45, 60, 90, 120, 180, 240].map((n) => (
            <option key={n} value={n}>
              Up to {n} minutes
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Your kind of movie</legend>
        <div className="chips">
          {genres.map((g) => (
            <button
              type="button"
              key={g.id}
              className={`chip ${form.genres.includes(g.id) ? "chosen" : ""}`}
              aria-pressed={form.genres.includes(g.id)}
              onClick={() =>
                change(
                  "genres",
                  form.genres.includes(g.id)
                    ? form.genres.filter((id) => id !== g.id)
                    : [...form.genres, g.id],
                )
              }
            >
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="muted small">
        Hours are in your local time zone. Suggestions use both partners’ saved
        availability and existing plans.
      </p>
      <Button
        type="submit"
        disabled={busy || !form.days.length || form.endHour <= form.startHour}
      >
        Save preferences <Check size={16} />
      </Button>
    </form>
  );
}
function ClockCard({
  profile,
  now,
  isYou,
}: {
  profile: Profile;
  now: Date;
  isYou: boolean;
}) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: profile.timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const night = hour < 7 || hour >= 19;
  return (
    <div className={`clock-card ${night ? "night" : "day"}`}>
      <div className="clock-top">
        <span className="avatar">{profile.name[0]}</span>
        <span>
          {profile.name} <small>{isYou ? "YOU" : "YOUR PERSON"}</small>
        </span>
        {night ? <Moon size={19} /> : <Sun size={21} />}
      </div>
      <div className="clock-time">
        {localTime(now.toISOString(), profile.timezone)}
        <span>{city(profile.timezone)}</span>
      </div>
      <div className="clock-footer">
        <span className="status-dot" />
        Using preferred hours
        <Globe2 size={13} />
      </div>
      <div className="landscape" aria-hidden="true">
        <i />
        <b />
        <em />
      </div>
    </div>
  );
}
function ActivityCard({
  offer,
  me,
  onPropose,
  busy,
}: {
  offer: Offer;
  me: Profile;
  onPropose: () => void;
  busy: boolean;
}) {
  const { activity } = offer;
  const Icon =
    activity.kind === "movie"
      ? Film
      : activity.kind === "game"
        ? Gamepad2
        : activity.kind === "meal"
          ? Utensils
          : activity.kind === "creative"
            ? Camera
            : MessageCircle;
  return (
    <motion.article
      layout
      className="activity-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div
        className={`activity-art ${activity.kind}`}
        style={
          activity.poster
            ? {
                backgroundImage: `linear-gradient(0deg,rgba(24,24,30,.55),transparent), url(${activity.poster})`,
              }
            : undefined
        }
      >
        {!activity.poster && (
          <>
            <span className="art-circle" />
            <Icon className="art-icon" size={48} strokeWidth={1.1} />
            <span className="art-mark">
              {activity.kind === "movie"
                ? "JUST PRESS PLAY"
                : activity.kind === "game"
                  ? "CO-OP, TOGETHER"
                  : activity.kind === "meal"
                    ? "COOK SOMETHING TOGETHER"
                    : activity.kind === "creative"
                      ? "A LITTLE CLOSER"
                      : "GOOD COMPANY"}
            </span>
          </>
        )}
        <span className="activity-category">
          <Icon size={12} />
          {activity.kind === "movie"
            ? "Movie night"
            : activity.kind === "game"
              ? "Game night"
              : activity.kind === "meal"
                ? "Cook together"
                : activity.kind === "creative"
                  ? "Something different"
                  : "Quality time"}
        </span>
      </div>
      <div className="activity-body">
        <div className="activity-meta">
          <span>
            <Clock3 size={12} /> {activity.minutes} min
          </span>
          <span>
            {activity.source === "demo"
              ? "Demo idea"
              : activity.source === "tmdb"
                ? "TMDB pick"
                : activity.source === "rawg"
                  ? "RAWG pick"
                  : activity.source === "themealdb"
                    ? "TheMealDB recipe"
                    : "Made for two"}
          </span>
        </div>
        <h3>{activity.title}</h3>
        <p>{activity.description}</p>
        {activity.url && (
          <a
            className="activity-link"
            href={activity.url}
            target="_blank"
            rel="noreferrer"
          >
            {activity.kind === "meal"
              ? "Open recipe"
              : activity.kind === "game"
                ? "View on RAWG"
                : "Movie details"}
          </a>
        )}
        <div className="offer-time">
          <CalendarDays size={14} />
          {localDate(offer.slot.start, me.timezone)} ·{" "}
          {localTime(offer.slot.start, me.timezone)}
        </div>
        <Button secondary disabled={busy} onClick={onPropose}>
          Suggest this date <ArrowRight size={15} />
        </Button>
      </div>
    </motion.article>
  );
}
function exportPlan(plan: Plan) {
  const escape = (v: string) =>
    v
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  const stamp = (s: string) =>
    new Date(s)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Across//Date plans//EN",
    "BEGIN:VEVENT",
    `UID:${plan.id}@across.local`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(plan.slot.start)}`,
    `DTEND:${stamp(plan.slot.end)}`,
    `SUMMARY:${escape(plan.activity.title)}`,
    `DESCRIPTION:${escape(plan.activity.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/calendar;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "our-date.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [state, setState] = useState<AppState | null>(null),
    [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("home"),
    [modal, setModal] = useState<
      "preferences" | "partner" | "connect" | "invite" | null
    >(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [notice, setNotice] = useState(""),
    [searched, setSearched] = useState(false);
  const [invite, setInvite] = useState(""),
    [joinCode, setJoinCode] = useState(""),
    [pairCode, setPairCode] = useState(""),
    [pairName, setPairName] = useState(""),
    [pairProfile, setPairProfile] = useState<Profile>(initialProfile),
    [removalStep, setRemovalStep] = useState<0 | 1 | 2>(0),
    [removalAcknowledged, setRemovalAcknowledged] = useState(false),
    [removalConfirmation, setRemovalConfirmation] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [emailSent, setEmailSent] = useState(false),
    [joining, setJoining] = useState(false),
    [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    const next = await api<AppState>("/state");
    setState(next);
  };
  useEffect(() => {
    let active = true;
    let subscription: ReturnType<typeof watchAuth>;
    void initialize()
      .then(async (c) => {
        if (!active) return;
        setConfig(c);
        const callbackError = getAuthCallbackError();
        if (callbackError) setError(callbackError);
        const auth = await signedIn();
        setAuthenticated(auth);
        if (auth) await refresh();
        if (!active) return;
        subscription = watchAuth(() => {
          void signedIn()
            .then(async (yes) => {
              setAuthenticated(yes);
              if (yes) await refresh();
              else setState(null);
            })
            .catch((e) => setError(e.message));
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [authenticated]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function action(fn: () => Promise<void>, message = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (message) setToast(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  const me = state?.room?.profiles.find((p) => p.id === state.userId),
    partner = state?.room?.profiles.find((p) => p.id !== state.userId),
    room = state?.room;
  const plans = room?.plans.filter((p) => p.status !== "cancelled") || [],
    offers = room?.offers || [],
    nextPlan = plans
      .filter(
        (p) => p.status === "saved" && Date.parse(p.slot.start) > Date.now(),
      )
      .sort((a, b) => Date.parse(a.slot.start) - Date.parse(b.slot.start))[0];
  const openConnections = () => {
    if (me) {
      setPairProfile(me);
      setPairName(me.name);
    }
    setRemovalStep(0);
    setRemovalAcknowledged(false);
    setRemovalConfirmation("");
    setModal("connect");
  };
  const confirmPairRemoval = () =>
    void action(async () => {
      await api("/pair/remove", "POST");
      setRemovalStep(0);
      setRemovalAcknowledged(false);
      setRemovalConfirmation("");
    }, "Pairing removed. You can now join another space.");
  const joinWithPairCode = () =>
    void action(async () => {
      await api("/pair/join", "POST", {
        code: pairCode.trim(),
        profile: { ...pairProfile, name: pairName.trim() },
      });
      setPairCode("");
      setModal(null);
    }, "You’re connected.");
  const createPairing = () =>
    void action(async () => {
      const result = await api<{ code: string }>("/pair/create", "POST", {
        profile: { ...pairProfile, name: pairName.trim() },
      });
      setInvite(result.code);
      setModal("invite");
    }, "Your new space is ready.");
  const findIdeas = () =>
    void action(async () => {
      const result = await api<{ offers: Offer[]; notice: string }>(
        "/suggestions",
        "POST",
      );
      setNotice(result.notice);
      setSearched(true);
      setTab("ideas");
    });
  const makeSpace = (e: FormEvent) => {
    e.preventDefault();
    void action(
      async () => {
        const profile = { ...initialProfile, name: name.trim() };
        if (joining) {
          await api("/pair/join", "POST", { code: joinCode, profile });
        } else {
          const result = await api<{ code: string }>("/pair/create", "POST", {
            profile,
          });
          setInvite(result.code);
          setModal("invite");
        }
      },
      joining ? "You’re connected." : "Your space is ready.",
    );
  };
  const saveProfile = (profile: Profile) =>
    void action(async () => {
      await api("/preferences", "PUT", {
        profile,
        asPartner: modal === "partner",
      });
      setModal(null);
      setSearched(false);
    }, "Preferences saved.");
  const iconForTab = tabs.find((t) => t.id === tab)!;
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-layout">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setTab("home");
            }}
          >
            <span className="brand-mark">
              <Heart size={24} strokeWidth={1.7} />
            </span>
            across<span className="brand-period">.</span>
          </a>
          <div className="sidebar-label">A LITTLE CLOSER, EVERY DAY</div>
          <nav aria-label="Main navigation">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={tab === id ? "nav-link active" : "nav-link"}
                onClick={() => setTab(id)}
              >
                <Icon size={19} />
                {label}
                {id === "plans" &&
                  plans.filter((p) => p.status === "pending").length > 0 && (
                    <span className="nav-count">
                      {plans.filter((p) => p.status === "pending").length}
                    </span>
                  )}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <div className="tiny-hearts">
              <Heart size={17} />
              <span>······</span>
              <Heart size={13} />
            </div>
            <p>
              Different places.
              <br />
              Same little world.
            </p>
          </div>
          <div className="sidebar-bottom">
            <button className="nav-link" onClick={openConnections}>
              <Settings2 size={18} />
              Connections
            </button>
            <div className="user-card">
              <span className="avatar coral">{me?.name[0] || "Y"}</span>
              <div>
                <strong>{me?.name || "Your space"}</strong>
                <small>
                  {config?.mode === "demo"
                    ? "Demo workspace"
                    : "Just the two of you"}
                </small>
              </div>
              {config?.mode === "live" && authenticated && (
                <button
                  className="icon-button"
                  title="Sign out"
                  onClick={() =>
                    void signOut().catch((e) => setError(e.message))
                  }
                >
                  <LogOut size={17} />
                </button>
              )}
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <span className="breadcrumb">
              Our little world <ChevronRight size={13} />{" "}
              <strong>{iconForTab.label}</strong>
            </span>
            <div className="topbar-right">
              <span className="today">
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                }).format(now)}
              </span>
              <button className="mode-badge" onClick={openConnections}>
                <span className="status-dot" />
                {config?.mode === "live" ? "Private space" : "Demo mode"}
              </button>
            </div>
          </header>
          <main>
            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {loading ? (
              <div className="loading-state">
                <LoaderCircle className="spin" size={26} />
                <p>Making a little room for you…</p>
              </div>
            ) : !config ? (
              <div className="empty-panel">
                <h2>Let’s get connected.</h2>
                <p>
                  Start the frontend and API with <code>npm run dev</code>, then
                  reload.
                </p>
                <Button onClick={() => location.reload()}>Try again</Button>
              </div>
            ) : !authenticated ? (
              <section className="auth-card">
                <div className="eyebrow">WELCOME TO ACROSS</div>
                <h1>
                  A little distance.
                  <br />A lot of possibility.
                </h1>
                <p>Your shared space for finding time and making plans.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    void signIn(email)
                      .then(() => setEmailSent(true))
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  <label>
                    Email address
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  <Button type="submit" disabled={busy}>
                    Send sign-in link <ArrowRight size={16} />
                  </Button>
                </form>
                {emailSent && (
                  <p className="success-text" role="status">
                    Check your inbox for your secure sign-in link. Open it in
                    this same browser and profile. If your email opens
                    elsewhere, copy the link and paste it into this browser.
                  </p>
                )}
              </section>
            ) : (
              <>
                <section className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {tab === "home"
                        ? "YOUR SHARED CORNER OF THE WORLD"
                        : tab === "time"
                          ? "A MOMENT THAT WORKS FOR BOTH OF YOU"
                          : tab === "ideas"
                            ? "LESS SCROLLING. MORE TOGETHER."
                            : "SOMETHING TO LOOK FORWARD TO"}
                    </div>
                    <h1>
                      {tab === "home" ? (
                        <>
                          Closer, even from <em>here.</em>
                        </>
                      ) : tab === "time" ? (
                        <>
                          Make a little <em>time.</em>
                        </>
                      ) : tab === "ideas" ? (
                        <>
                          Your next <em>little date.</em>
                        </>
                      ) : (
                        <>
                          Good things, <em>planned.</em>
                        </>
                      )}
                    </h1>
                    <p>
                      {tab === "home"
                        ? "A little planning. A little spontaneity. More time for the two of you."
                        : tab === "time"
                          ? "Two schedules, two time zones. Let’s find where they meet."
                          : tab === "ideas"
                            ? "Thoughtful picks that fit your time, your tastes, and both of you."
                            : "A suggestion becomes a plan when you both say yes."}
                    </p>
                  </div>
                  {me && (
                    <button
                      className="text-button"
                      onClick={() => setModal("preferences")}
                    >
                      <Settings2 size={16} /> Preferences
                    </button>
                  )}
                </section>
                {!room ? (
                  <section className="onboarding panel">
                    <div className="onboarding-copy">
                      <span className="step-tag">
                        01 / START WITH EACH OTHER
                      </span>
                      <h2>
                        Every good plan
                        <br />
                        starts with two.
                      </h2>
                      <p>
                        Create your private space, invite your person, and find
                        your next moment together.
                      </p>
                      <div className="pair-art" aria-hidden="true">
                        <span>you</span>
                        <div>
                          ····
                          <Heart size={24} />
                          ····
                        </div>
                        <span>them</span>
                      </div>
                      <div className="privacy-note">
                        <Link2 size={15} /> One invite. One partner. Just your
                        space.
                      </div>
                    </div>
                    <form onSubmit={makeSpace}>
                      <div className="segmented">
                        <button
                          type="button"
                          className={!joining ? "selected" : ""}
                          onClick={() => setJoining(false)}
                        >
                          Create a space
                        </button>
                        <button
                          type="button"
                          className={joining ? "selected" : ""}
                          onClick={() => setJoining(true)}
                        >
                          Join your person
                        </button>
                      </div>
                      <label>
                        Your name
                        <input
                          required
                          maxLength={40}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Jamie"
                        />
                      </label>
                      {joining && (
                        <label>
                          Invite code
                          <input
                            required
                            minLength={24}
                            maxLength={24}
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.trim())}
                            placeholder="Paste their invite code"
                          />
                        </label>
                      )}
                      <p className="muted small">
                        We’ll start with evening availability in{" "}
                        {city(initialProfile.timezone)}. You can adjust it next.
                      </p>
                      <Button type="submit" disabled={busy}>
                        {joining
                          ? "Join your shared space"
                          : "Make room for two"}
                        <ArrowRight size={17} />
                      </Button>
                      {config.mode === "demo" && (
                        <div className="demo-note">
                          You’re trying the demo. No sign-in or credentials
                          needed.
                        </div>
                      )}
                    </form>
                  </section>
                ) : (
                  <>
                    {tab === "home" && (
                      <>
                        <section className="hero-card">
                          <div className="hero-copy">
                            <span className="hero-eyebrow">
                              <span className="status-dot" />
                              {partner
                                ? "A LITTLE TIME, JUST FOR YOU TWO"
                                : "YOUR STORY STARTS HERE"}
                            </span>
                            <h2>
                              {nextPlan ? (
                                <>
                                  You have a date.
                                  <br />
                                  <em>Let the countdown begin.</em>
                                </>
                              ) : partner ? (
                                <>
                                  Different time zones.
                                  <br />
                                  <em>Same wavelength.</em>
                                </>
                              ) : (
                                <>
                                  Your half is here.
                                  <br />
                                  <em>Bring your person.</em>
                                </>
                              )}
                            </h2>
                            <p>
                              {nextPlan
                                ? `${nextPlan.activity.title} · ${localDate(nextPlan.slot.start, me!.timezone)} at ${localTime(nextPlan.slot.start, me!.timezone)}`
                                : partner
                                  ? "Find a pocket of time and turn it into something worth looking forward to."
                                  : "Invite your partner into your shared space. Good things happen from there."}
                            </p>
                            <Button
                              disabled={busy}
                              onClick={
                                nextPlan
                                  ? () => setTab("plans")
                                  : partner
                                    ? findIdeas
                                    : () => setModal("invite")
                              }
                            >
                              {nextPlan
                                ? "See our plan"
                                : partner
                                  ? "Find our next date"
                                  : "Invite your partner"}
                              <ArrowRight size={16} />
                            </Button>
                            <span className="hero-footnote">
                              {partner
                                ? "Made for your schedules. Chosen by you."
                                : "Your invite expires after 24 hours."}
                            </span>
                          </div>
                          <div className="orbit-art" aria-hidden="true">
                            <div className="orbit orbit-one" />
                            <div className="orbit orbit-two" />
                            <span className="orbit-star star-one">✦</span>
                            <span className="orbit-star star-two">✧</span>
                            <div className="orb orb-coral">
                              <Sun size={52} strokeWidth={1} />
                            </div>
                            <div className="orb orb-blue">
                              <Moon size={45} strokeWidth={1} />
                            </div>
                            <div className="orbit-heart">
                              <Heart size={23} fill="currentColor" />
                            </div>
                            <span className="orbit-caption">
                              a world apart, a moment together
                            </span>
                          </div>
                        </section>
                        <section className="section">
                          <div className="section-heading">
                            <h2>
                              Here & there<span className="heading-dot">.</span>
                            </h2>
                            <button
                              className="text-button"
                              onClick={() => setTab("time")}
                            >
                              Our availability <ArrowRight size={14} />
                            </button>
                          </div>
                          <div className="clocks-grid">
                            <ClockCard profile={me!} now={now} isYou />
                            <div className="clock-connector">
                              <Heart size={16} />
                              <span>TOGETHER</span>
                            </div>
                            {partner ? (
                              <ClockCard
                                profile={partner}
                                now={now}
                                isYou={false}
                              />
                            ) : (
                              <button
                                className="partner-placeholder"
                                onClick={() => setModal("invite")}
                              >
                                <span className="plus-circle">
                                  <Plus size={23} />
                                </span>
                                <strong>A spot for your person</strong>
                                <span>
                                  Send an invite to connect your worlds
                                </span>
                              </button>
                            )}
                          </div>
                        </section>
                        <section className="bottom-grid">
                          <div className="panel next-up">
                            <div className="section-heading">
                              <h2>
                                <CalendarDays size={17} /> On the horizon
                              </h2>
                              <button
                                className="text-button"
                                onClick={() => setTab("plans")}
                              >
                                View all <ArrowRight size={14} />
                              </button>
                            </div>
                            {nextPlan ? (
                              <>
                                <span className="pill green">IT’S A DATE</span>
                                <h3>{nextPlan.activity.title}</h3>
                                <p>
                                  {localDate(nextPlan.slot.start, me!.timezone)}{" "}
                                  ·{" "}
                                  {localTime(nextPlan.slot.start, me!.timezone)}
                                </p>
                              </>
                            ) : plans.some((p) => p.status === "pending") ? (
                              <>
                                <span className="pill amber">
                                  WAITING FOR A YES
                                </span>
                                <h3>A little plan is taking shape.</h3>
                                <p>Head to Our plans to see the suggestion.</p>
                              </>
                            ) : (
                              <>
                                <div className="empty-icon">
                                  <CalendarDays size={24} />
                                </div>
                                <h3>Your next memory goes here.</h3>
                                <p>
                                  Find something you both want to make time for.
                                </p>
                              </>
                            )}
                          </div>
                          <div className="daily-prompt">
                            <span className="eyebrow">
                              <MessageCircle size={14} /> WHEN YOUR DAYS DON’T
                              LINE UP
                            </span>
                            <h3>
                              “What’s one tiny thing
                              <br />
                              you wish I’d seen today?”
                            </h3>
                            <p>
                              Send your person a photo and the story behind it.
                            </p>
                            <button
                              className="text-button"
                              onClick={() =>
                                void navigator.clipboard
                                  .writeText(
                                    "What’s one tiny thing you wish I’d seen today? Send me a photo and the story behind it.",
                                  )
                                  .then(() =>
                                    setToast(
                                      "Prompt copied. Send it to your person.",
                                    ),
                                  )
                                  .catch(() =>
                                    setError(
                                      "Clipboard unavailable. You can select and copy the prompt.",
                                    ),
                                  )
                              }
                            >
                              Copy today’s prompt <Copy size={14} />
                            </button>
                          </div>
                        </section>
                      </>
                    )}
                    {tab === "time" && (
                      <>
                        <div className="section-heading">
                          <h2>Your usual windows</h2>
                          <span className="muted small">
                            Next 7 days · Daylight saving aware
                          </span>
                        </div>
                        <div className="availability-grid">
                          {room.profiles.map((p) => (
                            <article
                              className="panel availability-card"
                              key={p.id}
                            >
                              <div className="profile-line">
                                <span className="avatar coral">
                                  {p.name[0]}
                                </span>
                                <div>
                                  <h3>
                                    {p.name}
                                    {p.id === me!.id ? " (you)" : ""}
                                  </h3>
                                  <span className="muted small">
                                    {city(p.timezone)}
                                  </span>
                                </div>
                                {(p.id === me!.id ||
                                  config.mode === "demo") && (
                                  <button
                                    className="icon-button"
                                    title="Edit available hours"
                                    onClick={() =>
                                      setModal(
                                        p.id === me!.id
                                          ? "preferences"
                                          : "partner",
                                      )
                                    }
                                  >
                                    <Settings2 size={18} />
                                  </button>
                                )}
                              </div>
                              <div className="hours-display">
                                {String(p.startHour).padStart(2, "0")}:00{" "}
                                <span>—</span>{" "}
                                {p.endHour === 24
                                  ? "00:00"
                                  : `${String(p.endHour).padStart(2, "0")}:00`}
                              </div>
                              <div className="days-display">
                                {["M", "T", "W", "T", "F", "S", "S"].map(
                                  (d, i) => (
                                    <span
                                      key={i}
                                      className={
                                        p.days.includes(i + 1) ? "on" : ""
                                      }
                                    >
                                      {d}
                                    </span>
                                  ),
                                )}
                              </div>
                              <p className="small muted">
                                Up to {p.duration} minutes together ·{" "}
                                Saved availability
                              </p>
                            </article>
                          ))}
                        </div>
                        <div className="panel matching-panel">
                          <div className="empty-icon">
                            <Clock3 size={28} />
                          </div>
                          <h2>Let’s find your overlap.</h2>
                          <p>
                            We compare both local schedules and existing plans
                            to find enough time for each activity.
                          </p>
                          <Button
                            disabled={busy || !partner}
                            onClick={findIdeas}
                          >
                            {busy ? (
                              <LoaderCircle className="spin" size={17} />
                            ) : (
                              <Sparkles size={17} />
                            )}
                            Find times & ideas
                          </Button>
                          {!partner && (
                            <p className="small muted">
                              Invite your partner first.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                    {tab === "ideas" && (
                      <>
                        <div className="section-heading">
                          <h2>
                            {offers.length
                              ? "A few ways to be together"
                              : "Find your next moment"}
                          </h2>
                          <Button
                            secondary
                            disabled={busy || !partner}
                            onClick={findIdeas}
                          >
                            {busy ? (
                              <LoaderCircle className="spin" size={16} />
                            ) : (
                              <WandSparkles size={16} />
                            )}{" "}
                            {offers.length
                              ? "Refresh ideas"
                              : "Find our next date"}
                          </Button>
                        </div>
                        {notice && <div className="info-banner">{notice}</div>}
                        {offers.length ? (
                          <>
                            <div className="activities-grid">
                              {offers.map((offer) => (
                                <ActivityCard
                                  key={offer.id}
                                  offer={offer}
                                  me={me!}
                                  busy={busy}
                                  onPropose={() =>
                                    void action(async () => {
                                      await api("/plans", "POST", {
                                        offerId: offer.id,
                                      });
                                      setTab("plans");
                                    }, "Your suggestion is waiting for your partner’s yes.")
                                  }
                                />
                              ))}
                            </div>
                            <p className="muted small ideas-footnote">
                              Times shown in {city(me!.timezone)}. A suggestion
                              includes your acceptance; your partner confirms
                              next. Movie availability may require a
                              subscription or rental.
                            </p>
                          </>
                        ) : (
                          <div className="empty-panel">
                            <Sparkles size={35} />
                            <h2>
                              {searched
                                ? "No shared window this week."
                                : "Something more than “what should we do?”"}
                            </h2>
                            <p>
                              {searched
                                ? "Try wider hours or a shorter date in Preferences. In the meantime, send a photo of something that made you smile."
                                : partner
                                  ? "We’ll match your available time with movie picks and small ways to connect."
                                  : "Your partner needs to join before we can match your schedules."}
                            </p>
                            <Button
                              secondary
                              onClick={() =>
                                setModal(partner ? "preferences" : "invite")
                              }
                            >
                              {partner
                                ? "Adjust preferences"
                                : "Invite your partner"}
                              <ArrowRight size={15} />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                    {tab === "plans" && (
                      <>
                        {plans.length ? (
                          <div className="plans-list">
                            {plans.map((plan) => (
                              <article
                                key={plan.id}
                                className="panel plan-card"
                              >
                                <div className="plan-date">
                                  <span>
                                    {new Intl.DateTimeFormat("en", {
                                      timeZone: me!.timezone,
                                      month: "short",
                                    }).format(new Date(plan.slot.start))}
                                  </span>
                                  <strong>
                                    {new Intl.DateTimeFormat("en", {
                                      timeZone: me!.timezone,
                                      day: "numeric",
                                    }).format(new Date(plan.slot.start))}
                                  </strong>
                                </div>
                                <div className="plan-content">
                                  <span
                                    className={`pill ${plan.status === "saved" ? "green" : "amber"}`}
                                  >
                                    {plan.status === "saved"
                                      ? "IT’S A DATE"
                                      : "WAITING FOR BOTH OF YOU"}
                                  </span>
                                  <h2>{plan.activity.title}</h2>
                                  <div className="plan-times">
                                    {room.profiles.map((p) => (
                                      <span key={p.id}>
                                        <Clock3 size={13} />
                                        {p.name}:{" "}
                                        {localDate(plan.slot.start, p.timezone)}
                                        ,{" "}
                                        {localTime(plan.slot.start, p.timezone)}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="acceptance-row">
                                    {room.profiles.map((p) => (
                                      <span
                                        key={p.id}
                                        className={
                                          plan.acceptedBy.includes(p.id)
                                            ? "accepted"
                                            : ""
                                        }
                                      >
                                        {plan.acceptedBy.includes(p.id) ? (
                                          <Check size={13} />
                                        ) : (
                                          <Clock3 size={13} />
                                        )}{" "}
                                        {p.name}
                                        {plan.acceptedBy.includes(p.id)
                                          ? " said yes"
                                          : " is deciding"}
                                      </span>
                                    ))}
                                  </div>
                                  {plan.activity.url && (
                                    <a
                                      className="text-button"
                                      href={plan.activity.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Where to watch <ArrowRight size={13} />
                                    </a>
                                  )}
                                </div>
                                <div className="plan-actions">
                                  {plan.status === "saved" ? (
                                    <Button
                                      secondary
                                      onClick={() => exportPlan(plan)}
                                    >
                                      <ArrowDownToLine size={15} /> Calendar
                                      file
                                    </Button>
                                  ) : (
                                    <>
                                      {!plan.acceptedBy.includes(me!.id) && (
                                        <Button
                                          disabled={busy}
                                          onClick={() =>
                                            void action(async () => {
                                              await api(
                                                `/plans/${plan.id}/accept`,
                                                "POST",
                                              );
                                            }, "Your answer is saved.")
                                          }
                                        >
                                          <Heart size={15} /> Count me in
                                        </Button>
                                      )}
                                      {config.mode === "demo" &&
                                        partner &&
                                        !plan.acceptedBy.includes(
                                          partner.id,
                                        ) && (
                                          <Button
                                            disabled={busy}
                                            onClick={() =>
                                              void action(async () => {
                                                await api(
                                                  `/plans/${plan.id}/accept`,
                                                  "POST",
                                                  { asPartner: true },
                                                );
                                              }, "Both said yes. Your plan is saved.")
                                            }
                                          >
                                            <Check size={15} /> Demo:{" "}
                                            {partner.name} says yes
                                          </Button>
                                        )}
                                    </>
                                  )}
                                  <button
                                    className="text-button subtle"
                                    disabled={busy}
                                    onClick={() =>
                                      void action(async () => {
                                        await api(
                                          `/plans/${plan.id}/cancel`,
                                          "POST",
                                        );
                                      }, "Plan cancelled.")
                                    }
                                  >
                                    Cancel plan
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-panel">
                            <Heart size={35} />
                            <h2>A little anticipation looks good on you.</h2>
                            <p>
                              Your shared plans will live here once you choose a
                              date idea.
                            </p>
                            <Button
                              disabled={busy || !partner}
                              onClick={findIdeas}
                            >
                              Find our next date <ArrowRight size={16} />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                <footer>
                  <span>
                    across<span className="brand-period">.</span>{" "}
                    <span className="footer-tag">
                      Small moments. Less distance.
                    </span>
                  </span>
                  <span>
                    {config.mode === "demo"
                      ? "Demo data · Saved on this device’s local server"
                      : "Your shared space · Made for two"}
                  </span>
                </footer>
              </>
            )}
          </main>
        </div>
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              className="toast"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <Check size={17} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
        {busy && (
          <div className="working" role="status">
            <LoaderCircle size={14} className="spin" /> Working on it…
          </div>
        )}
        {modal === "preferences" && me && (
          <Modal
            title="A little about your days"
            onClose={() => setModal(null)}
          >
            <ProfileForm profile={me} busy={busy} onSave={saveProfile} />
          </Modal>
        )}
        {modal === "partner" && partner && config?.mode === "demo" && (
          <Modal
            title="Demo partner preferences"
            onClose={() => setModal(null)}
          >
            <p className="muted small">
              Demo only. In a live space, each partner edits their own
              preferences.
            </p>
            <ProfileForm profile={partner} busy={busy} onSave={saveProfile} />
          </Modal>
        )}
        {modal === "invite" && (
          <Modal
            title={partner ? "Your worlds are connected" : "Bring your person"}
            onClose={() => setModal(null)}
          >
            {partner ? (
              <>
                <div className="pair-success">
                  <Heart size={35} />
                  <h3>
                    {me?.name} & {partner.name}
                  </h3>
                  <p>You’re ready to find a little time together.</p>
                </div>
                <Button
                  onClick={() => {
                    setModal(null);
                    setTab("time");
                  }}
                >
                  Set our availability <ArrowRight size={16} />
                </Button>
              </>
            ) : (
              <>
                <p className="muted">
                  Send this code to your partner. They can choose “Join your
                  person” when they open Across.
                </p>
                {invite ? (
                  <div className="invite-code">
                    <code>{invite}</code>
                    <button
                      className="icon-button"
                      title="Copy invite code"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(invite)
                          .then(() => setToast("Invite code copied."))
                          .catch(() =>
                            setError(
                              "Select and copy the invite code manually.",
                            ),
                          )
                      }
                    >
                      <Copy size={18} />
                    </button>
                  </div>
                ) : (
                  <Button
                    secondary
                    disabled={busy || !room}
                    onClick={() =>
                      void action(async () => {
                        const result = await api<{ code: string }>(
                          "/pair/invite",
                          "POST",
                        );
                        setInvite(result.code);
                      })
                    }
                  >
                    Create a fresh invite <Link2 size={16} />
                  </Button>
                )}
                <p className="small muted">
                  One use · Expires in 24 hours. A fresh code replaces the
                  previous one.
                </p>
                {config?.mode === "demo" && (
                  <div className="demo-partner-box">
                    <Users size={22} />
                    <h3>Just looking around?</h3>
                    <p>
                      Add Alex as a demo partner to try the full experience.
                    </p>
                    <Button
                      disabled={busy || !room}
                      onClick={() =>
                        void action(async () => {
                          await api("/demo/partner", "POST");
                          setModal(null);
                        }, "Alex joined your demo space.")
                      }
                    >
                      Add demo partner <Plus size={16} />
                    </Button>
                  </div>
                )}
              </>
            )}
          </Modal>
        )}
        {modal === "connect" && (
          <Modal title="Your connections" onClose={() => setModal(null)}>
            <p className="muted">
              {config?.mode === "demo"
                ? "You’re in a local demo. Live accounts become available after project setup."
                : "Connect what helps you make time for each other."}
            </p>
            <section
              className="connection-item pairing-item"
              aria-label="Partner pairing"
            >
              <div className="connection-icon">
                <Heart size={21} />
              </div>
              <div className="connection-pairing">
                <h3>Partner pairing</h3>
                {partner ? (
                  <>
                    <p>Paired with {partner.name}.</p>
                    {removalStep === 1 ? (
                      <div className="pairing-request-status">
                        <p>
                          Removing this pairing immediately removes both
                          partners from the shared space. Shared plans, the
                          invite and memberships are deleted from Supabase.
                          Your individual sign-in accounts remain.
                        </p>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={removalAcknowledged}
                            onChange={(e) =>
                              setRemovalAcknowledged(e.target.checked)
                            }
                          />
                          I understand this removes the pairing for both of us
                          and deletes its shared data.
                        </label>
                        <div className="button-row">
                          <Button
                            disabled={!removalAcknowledged}
                            onClick={() => setRemovalStep(2)}
                          >
                            Continue
                          </Button>
                          <Button secondary onClick={() => setRemovalStep(0)}>
                            Go back
                          </Button>
                        </div>
                      </div>
                    ) : removalStep === 2 ? (
                      <div className="pairing-request-status">
                        <p>
                          To permanently remove the pairing, type{" "}
                          <strong>REMOVE</strong> below.
                        </p>
                        <label>
                          Type REMOVE to confirm
                          <input
                            value={removalConfirmation}
                            onChange={(e) =>
                              setRemovalConfirmation(e.target.value)
                            }
                            autoComplete="off"
                          />
                        </label>
                        <div className="button-row">
                          <Button
                            disabled={
                              busy ||
                              removalConfirmation.trim().toUpperCase() !==
                                "REMOVE"
                            }
                            onClick={confirmPairRemoval}
                          >
                            Permanently remove pairing
                          </Button>
                          <Button
                            secondary
                            onClick={() => {
                              setRemovalStep(1);
                              setRemovalConfirmation("");
                            }}
                          >
                            Go back
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="pairing-request-status">
                        <p>
                          To change partners, enter the new partner’s invite
                          code here. The code stays available so you can join
                          after removing this pairing.
                        </p>
                        <label>
                          New partner’s invite code
                          <input
                            value={pairCode}
                            onChange={(e) =>
                              setPairCode(e.target.value.trim().slice(0, 24))
                            }
                            minLength={24}
                            maxLength={24}
                            autoComplete="off"
                            placeholder="Paste their 24-character code"
                          />
                        </label>
                        <Button
                          secondary
                          disabled={busy}
                          onClick={() => {
                            setRemovalAcknowledged(false);
                            setRemovalStep(1);
                          }}
                        >
                          Remove or change partner
                        </Button>
                      </div>
                    )}
                  </>
                ) : room ? (
                  <div className="pairing-request-status">
                    <p>
                      Your space is ready. Share an invite, or join another
                      person’s space with their code.
                    </p>
                    <label>
                      Invite code
                      <input
                        value={pairCode}
                        onChange={(e) =>
                          setPairCode(e.target.value.trim().slice(0, 24))
                        }
                        minLength={24}
                        maxLength={24}
                        autoComplete="off"
                        placeholder="Enter a 24-character code"
                      />
                    </label>
                    <Button
                      disabled={busy || pairCode.trim().length !== 24}
                      onClick={joinWithPairCode}
                    >
                      Join with invite code
                    </Button>
                    <Button
                      secondary
                      disabled={busy}
                      onClick={() => setModal("invite")}
                    >
                      View or create your invite
                    </Button>
                  </div>
                ) : (
                  <div className="pairing-request-status">
                    <p>
                      You’re not currently paired. Join someone with their
                      invite code or create a new space.
                    </p>
                    <label>
                      Your name
                      <input
                        value={pairName}
                        onChange={(e) => setPairName(e.target.value)}
                        maxLength={40}
                        required
                      />
                    </label>
                    <label>
                      Invite code
                      <input
                        value={pairCode}
                        onChange={(e) =>
                          setPairCode(e.target.value.trim().slice(0, 24))
                        }
                        minLength={24}
                        maxLength={24}
                        autoComplete="off"
                        placeholder="Enter a 24-character code"
                      />
                    </label>
                    <div className="button-row">
                      <Button
                        disabled={busy || pairCode.trim().length !== 24}
                        onClick={joinWithPairCode}
                      >
                        Join with code
                      </Button>
                      <Button
                        secondary
                        disabled={busy || !pairName.trim()}
                        onClick={createPairing}
                      >
                        Create a space
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
            <div className="connection-item">
              <div className="connection-icon">
                <Users size={21} />
              </div>
              <div>
                <h3>Supabase</h3>
                <p>
                  {config?.mode === "live"
                    ? "Accounts and shared plans connected"
                    : "Local demo storage · Setup required for live accounts"}
                </p>
              </div>
              <span
                className={`pill ${config?.mode === "live" ? "green" : "neutral"}`}
              >
                {config?.mode === "live" ? "LIVE" : "DEMO"}
              </span>
            </div>
            <div className="connection-item">
              <div className="connection-icon">
                <Film size={21} />
              </div>
              <div>
                <h3>TMDB</h3>
                <p>
                  {config?.tmdbReady
                    ? "Live movie suggestions are available."
                    : "Curated date ideas work now. Add a TMDB token for live movie picks."}
                </p>
              </div>
              <span
                className={`pill ${config?.tmdbReady ? "green" : "neutral"}`}
              >
                {config?.tmdbReady ? "READY" : "SETUP"}
              </span>
            </div>
            <div className="connection-item">
              <div className="connection-icon">
                <Gamepad2 size={21} />
              </div>
              <div>
                <h3>RAWG</h3>
                <p>
                  {config?.rawgReady
                    ? "Online co-op game suggestions are available."
                    : "Add RAWG_API_KEY to backend/.env for game suggestions."}
                </p>
              </div>
              <span
                className={`pill ${config?.rawgReady ? "green" : "neutral"}`}
              >
                {config?.rawgReady ? "READY" : "SETUP"}
              </span>
            </div>
            <div className="connection-item">
              <div className="connection-icon">
                <Utensils size={21} />
              </div>
              <div>
                <h3>TheMealDB</h3>
                <p>
                  {config?.mealdbReady
                    ? "Recipe suggestions use the free test key unless you configure a supporter key."
                    : "Recipe suggestions are unavailable right now."}
                </p>
              </div>
              <span
                className={`pill ${config?.mealdbReady ? "green" : "neutral"}`}
              >
                {config?.mealdbReady ? "READY" : "SETUP"}
              </span>
            </div>
            <div className="credits">
              <img
                width="100"
                alt="The Movie Database"
                src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
              />
              <p>
                This product uses the TMDB API but is not endorsed or certified
                by TMDB.
              </p>
              <p>
                Streaming availability provided by{" "}
                <a
                  href="https://www.justwatch.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  JustWatch
                </a>
                . Confirm access before your date.
              </p>
            </div>
          </Modal>
        )}
        {modal && error && (
          <div className="modal-error error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
export default App;
