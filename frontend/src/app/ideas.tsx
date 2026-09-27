import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import type { Offer } from "../../../shared/types";
import { acrossApi, useAcross } from "@/lib/across";
import { formatTimezone } from "@/lib/timezone";
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

import {
  CategoryFilters,
  type IdeaFilter,
} from "@/components/figma-ui";
import { fontFamily } from "@/constants/design";

export default function IdeasScreen() {
  const { state, busy, error, notice, execute } = useAcross();
  const [filter, setFilter] = useState<IdeaFilter>("all");
  const [providerNotice, setProviderNotice] = useState("");
  useFocusEffect(
    useCallback(() => () => setProviderNotice(""), []),
  );
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
      return response;
    }, "Fresh date ideas are ready.");

  return (
    <Screen adornment="brain" title="Plan Your Next Date">
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
          <CategoryFilters value={filter} onChange={setFilter} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Schedule: edit our available hours"
            onPress={() =>
              router.push({ pathname: "/time", params: { returnTo: "/ideas" } })
            }
            style={styles.schedule}
          >
            <Text style={styles.scheduleTitle}>
              Schedule <Text style={styles.arrow}>↗</Text>
            </Text>
            <Text style={styles.scheduleDetail}>
              Our time · Find hours that work for both of you
            </Text>
          </Pressable>
          <Heading detail="One movie, one game, and one recipe that fit your shared time.">
            Picked for you
          </Heading>
          <Button busy={busy} onPress={findIdeas}>
            {offers.length ? "Show different ideas" : "Find our next date"}
          </Button>
          <Body style={styles.footnote}>
            Three fresh ideas, with no repeats. Times shown in{" "}
            {me ? formatTimezone(me.timezone) : "your local time"}.
          </Body>
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
              <Button
                kind="secondary"
                onPress={() =>
                  router.push({ pathname: "/time", params: { returnTo: "/ideas" } })
                }
              >
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
  schedule: {
    backgroundColor: palette.peach,
    borderRadius: 10,
    minHeight: 95,
    padding: 18,
    justifyContent: "space-between",
  },
  scheduleTitle: {
    fontFamily,
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  arrow: { color: palette.coralDark },
  scheduleDetail: { fontFamily, color: "#5A6175", fontSize: 12, marginTop: 20 },
  offerCard: { padding: 0, overflow: "hidden" },
  poster: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: palette.bluePale,
  },
  posterFallback: {
    width: "100%",
    height: 104,
    borderRadius: 10,
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
  offerContent: { padding: 20, gap: 11 },
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
