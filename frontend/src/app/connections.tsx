import { useState } from "react";
import { Alert, Platform, Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
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

export default function ConnectionsScreen() {
  const { state, config, busy, error, notice, execute } = useAcross();
  const [pairNameDraft, setPairName] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [invite, setInvite] = useState("");
  const [removeStep, setRemoveStep] = useState(0);
  const [removalAcknowledged, setRemovalAcknowledged] = useState(false);
  const [removalConfirmation, setRemovalConfirmation] = useState("");
  const room = state?.room;
  const me = room?.profiles.find((profile) => profile.id === state?.userId);
  const partner = room?.profiles.find(
    (profile) => profile.id !== state?.userId,
  );
  const paired = Boolean(partner);
  const calendarConnected = Boolean(me?.calendarConnected);

  const pairName = pairNameDraft ?? me?.name ?? "";

  const createOrJoin = () => {
    if (!pairName.trim()) return;
    void execute(
      async () => {
        const profile = {
          ...newProfile(pairName.trim()),
          name: pairName.trim(),
        };
        if (pairCode.trim()) {
          await acrossApi("/pair/join", "POST", {
            code: pairCode.trim().toLowerCase(),
            profile,
          });
          return;
        }
        const result = await acrossApi<{ code: string }>(
          "/pair/create",
          "POST",
          { profile },
        );
        setInvite(result.code);
        return result;
      },
      pairCode.trim()
        ? "You’re connected."
        : "Your space is ready. Share the invite code.",
    );
  };

  const getInvite = () =>
    void execute(async () => {
      const result = await acrossApi<{ code: string }>("/pair/invite", "POST");
      setInvite(result.code);
      return result;
    }, "A new invite code is ready.");

  const removePairing = () =>
    void execute(async () => {
      await acrossApi("/pair/remove", "POST");
      setRemoveStep(0);
      setRemovalAcknowledged(false);
      setRemovalConfirmation("");
      setInvite("");
    }, "Pairing removed. Shared data for this space has been deleted. You can now join another space.");

  const connectCalendar = () =>
    void execute(async () => {
      const { url, browserUrl } = await acrossApi<{
        url: string;
        browserUrl: string;
      }>("/calendar/connect", "POST");
      if (Platform.OS === "web") {
        window.location.assign(url);
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(
        browserUrl,
        ExpoLinking.createURL("/connections"),
      );
      if (result.type !== "success")
        throw new Error("Calendar sign-in was cancelled.");
      if (ExpoLinking.parse(result.url).queryParams?.calendar === "error")
        throw new Error(
          "Google Calendar could not complete the connection. Check the OAuth callback settings and try again.",
        );
    }, "Google Calendar connected.");

  const disconnectCalendar = () => {
    Alert.alert(
      "Disconnect Google Calendar?",
      "Future date suggestions will no longer check this calendar for busy times.",
      [
        { text: "Keep connected", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () =>
            void execute(
              () => acrossApi("/calendar", "DELETE"),
              "Google Calendar disconnected.",
            ),
        },
      ],
    );
  };

  return (
    <Screen
      eyebrow="Connections"
      title="The people and services in your space."
      description="Manage your partner, invite code, and optional calendar access here."
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
        <Heading
          detail={
            partner
              ? `You’re sharing this space with ${partner.name}.`
              : room
                ? "Your space is waiting for your partner."
                : "Create or join a shared space to pair with someone."
          }
        >
          Your pairing
        </Heading>
        {me ? (
          <Body>
            {me.name} · {me.timezone}
          </Body>
        ) : null}
        {partner ? (
          <Body>
            {partner.name} · {partner.timezone}
          </Body>
        ) : null}
        {room && !paired ? (
          <>
            <Body>
              Your invite is private and expires after 24 hours. Creating a new
              code replaces the previous one.
            </Body>
            {invite ? (
              <Text selectable style={styles.invite}>
                {invite}
              </Text>
            ) : null}
            <Button busy={busy} onPress={getInvite}>
              {invite ? "Generate a fresh invite code" : "Generate invite code"}
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
          </>
        ) : null}
        {!room ? (
          <Button onPress={() => router.push("/")}>
            Create or join a space
          </Button>
        ) : null}
      </Card>

      <Card>
        <Heading
          detail={
            paired
              ? "To change partners, remove this pairing first. Either person can start the removal."
              : "Join an existing space with the code your partner shared."
          }
        >
          Change or join a space
        </Heading>
        {paired ? (
          <Notice>
            <NoticeText>
              You can enter the next invite code now. Remove the current pairing
              below first; the code will stay here so you can join the new space
              right afterward.
            </NoticeText>
          </Notice>
        ) : null}
        <Field
          label="Your name in the new space"
          value={pairName}
          onChangeText={setPairName}
          placeholder={me?.name || "e.g. Jamie"}
          autoCapitalize="words"
          maxLength={40}
        />
        <Field
          label="Partner invite code"
          value={pairCode}
          onChangeText={(value) => setPairCode(value.trim())}
          placeholder="Paste their 24-character code"
          autoCapitalize="none"
          maxLength={24}
        />
        <Button
          disabled={paired || !pairName.trim() || pairCode.trim().length !== 24}
          busy={busy}
          onPress={createOrJoin}
        >
          Join with invite code
        </Button>
      </Card>

      {config?.mode === "demo" ? (
        <Card>
          <Heading detail="Use this to preview the connection workflow without an external calendar account.">
            Demo partner
          </Heading>
          <Body>
            {partner
              ? "The demo partner can confirm a suggested plan from the Plans screen."
              : "Add a sample partner to try shared suggestions and plan approval."}
          </Body>
          {!partner && room ? (
            <Button
              busy={busy}
              kind="secondary"
              onPress={() =>
                void execute(
                  () => acrossApi("/demo/partner", "POST"),
                  "A sample partner joined your space.",
                )
              }
            >
              Add demo partner
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Heading detail="Across checks free/busy times only. Event names and details stay private.">
          Google Calendar
        </Heading>
        <StatusLine
          label="Connection"
          value={calendarConnected ? "Connected" : "Not connected"}
          positive={calendarConnected}
        />
        <StatusLine
          label="Setup"
          value={state?.calendarReady ? "Available" : "Needs server setup"}
          positive={Boolean(state?.calendarReady)}
        />
        {calendarConnected ? (
          <Button kind="quiet" disabled={busy} onPress={disconnectCalendar}>
            Disconnect calendar
          </Button>
        ) : (
          <Button
            kind="secondary"
            disabled={!state?.calendarReady || !room}
            busy={busy}
            onPress={connectCalendar}
          >
            Connect Google Calendar
          </Button>
        )}
        {!state?.calendarReady ? (
          <Body>
            Calendar sign-in needs Google OAuth client settings and token
            encryption configured on the backend.
          </Body>
        ) : null}
      </Card>

      <Card>
        <Heading detail="Provider credentials stay on the backend; they are never sent to the app.">
          Suggestion sources
        </Heading>
        <StatusLine
          label="TMDB movies"
          value={state?.tmdbReady ? "Ready" : "Not configured"}
          positive={Boolean(state?.tmdbReady)}
        />
        <StatusLine
          label="RAWG games"
          value={state?.rawgReady ? "Ready" : "Not configured"}
          positive={Boolean(state?.rawgReady)}
        />
        <StatusLine
          label="TheMealDB recipes"
          value={state?.mealdbReady ? "Ready" : "Not configured"}
          positive={Boolean(state?.mealdbReady)}
        />
        <Body>
          Curated conversation and creative ideas work without these providers.
        </Body>
      </Card>

      {paired ? (
        <Card style={styles.removeCard}>
          <Heading detail="Either person can remove the pairing. The shared room and all stored plans and calendar tokens are deleted.">
            Remove this pairing
          </Heading>
          {removeStep === 0 ? (
            <>
              <Body>
                This immediately removes both people from the shared space. You
                can create a new space or enter another person’s invite code
                afterward.
              </Body>
              <Button kind="danger" onPress={() => setRemoveStep(1)}>
                Continue to remove pairing
              </Button>
            </>
          ) : (
            <>
              <Notice tone="error">
                <NoticeText>
                  This cannot be undone. Your shared schedules, suggestions,
                  plans, membership, invite, and stored calendar tokens for this
                  pairing will be deleted.
                </NoticeText>
              </Notice>
              {removeStep === 1 ? (
                <Button kind="danger" onPress={() => setRemoveStep(2)}>
                  I understand, continue
                </Button>
              ) : null}
              <Button
                kind={removalAcknowledged ? "secondary" : "quiet"}
                onPress={() => setRemovalAcknowledged((value) => !value)}
                accessibilityLabel="Acknowledge deletion of shared pairing data"
              >
                {removalAcknowledged
                  ? "✓ I understand the shared data will be deleted"
                  : "I understand the shared data will be deleted"}
              </Button>
              <Field
                label="Type REMOVE to confirm"
                value={removalConfirmation}
                onChangeText={setRemovalConfirmation}
                placeholder="REMOVE"
                autoCapitalize="characters"
                maxLength={6}
                editable={removeStep >= 2}
                accessibilityHint="Type the word REMOVE to enable the final deletion button."
              />
              {removeStep >= 2 ? (
                <Button
                  kind="danger"
                  busy={busy}
                  disabled={
                    !removalAcknowledged || removalConfirmation !== "REMOVE"
                  }
                  onPress={removePairing}
                >
                  Remove pairing and delete shared data
                </Button>
              ) : null}
              <Button
                kind="quiet"
                onPress={() => {
                  setRemoveStep(0);
                  setRemovalAcknowledged(false);
                  setRemovalConfirmation("");
                }}
              >
                Cancel removal
              </Button>
            </>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

function StatusLine({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <View style={styles.statusLine}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text
        style={[
          styles.statusValue,
          positive ? styles.statusGood : styles.statusMuted,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  invite: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 1.1,
    textAlign: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: palette.paper,
  },
  removeCard: { borderColor: "#E8C7C7", backgroundColor: "#FFFBFA" },
  statusLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 34,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    gap: 12,
  },
  statusLabel: { color: palette.ink, fontSize: 14, fontWeight: "600" },
  statusValue: { fontSize: 13, fontWeight: "700" },
  statusGood: { color: palette.green },
  statusMuted: { color: palette.muted },
});
