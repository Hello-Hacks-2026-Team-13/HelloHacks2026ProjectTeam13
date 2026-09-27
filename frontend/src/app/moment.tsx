import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { acrossApi, uploadMomentPhoto, useAcross } from "@/lib/across";
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Notice,
  NoticeText,
  Screen,
  palette,
} from "@/components/across-ui";
import { MOMENT_EMOJIS } from "../../../shared/moments";
import type {
  MomentPhotoView,
  MomentRoundView,
  MomentsView,
} from "../../../shared/moments";

export default function MomentScreen() {
  const { state } = useAcross();
  return (
    <MomentContent
      key={`${state?.userId}/${state?.room?.id}/${state?.room?.profiles.length}`}
    />
  );
}

function MomentContent() {
  const { state, authenticated, busy, execute, error, notice } = useAcross();
  const [data, setData] = useState<MomentsView | null>(null);
  const [problem, setProblem] = useState("");
  const [picking, setPicking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const room = state?.room;
  const paired = authenticated && room?.profiles.length === 2;
  const userId = state?.userId || "";
  const me = room?.profiles.find((p) => p.id === userId);
  const partner = room?.profiles.find((p) => p.id !== userId);
  const refresh = useCallback(async () => {
    const next = await acrossApi<MomentsView>("/moments");
    setOffset(Date.parse(next.serverNow) - Date.now());
    setData(next);
    setProblem("");
  }, []);
  useEffect(() => {
    if (!paired) return;
    let active = true;
    const update = async () => {
      try {
        const next = await acrossApi<MomentsView>("/moments");
        if (active) {
          setData(next);
          setOffset(Date.parse(next.serverNow) - Date.now());
          setProblem("");
        }
      } catch (cause) {
        if (active)
          setProblem(
            cause instanceof Error
              ? cause.message
              : "Could not load your moment.",
          );
      }
    };
    void update();
    const timer = setInterval(() => void update(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [paired, room?.id, userId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const serverNow = now + offset;
  const current = data?.rounds.find((r) => Date.parse(r.revealAt) > serverNow);
  const revealed =
    data?.rounds.filter(
      (r) => r.revealed && Date.parse(r.expiresAt) > serverNow,
    ) || [];
  const mine = current?.photos.find((p) => p.userId === userId);

  const pick = async (camera: boolean) => {
    if (!current || picking || busy) return;
    setProblem("");
    setPicking(true);
    try {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "Camera access is off. Allow it in your device settings, or choose an existing photo.",
          );
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        base64: true,
        quality: 0.8,
        allowsMultipleSelection: false,
        exif: false,
      };
      const result = await (camera
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64)
        throw new Error("Could not read this photo. Try a JPEG or PNG image.");
      if (asset.base64.length * 0.75 > 5 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 5 MB.");
      await execute(async () => {
        await uploadMomentPhoto(current.id, asset.base64!);
        await refresh();
      }, "Photo saved. Only you can see it until the reveal.");
    } catch (cause) {
      setProblem(
        cause instanceof Error ? cause.message : "Could not open your photos.",
      );
    } finally {
      setPicking(false);
    }
  };

  return (
    <Screen
      hero="morning"
      eyebrow="Check-in"
      title="Our daily moment"
      description="One prompt. A photo each. Something to look forward to."
    >
      {problem || error ? (
        <Notice tone="error">
          <NoticeText>{problem || error}</NoticeText>
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="success">
          <NoticeText>{notice}</NoticeText>
        </Notice>
      ) : null}
      {!paired ? (
        <Card>
          <Heading>Make room for two</Heading>
          <Body>Pair with your person to start your first daily moment.</Body>
          <Button onPress={() => router.push("/")}>Go to our space</Button>
        </Card>
      ) : (
        <>
          {!data && !problem ? (
            <ActivityIndicator
              accessibilityLabel="Loading daily moment"
              color={palette.coral}
            />
          ) : null}
          {problem ? (
            <Button
              kind="secondary"
              onPress={() =>
                void refresh().catch((cause) => setProblem(cause.message))
              }
            >
              Try again
            </Button>
          ) : null}
          {current ? (
            <Card>
              <View style={styles.prompt}>
                <Text style={styles.eyebrow}>TODAY’S PROMPT</Text>
                <Text accessibilityRole="header" style={styles.promptText}>
                  {current.prompt}
                </Text>
              </View>
              <Text style={styles.countdown}>
                Reveals in {remaining(Date.parse(current.revealAt) - serverNow)}
              </Text>
              <Body>
                {localTime(current.revealAt, me?.timezone)} for you{"\n"}
                {localTime(current.revealAt, partner?.timezone)} for{" "}
                {partner?.name}
              </Body>
              <View style={styles.statusRow}>
                {current.photos.map((photo) => (
                  <Text key={photo.userId} style={styles.status}>
                    {photo.name}:{" "}
                    {photo.submitted ? "photo ready ✓" : "not yet"}
                  </Text>
                ))}
              </View>
              {mine?.submitted ? (
                <MomentImage key={mine.revision} round={current} photo={mine} />
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>◌</Text>
                  <Body>Your little piece of today goes here.</Body>
                </View>
              )}
              <Button busy={busy || picking} onPress={() => void pick(false)}>
                {mine?.submitted ? "Replace my photo" : "Choose a photo"}
              </Button>
              <Button
                kind="secondary"
                disabled={busy || picking}
                onPress={() => void pick(true)}
              >
                Take a photo
              </Button>
              <Body>
                One photo each, up to 5 MB. You can replace yours until the
                reveal. Your partner’s photo stays hidden, even if you both
                finish early.
              </Body>
            </Card>
          ) : data ? (
            <Card>
              <Body>Opening the next prompt…</Body>
            </Card>
          ) : null}
          {revealed.map((round) => (
            <View key={round.id} style={styles.section}>
              <Heading
                detail={`Disappears in ${remaining(Date.parse(round.expiresAt) - serverNow)}`}
              >
                The reveal
              </Heading>
              <Body>{round.prompt}</Body>
              {round.photos.map((photo) => (
                <Card key={photo.userId}>
                  <Heading>{`${photo.name}’s moment`}</Heading>
                  {photo.submitted ? (
                    <>
                      <MomentImage
                        key={photo.revision}
                        round={round}
                        photo={photo}
                      />
                      <Reactions
                        key={JSON.stringify(
                          photo.reactions.find((r) => r.userId === userId),
                        )}
                        round={round}
                        photo={photo}
                        userId={userId}
                        names={room!.profiles}
                        refresh={refresh}
                      />
                    </>
                  ) : (
                    <Body>
                      No photo this time. There’s a new prompt waiting—no
                      catching up needed.
                    </Body>
                  )}
                </Card>
              ))}
            </View>
          ))}
          <Card>
            <Heading>A moment, not an archive</Heading>
            <Body>
              Photos reveal at 9 pm in{" "}
              {data?.zone || "the earlier partner’s timezone"}. You have 24
              hours to view and react while the next prompt runs. Photos and
              messages then disappear and are automatically deleted. Saving a
              photo outside Across is outside this timer.
            </Body>
          </Card>
        </>
      )}
    </Screen>
  );
}

function MomentImage({
  round,
  photo,
}: {
  round: MomentRoundView;
  photo: MomentPhotoView;
}) {
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!photo.visible) return;
    void acrossApi<{ dataUrl: string }>(
      `/moments/${round.id}/photos/${photo.userId}`,
    )
      .then((result) => {
        if (active) setUri(result.dataUrl);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [round.id, photo.userId, photo.visible, photo.revision, retry]);
  if (error)
    return (
      <View>
        <Body>{error}</Body>
        <Button
          kind="quiet"
          onPress={() => {
            setError("");
            setRetry((n) => n + 1);
          }}
        >
          Retry photo
        </Button>
      </View>
    );
  if (!uri)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading photo"
        color={palette.coral}
      />
    );
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={`${photo.name}’s photo for ${round.prompt}`}
      style={styles.image}
      resizeMode="contain"
    />
  );
}

function Reactions({
  round,
  photo,
  userId,
  names,
  refresh,
}: {
  round: MomentRoundView;
  photo: MomentPhotoView;
  userId: string;
  names: { id: string; name: string }[];
  refresh: () => Promise<void>;
}) {
  const own = photo.reactions.find((r) => r.userId === userId);
  const [emoji, setEmoji] = useState(own?.emoji || "");
  const [message, setMessage] = useState(own?.message || "");
  const { execute, busy } = useAcross();
  return (
    <View style={styles.section}>
      {photo.reactions.map((reaction) => (
        <View key={reaction.userId} style={styles.reaction}>
          <Text style={styles.reactionName}>
            {names.find((p) => p.id === reaction.userId)?.name || "Partner"}{" "}
            {reaction.emoji}
          </Text>
          {reaction.message ? <Body>{reaction.message}</Body> : null}
        </View>
      ))}
      <View style={styles.emojiRow}>
        {MOMENT_EMOJIS.map((value) => (
          <Chip
            key={value}
            label={value}
            selected={emoji === value}
            onPress={() => setEmoji(emoji === value ? "" : value)}
          />
        ))}
      </View>
      <Field
        label="Leave a little message"
        value={message}
        onChangeText={setMessage}
        placeholder="This made me smile…"
        maxLength={240}
        multiline
      />
      <Text style={styles.counter}>{message.length}/240</Text>
      <Button
        kind="secondary"
        busy={busy}
        disabled={!own && !emoji && !message.trim()}
        onPress={() =>
          void execute(async () => {
            await acrossApi(
              `/moments/${round.id}/photos/${photo.userId}/reaction`,
              "PUT",
              { emoji, message },
            );
            await refresh();
          }, "Reaction saved.")
        }
      >
        {own ? "Update reaction" : "Send a little love"}
      </Button>
      {own ? (
        <Button
          kind="quiet"
          disabled={busy}
          onPress={() =>
            void execute(async () => {
              await acrossApi(
                `/moments/${round.id}/photos/${photo.userId}/reaction`,
                "PUT",
                { emoji: "", message: "" },
              );
              await refresh();
            }, "Reaction removed.")
          }
        >
          Remove my reaction
        </Button>
      ) : null}
    </View>
  );
}
function remaining(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function localTime(value: string, timezone = "UTC") {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
const styles = StyleSheet.create({
  prompt: {
    backgroundColor: palette.rose,
    borderRadius: 32,
    padding: 24,
    gap: 16,
  },
  eyebrow: {
    color: "#4C1623",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  promptText: {
    color: "#4C1623",
    fontFamily:
      Platform.OS === "ios"
        ? "Georgia"
        : Platform.OS === "web"
          ? "Georgia, serif"
          : "serif",
    fontSize: 27,
    lineHeight: 37,
    fontWeight: "400",
  },
  countdown: { color: palette.coralDark, fontSize: 18, fontWeight: "700" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  status: { color: palette.green, fontSize: 13, fontWeight: "600" },
  empty: {
    backgroundColor: palette.bluePale,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: { fontSize: 48, color: palette.coral },
  image: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: palette.bluePale,
  },
  section: { gap: 14 },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reaction: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: palette.paper,
    gap: 5,
  },
  reactionName: { fontWeight: "600", color: palette.coralDark },
  counter: { alignSelf: "flex-end", color: palette.muted, fontSize: 12 },
});
