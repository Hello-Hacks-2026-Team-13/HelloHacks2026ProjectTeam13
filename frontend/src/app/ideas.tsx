import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import type { Offer } from "../../../shared/types";
import { acrossApi, useAcross } from "@/lib/across";
import {
  Body,
  Button,
  Card,
  Chip,
  Heading,
  Notice,
  NoticeText,
  Screen,
  palette,
} from "@/components/across-ui";

const filters = [
  { id: "all", label: "All ideas" },
  { id: "movie", label: "Movies" },
  { id: "game", label: "Games" },
  { id: "meal", label: "Recipes" },
] as const;

type Filter = (typeof filters)[number]["id"];

export default function IdeasScreen() {
  const { state, busy, error, notice, execute } = useAcross();
  const [filter, setFilter] = useState<Filter>("all");
  const [providerNotice, setProviderNotice] = useState("");
  const room = state?.room;
  const me = room?.profiles.find((profile) => profile.id === state?.userId);
  const partner = room?.profiles.find(
    (profile) => profile.id !== state?.userId,
  );
  const offers = room?.offers || [];
  const filtered = offers.filter((offer) => {
    if (filter === "all") return true;
    return offer.activity.kind === filter;
  });

  const findIdeas = () =>
    void execute(async () => {
      const response = await acrossApi<{ notice: string }>(
        "/suggestions",
        "POST",
      );
      setProviderNotice(response.notice);
      setFilter("all");
      return response;
    }, "Fresh date ideas are ready.");

  return (
    <Screen
      eyebrow="Date ideas"
      title="Something more than ‘what should we do?’"
      description="One movie, one game, and one recipe that fit your shared time."
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
      {providerNotice ? (
        <Notice>
          <NoticeText>{providerNotice}</NoticeText>
        </Notice>
      ) : null}
      {!partner ? (
        <Card>
          <Heading detail="Both people need to join before we can compare schedules.">
            Invite your person first
          </Heading>
          <Button onPress={() => router.push("/connections")}>
            Pairing and connections
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <Heading
              detail={`Your next ideas will fit both schedules. Times shown for ${me?.name || "you"} use ${me?.timezone || "your local time"}.`}
            >
              Find a shared moment
            </Heading>
            <Button busy={busy} onPress={findIdeas}>
              {offers.length ? "Show different ideas" : "Find our next date"}
            </Button>
            <Body>
              Each new set replaces all three ideas. We remember what this space
              has already seen, including after reloading.
            </Body>
          </Card>
          <View style={styles.filters}>
            {filters.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={filter === item.id}
                onPress={() => setFilter(item.id)}
              />
            ))}
          </View>
          {filtered.length ? (
            filtered.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                timezone={me?.timezone || "UTC"}
                busy={busy}
                onPropose={() =>
                  void execute(
                    () => acrossApi("/plans", "POST", { offerId: offer.id }),
                    "Your suggestion is waiting for your partner’s yes.",
                  )
                }
              />
            ))
          ) : (
            <Card>
              <Heading>
                {offers.length
                  ? "No ideas in this category yet."
                  : "Find your first three ideas."}
              </Heading>
              <Body>
                {offers.length
                  ? "Choose All ideas or request a fresh set."
                  : "Choose Find our next date to get a movie, game, and recipe. Allow at least 90 minutes together in Our time."}
              </Body>
              <Button kind="secondary" onPress={() => router.push("/time")}>
                Adjust availability
              </Button>
            </Card>
          )}
          <Body style={styles.footnote}>
            A suggestion includes your acceptance. Your partner confirms next.
            Movie availability may require a subscription or rental.
          </Body>
        </>
      )}
    </Screen>
  );
}

function OfferCard({
  offer,
  timezone,
  busy,
  onPropose,
}: {
  offer: Offer;
  timezone: string;
  busy: boolean;
  onPropose: () => void;
}) {
  const activity = offer.activity;
  const kind = kindLabel(activity.kind);
  return (
    <Card style={styles.offerCard}>
      {activity.poster ? (
        <Image
          source={{ uri: activity.poster }}
          accessibilityLabel={`${activity.title} artwork`}
          contentFit="cover"
          style={styles.poster}
        />
      ) : (
        <View style={styles.posterFallback}>
          <Text style={styles.posterKind}>{kind.toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.offerContent}>
        <Text style={styles.kind}>
          {kind} · {activity.minutes} min
        </Text>
        <Heading detail={activity.subtitle}>{activity.title}</Heading>
        <Body>{activity.description}</Body>
        <Text style={styles.slot}>
          {formatDate(offer.slot.start, timezone)} ·{" "}
          {formatTime(offer.slot.start, timezone)}
        </Text>
        <Text style={styles.tz}>
          {activity.source === "demo"
            ? "Sample date idea"
            : sourceLabel(activity.source)}
        </Text>
        {activity.url ? (
          <Button
            kind="quiet"
            onPress={() => void Linking.openURL(activity.url!)}
          >
            More details
          </Button>
        ) : null}
        <Button busy={busy} onPress={onPropose}>
          Suggest this date
        </Button>
      </View>
    </Card>
  );
}

function kindLabel(kind: string) {
  return (
    (
      {
        movie: "Movie",
        game: "Game",
        meal: "Recipe",
        conversation: "Conversation",
        creative: "Try together",
      } as Record<string, string>
    )[kind] || "Idea"
  );
}
function sourceLabel(source: string) {
  return (
    (
      {
        tmdb: "From TMDB",
        rawg: "From RAWG",
        themealdb: "From TheMealDB",
        curated: "Across pick",
      } as Record<string, string>
    )[source] || "Across pick"
  );
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

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  offerCard: { padding: 12, overflow: "hidden" },
  poster: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: palette.bluePale,
  },
  posterFallback: {
    width: "100%",
    height: 104,
    borderRadius: 14,
    backgroundColor: palette.coralPale,
    alignItems: "center",
    justifyContent: "center",
  },
  posterKind: {
    color: palette.coralDark,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  offerContent: { padding: 6, gap: 11 },
  kind: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  slot: { color: palette.ink, fontWeight: "700", fontSize: 14 },
  tz: { color: palette.muted, fontSize: 13 },
  footnote: { fontSize: 13, lineHeight: 19, paddingHorizontal: 2 },
});
