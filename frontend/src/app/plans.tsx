import { useState } from "react";
import { CategoryFilters, type IdeaFilter } from "@/components/figma-ui";
import {
  Alert,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import type { Plan } from "../../../shared/types";
import { acrossApi, useAcross } from "@/lib/across";
import {
  Body,
  Button,
  Card,
  Heading,
  Notice,
  NoticeText,
  Screen,
  palette,
} from "@/components/across-ui";

export default function PlansScreen() {
  const { state, config, busy, error, notice, execute } = useAcross();
  const [filter, setFilter] = useState<IdeaFilter>("all");
  const room = state?.room;
  const me = room?.profiles.find((profile) => profile.id === state?.userId);
  const partner = room?.profiles.find(
    (profile) => profile.id !== state?.userId,
  );
  const plans =
    room?.plans.filter(
      (plan) =>
        plan.status !== "cancelled" &&
        (filter === "all" || plan.activity.kind === filter),
    ) || [];

  return (
    <Screen
      adornment="calendar"
      title="Upcoming Dates"
      description="Suggestions become plans when both people say yes. You can always cancel or pick a new date."
    >
      <CategoryFilters value={filter} onChange={setFilter} />
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
      {!room || !me ? (
        <Card>
          <Body>Create or join a shared space to make plans together.</Body>
          <Button onPress={() => router.push("/")}>Set up your space</Button>
        </Card>
      ) : plans.length ? (
        plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            meId={me.id}
            partnerId={partner?.id}
            partnerName={partner?.name || "partner"}
            timezones={room.profiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
              timezone: profile.timezone,
            }))}
            demo={config?.mode === "demo"}
            busy={busy}
            onAccept={() =>
              void execute(
                () => acrossApi(`/plans/${plan.id}/accept`, "POST"),
                "Your answer is saved.",
              )
            }
            onPartnerAccept={() =>
              void execute(
                () =>
                  acrossApi(`/plans/${plan.id}/accept`, "POST", {
                    asPartner: true,
                  }),
                "Both said yes. Your plan is saved.",
              )
            }
            onCancel={() =>
              void execute(
                () => acrossApi(`/plans/${plan.id}/cancel`, "POST"),
                "Plan cancelled.",
              )
            }
          />
        ))
      ) : (
        <Card>
          <Heading detail="Choose something from your shared availability to get started.">
            Your next plan is waiting to happen.
          </Heading>
          <Body>
            Find a movie, a co-op game, a recipe to make together, or a simple
            way to connect.
          </Body>
          <Button disabled={!partner} onPress={() => router.push("/ideas")}>
            Find our next date
          </Button>
        </Card>
      )}
    </Screen>
  );
}

