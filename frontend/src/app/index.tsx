import { useEffect, useState } from "react";
import { ActivityIndicator, Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { acrossApi, useAcross } from "@/lib/across";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  Notice,
  NoticeText,
  Screen,
  palette,
} from "@/components/across-ui";
import { newProfile } from "@/components/profile-editor";

export default function HomeScreen() {
  const {
    config,
    state,
    authenticated,
    loading,
    busy,
    error,
    notice,
    execute,
    sendMagicLink,
    clearError,
    signOut,
  } = useAcross();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [invite, setInvite] = useState("");

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const room = state?.room;
  const me = room?.profiles.find((profile) => profile.id === state?.userId);
  const partner = room?.profiles.find(
    (profile) => profile.id !== state?.userId,
  );
  const nextPlan = room?.plans
    .filter(
      (plan) => plan.status === "saved" && Date.parse(plan.slot.start) > now,
    )
    .sort(
      (left, right) =>
        Date.parse(left.slot.start) - Date.parse(right.slot.start),
    )[0];

  if (loading) {
    return (
      <Screen
        title="A little time, just for you two."
        description="Getting your shared space ready…"
      >
        <ActivityIndicator color={palette.coral} size="large" />
      </Screen>
    );
  }

  if (config?.mode === "live" && !authenticated) {
    return (
      <Screen
        eyebrow="A little closer, wherever you are"
        title="Make room for a moment together."
        description="Sign in with a one-time email link to open your private shared space."
      >
        {error ? (
          <Notice tone="error">
            <NoticeText>{error}</NoticeText>
          </Notice>
        ) : null}
        {notice ? (
          <Notice tone="success">
            <NoticeText>{notice}</NoticeText>
          </Notice>
        ) : null}
        <Card>
          <Heading detail="We’ll email a secure sign-in link. No password needed.">
            Sign in to Across
          </Heading>
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Button
            busy={busy}
            disabled={!email.includes("@")}
            onPress={() =>
              void execute(
                () => sendMagicLink(email),
                "Check your inbox for your sign-in link.",
              )
            }
          >
            Email me a sign-in link
          </Button>
          <Body>
            Your account and shared plans stay connected across devices.
          </Body>
        </Card>
      </Screen>
    );
  }

  const createOrJoin = async () => {
    if (joining) {
      return acrossApi("/pair/join", "POST", {
        code: joinCode.trim().toLowerCase(),
        profile: { ...newProfile(name.trim()), name: name.trim() },
      });
    }
    const result = await acrossApi<{ code: string }>("/pair/create", "POST", {
      profile: { ...newProfile(name.trim()), name: name.trim() },
    });
    setInvite(result.code);
    return result;
  };

  return (
    <Screen
      eyebrow={
        partner ? "A little time, just for you two" : "Your story starts here"
      }
      title={
        nextPlan
          ? "You have a date."
          : partner
            ? "Different time zones. Same wavelength."
            : room
              ? "Your shared space is ready."
              : "Make room for a moment together."
      }
      description={
        nextPlan
          ? `${nextPlan.activity.title} is on the calendar. Keep the anticipation close.`
          : partner
            ? "Find a pocket of time and turn it into something worth looking forward to."
            : "Create your private space, invite your person, and find your next moment together."
      }
    >
      {error ? (
        <Notice tone="error">
          <NoticeText>{error}</NoticeText>
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="success">
          <NoticeText>{notice}</NoticeText>
        </Notice>
      ) : null}

      {!room ? (
        <Card>
          <Heading detail="A shared space for two. You can adjust your hours and preferences later.">
            Start your space
          </Heading>
          <View style={styles.segment}>
            <Button
              kind={joining ? "quiet" : "secondary"}
              onPress={() => setJoining(false)}
            >
              Create a space
            </Button>
            <Button
              kind={joining ? "secondary" : "quiet"}
              onPress={() => setJoining(true)}
            >
              Join your person
            </Button>
          </View>
          <Field
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Jamie"
            autoCapitalize="words"
            maxLength={40}
          />
          {joining ? (
            <Field
              label="Invite code"
              value={joinCode}
              onChangeText={(value) => setJoinCode(value.trim())}
              placeholder="Paste their 24-character code"
              autoCapitalize="none"
              maxLength={24}
            />
          ) : null}
          <Button
            busy={busy}
            disabled={
              !name.trim() || (joining && joinCode.trim().length !== 24)
            }
            onPress={() =>
              void execute(
                createOrJoin,
                joining
                  ? "You’re connected."
                  : "Your space is ready. Share the invite with your partner.",
              )
            }
          >
            {joining ? "Join your shared space" : "Make room for two"}
          </Button>
          {config?.mode === "demo" ? (
            <Body>
              Demo mode keeps this space on this server and does not need an
              account.
            </Body>
          ) : null}
        </Card>
      ) : partner ? (
        <>
          <Card style={styles.heroCard}>
            <View
              style={styles.orbit}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.sun} />
              <View style={styles.moon} />
              <Text style={styles.orbitMark}>♡</Text>
            </View>
            <Heading
              detail={
                nextPlan
                  ? `${formatDate(nextPlan.slot.start, me?.timezone)} · ${formatTime(nextPlan.slot.start, me?.timezone)}`
                  : "Made for your schedules. Chosen by you."
              }
            >
              {nextPlan
                ? nextPlan.activity.title
                : `${me?.name || "You"} & ${partner.name}`}
            </Heading>
            <View style={styles.quickActions}>
              <Button
                onPress={() => router.push(nextPlan ? "/plans" : "/ideas")}
              >
                {nextPlan ? "See our plan" : "Find our next date"}
              </Button>
              <Button kind="secondary" onPress={() => router.push("/time")}>
                Our availability
              </Button>
            </View>
          </Card>

          <Card>
            <Heading detail="Schedules use each person’s local time, so the app can find a window that works for both.">
              Here & there
            </Heading>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {initials(me?.name || "You")}
                </Text>
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.profileName}>{me?.name || "You"}</Text>
                <Text style={styles.profileMeta}>
                  {me?.timezone || "Time zone not set"}
                </Text>
              </View>
              <Text style={styles.profileHours}>
                {me ? `${hour(me.startHour)}–${hour(me.endHour)}` : "—"}
              </Text>
            </View>
            <View style={styles.profileRow}>
              <View style={[styles.avatar, styles.avatarBlue]}>
                <Text style={[styles.avatarText, styles.avatarBlueText]}>
                  {initials(partner.name)}
                </Text>
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.profileName}>{partner.name}</Text>
                <Text style={styles.profileMeta}>{partner.timezone}</Text>
              </View>
              <Text
                style={styles.profileHours}
              >{`${hour(partner.startHour)}–${hour(partner.endHour)}`}</Text>
            </View>
            {room.plans.filter((plan) => plan.status === "pending").length >
            0 ? (
              <Button kind="secondary" onPress={() => router.push("/plans")}>
                {room.plans.filter((plan) => plan.status === "pending").length}{" "}
                plan waiting for an answer
              </Button>
            ) : null}
          </Card>

          <Card>
            <Heading detail="One prompt. Two photos. A little piece of each other’s day.">
              Our daily moment
            </Heading>
            <Body>
              Share a photo, wait for the reveal, then leave a little love. Each
              moment disappears after 24 hours.
            </Body>
            <Button onPress={() => router.push("/moment")}>
              Open our daily moment
            </Button>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <Heading detail="Your person can join with this one-time invite code.">
              Invite your partner
            </Heading>
            <Body>
              {invite
                ? "New invite codes replace earlier ones and expire after 24 hours."
                : "Generate a code and send it to your partner to finish pairing."}
            </Body>
            {invite ? (
              <Text selectable style={styles.inviteCode}>
                {invite}
              </Text>
            ) : null}
            <Button
              busy={busy}
              onPress={() =>
                void execute(async () => {
                  const result = await acrossApi<{ code: string }>(
                    "/pair/invite",
                    "POST",
                  );
                  setInvite(result.code);
                  return result;
                }, "Invite code ready to share.")
              }
            >
              {invite ? "Generate a fresh code" : "Generate invite code"}
            </Button>
            {invite ? (
              <Button
                kind="secondary"
                onPress={() =>
                  void Share.share({
                    message: `Join my Across space with this invite code: ${invite}`,
                  })
                }
              >
                Share invite code
              </Button>
            ) : null}
            <Button kind="quiet" onPress={() => router.push("/connections")}>
              Pairing and connections
            </Button>
          </Card>
          {config?.mode === "demo" ? (
            <Card>
              <Heading detail="Preview suggestions and plan approvals with a sample partner.">
                Try the demo together
              </Heading>
              <Button
                busy={busy}
                onPress={() =>
                  void execute(
                    () => acrossApi("/demo/partner", "POST"),
                    "A sample partner joined your space.",
                  )
                }
              >
                Add demo partner
              </Button>
            </Card>
          ) : null}
        </>
      )}

      {authenticated && config?.mode === "live" ? (
        <Button kind="quiet" onPress={() => void signOut()}>
          Sign out
        </Button>
      ) : null}
      {error ? (
        <Button kind="quiet" onPress={clearError}>
          Dismiss error
        </Button>
      ) : null}
    </Screen>
  );
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A"
  );
}
function hour(value: number) {
  if (value === 24) return "12 am";
  const suffix = value >= 12 ? "pm" : "am";
  const display = value % 12 || 12;
  return `${display}${suffix}`;
}
function formatDate(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
function formatTime(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", gap: 8 },
  heroCard: { backgroundColor: "#F5EEE4", overflow: "hidden" },
  orbit: {
    height: 140,
    backgroundColor: "#EEE3D6",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 16,
  },
  sun: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#D77A65" },
  moon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#8299A7" },
  orbitMark: {
    position: "absolute",
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  quickActions: { gap: 9 },
  profileRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 11,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.coralPale,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.coralDark, fontWeight: "800", fontSize: 14 },
  avatarBlue: { backgroundColor: palette.bluePale },
  avatarBlueText: { color: palette.blue },
  profileCopy: { flex: 1 },
  profileName: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  profileMeta: { color: palette.muted, fontSize: 13, marginTop: 3 },
  profileHours: { color: palette.blue, fontSize: 14, fontWeight: "700" },
  inviteCode: {
    color: palette.ink,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 1.2,
    fontWeight: "700",
    textAlign: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: palette.paper,
  },
});
