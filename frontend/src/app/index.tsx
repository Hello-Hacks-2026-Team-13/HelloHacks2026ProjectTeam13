import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { artwork, fontFamily } from "@/constants/design";
import type { Plan } from "../../../shared/types";
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
        title="Welcome Back!"
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
      header="people"
      adornment={partner ? "sunrise" : undefined}
      title={
        partner
          ? `${greeting(now, me?.timezone)}, ${me?.name || "you"}`
          : room
            ? "Your shared space is ready."
            : "Make room for a moment together."
      }
      description={
        partner
          ? "Dashboard"
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
          {room.plans
            .filter(
              (plan) =>
                plan.status === "saved" && Date.parse(plan.slot.end) > now,
            )
            .sort((a, b) => Date.parse(a.slot.start) - Date.parse(b.slot.start))
            .slice(0, 2)
            .map((plan) => (
              <HomeDate
                key={plan.id}
                plan={plan}
                timezone={me?.timezone || "UTC"}
                partnerTimezone={partner.timezone}
              />
            ))}
          {!nextPlan ? (
            <Card style={styles.heroCard}>
              <Heading detail="A movie, a game, or something delicious. Find a little time for each other.">
                Your next date starts here
              </Heading>
              <Button onPress={() => router.push("/ideas")}>
                Find our next date
              </Button>
            </Card>
          ) : null}
          {room.offers.length ? (
            <View style={{ gap: 16 }}>
              <Heading>Recommended for you</Heading>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 20, paddingBottom: 4 }}
              >
                {room.offers.map((offer) => (
                  <Pressable
                    key={offer.id}
                    accessibilityRole="button"
                    accessibilityLabel={`View idea: ${offer.activity.title}`}
                    onPress={() => router.push("/ideas")}
                    style={{ width: 162, gap: 7 }}
                  >
                    {offer.activity.poster ? (
                      <Image
                        source={{ uri: offer.activity.poster }}
                        contentFit="cover"
                        style={styles.recommendationImage}
                      />
                    ) : (
                      <View
                        style={[
                          styles.recommendationImage,
                          styles.recommendationFallback,
                        ]}
                      >
                        <Text style={styles.kind}>
                          {offer.activity.kind === "meal"
                            ? "RECIPE"
                            : offer.activity.kind.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text numberOfLines={2} style={styles.recommendationTitle}>
                      {offer.activity.title}
                    </Text>
                    <Text style={styles.recommendationMeta}>
                      {offer.activity.kind === "meal"
                        ? "RECIPE"
                        : offer.activity.kind.toUpperCase()}{" "}
                      · {offer.activity.minutes} MIN
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <Button kind="quiet" onPress={() => router.push("/time")}>
            Our time · Edit availability
          </Button>

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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open our daily moment"
            onPress={() => router.push("/moment")}
            style={styles.momentCard}
          >
            <Image
              source={artwork.promptHeart}
              contentFit="contain"
              style={{ width: 24, height: 24 }}
            />
            <Text style={styles.momentEyebrow}>
              When your days don’t line up
            </Text>
            <Text style={styles.momentTitle}>Our Daily Moment</Text>
            <Text style={styles.momentCopy}>
              One prompt. Two photos. A little piece of each other’s day.
            </Text>
            <Text style={styles.momentAction}>Share today’s moment →</Text>
          </Pressable>
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

function greeting(now: number, timezone = "UTC") {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(now),
  );
  return hour < 12
    ? "Good Morning"
    : hour < 18
      ? "Good Afternoon"
      : "Good Evening";
}
function HomeDate({
  plan,
  timezone,
  partnerTimezone,
}: {
  plan: Plan;
  timezone: string;
  partnerTimezone: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`See our plan: ${plan.activity.title}`}
      onPress={() => router.push("/plans")}
      style={styles.dateHero}
    >
      {plan.activity.poster ? (
        <Image
          source={{ uri: plan.activity.poster }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={styles.dateOverlay} />
      <Text style={styles.dateTitle}>{plan.activity.title}</Text>
      <Text style={styles.dateKind}>
        {plan.activity.kind === "meal"
          ? "RECIPE"
          : plan.activity.kind.toUpperCase()}
      </Text>
      <View style={styles.dateFooter}>
        <View style={{ gap: 10 }}>
          <Text style={styles.datePill}>
            {formatDate(plan.slot.start, timezone).toUpperCase()}
          </Text>
          <Text style={styles.dateTimes}>
            {formatTime(plan.slot.start, timezone)} /{" "}
            {formatTime(plan.slot.start, partnerTimezone)}
          </Text>
        </View>
        <Text style={styles.viewPlan}>VIEW PLAN</Text>
      </View>
    </Pressable>
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
  heroCard: {
    backgroundColor: palette.peach,
    overflow: "hidden",
    borderColor: palette.peach,
  },
  dateHero: {
    minHeight: 157,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#62659B",
    padding: 22,
    justifyContent: "center",
  },
  dateOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(49,35,92,0.55)",
  },
  dateTitle: { fontFamily, fontSize: 19, fontWeight: "700", color: "white" },
  dateKind: {
    fontFamily,
    color: "white",
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 3,
  },
  dateFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 16,
  },
  datePill: {
    fontFamily,
    color: palette.ink,
    fontSize: 11,
    backgroundColor: "#FFFFFFE6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  dateTimes: { fontFamily, color: "white", fontSize: 11 },
  viewPlan: {
    fontFamily,
    color: "#561B2A",
    fontSize: 12,
    fontWeight: "600",
    borderRadius: 24,
    paddingHorizontal: 17,
    paddingVertical: 12,
    backgroundColor: "#FFAEBB",
  },
  recommendationImage: {
    width: 162,
    height: 113,
    borderRadius: 10,
    backgroundColor: palette.bluePale,
  },
  recommendationFallback: { alignItems: "center", justifyContent: "center" },
  kind: { fontFamily, color: palette.blue, fontSize: 12, fontWeight: "700" },
  recommendationTitle: {
    fontFamily,
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  recommendationMeta: {
    fontFamily,
    color: palette.muted,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  momentCard: {
    backgroundColor: palette.rose,
    padding: 25,
    borderRadius: 32,
    gap: 12,
  },
  momentEyebrow: { fontFamily, color: "#4C1623", fontSize: 14 },
  momentTitle: {
    fontFamily,
    color: "#4C1623",
    fontSize: 26,
    fontWeight: "700",
  },
  momentCopy: { fontFamily, color: "#4C1623", fontSize: 16, lineHeight: 24 },
  momentAction: {
    fontFamily,
    color: "#4C1623",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
    marginTop: 8,
  },
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