function PlanCard({
  plan,
  meId,
  partnerId,
  partnerName,
  timezones,
  demo,
  busy,
  onAccept,
  onPartnerAccept,
  onCancel,
}: {
  plan: Plan;
  meId: string;
  partnerId?: string;
  partnerName: string;
  timezones: { id: string; name: string; timezone: string }[];
  demo: boolean;
  busy: boolean;
  onAccept: () => void;
  onPartnerAccept: () => void;
  onCancel: () => void;
}) {
  const pending = plan.status === "pending";
  const sharePlan = () =>
    void Share.share({
      message: `${plan.activity.title}\n${timezones.map(({ name, timezone }) => `${name}: ${formatDate(plan.slot.start, timezone)} at ${formatTime(plan.slot.start, timezone)}`).join("\n")}`,
    });
  return (
    <Card style={styles.planCard}>
      {plan.activity.poster ? (
        <Image
          source={{ uri: plan.activity.poster }}
          accessibilityLabel={`${plan.activity.title} artwork`}
          contentFit="cover"
          style={styles.planImage}
        />
      ) : null}
      <View style={styles.planRow}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateMonth}>
            {formatMonth(plan.slot.start, timezones[0]?.timezone)}
          </Text>
          <Text style={styles.dateDay}>
            {formatDay(plan.slot.start, timezones[0]?.timezone)}
          </Text>
        </View>
        <View style={styles.planContent}>
          <Text
            style={[styles.status, pending ? styles.pending : styles.saved]}
          >
            {pending ? "WAITING FOR BOTH OF YOU" : "IT’S A DATE"}
          </Text>
          <Heading>{plan.activity.title}</Heading>
          <Body>{plan.activity.subtitle}</Body>
          <View style={styles.timeList}>
            {timezones.map(({ name, timezone }) => (
              <Text key={name} style={styles.timeLine}>
                {name}: {formatDate(plan.slot.start, timezone)},{" "}
                {formatTime(plan.slot.start, timezone)}
              </Text>
            ))}
          </View>
          <View style={styles.acceptance}>
            {timezones.map(({ name }, index) => {
              const accepted = plan.acceptedBy.includes(timezones[index].id);
              return (
                <Text key={name} style={styles.acceptanceText}>
                  {accepted ? "✓" : "○"} {name}
                  {accepted ? " said yes" : " is deciding"}
                </Text>
              );
            })}
          </View>
          {plan.activity.url ? (
            <Button
              kind="quiet"
              onPress={() => void Linking.openURL(plan.activity.url!)}
            >
              Open activity details
            </Button>
          ) : null}
          <Button kind="secondary" onPress={sharePlan}>
            Share plan details
          </Button>
          {!pending ? (
            <Button
              kind="quiet"
              onPress={() =>
                void exportPlan(plan).catch((cause: unknown) =>
                  Alert.alert(
                    "Calendar export unavailable",
                    cause instanceof Error
                      ? cause.message
                      : "Please try again.",
                  ),
                )
              }
            >
              Save calendar file (.ics)
            </Button>
          ) : null}
          {pending && !plan.acceptedBy.includes(meId) ? (
            <Button busy={busy} onPress={onAccept}>
              Count me in
            </Button>
          ) : null}
          {pending &&
          demo &&
          partnerId &&
          !plan.acceptedBy.includes(partnerId) ? (
            <Button busy={busy} kind="secondary" onPress={onPartnerAccept}>
              Demo: {partnerName} says yes
            </Button>
          ) : null}
          {pending && plan.acceptedBy.includes(meId) && !demo ? (
            <Body>
              Your answer is saved. Your partner can confirm when they’re ready.
            </Body>
          ) : null}
          <Button kind="danger" disabled={busy} onPress={onCancel}>
            Cancel plan
          </Button>
        </View>
      </View>
    </Card>
  );
}

function formatMonth(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
  }).format(new Date(value));
}
function formatDay(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    day: "numeric",
  }).format(new Date(value));
}
function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function exportPlan(plan: Plan) {
  const escape = (value: string) =>
    value
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  const stamp = (value: string) =>
    new Date(value)
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

  if (Platform.OS === "web") {
    const blobUrl = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${safeFileName(plan.activity.title)}.ics`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return;
  }

  const [{ File, Paths }, Sharing] = await Promise.all([
    import("expo-file-system"),
    import("expo-sharing"),
  ]);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("This device does not have a compatible share sheet.");
  const file = new File(
    Paths.cache,
    `${safeFileName(plan.activity.title)}.ics`,
  );
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/calendar",
    UTI: "com.apple.ical.ics",
    dialogTitle: "Save or share calendar file",
  });
}

function safeFileName(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "across-date"
  );
}

const styles = StyleSheet.create({
  planCard: { padding: 0, overflow: "hidden" },
  planImage: {
    width: "100%",
    aspectRatio: 373 / 157,
    backgroundColor: palette.bluePale,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 20,
  },
  dateBadge: {
    width: 58,
    height: 67,
    borderRadius: 15,
    backgroundColor: palette.coralPale,
    alignItems: "center",
    justifyContent: "center",
  },
  dateMonth: {
    color: palette.coralDark,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  dateDay: { color: palette.ink, fontSize: 24, fontWeight: "800" },
  planContent: { flex: 1, gap: 12 },
  status: { fontSize: 11, letterSpacing: 1, fontWeight: "800" },
  pending: { color: palette.amber },
  saved: { color: palette.green },
  timeList: { gap: 5, paddingTop: 4 },
  timeLine: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  acceptance: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 10,
    gap: 7,
  },
  acceptanceText: { color: palette.muted, fontSize: 13 },
});
