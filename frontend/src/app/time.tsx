import { useState } from "react";
import { router } from "expo-router";
import type { Profile } from "../../../shared/types";
import { acrossApi, useAcross } from "@/lib/across";
import {
  Body,
  Button,
  Card,
  Heading,
  Notice,
  NoticeText,
  Screen,
} from "@/components/across-ui";
import { ProfileEditor } from "@/components/profile-editor";

export default function TimeScreen() {
  const { state, config, busy, error, notice, execute } = useAcross();
  const room = state?.room;
  const me = room?.profiles.find((profile) => profile.id === state?.userId);
  const partner = room?.profiles.find(
    (profile) => profile.id !== state?.userId,
  );
  const [editingPartner, setEditingPartner] = useState(false);
  const target =
    editingPartner && partner && config?.mode === "demo" ? partner : me;
  const [editedDraft, setDraft] = useState<Profile | null>(null);
  const draft = editedDraft?.id === target?.id ? editedDraft : target;

  if (!room || !me) {
    return (
      <Screen
        eyebrow="Our time"
        title="Find the hours that feel good."
        description="Add your usual availability and Across will compare it with your partner’s local schedule."
      >
        <Card>
          <Body>Create or join a shared space to set your availability.</Body>
          <Button onPress={() => router.push("/")}>Set up your space</Button>
        </Card>
      </Screen>
    );
  }

  const save = () => {
    if (!draft) return;
    void execute(
      () =>
        acrossApi("/preferences", "PUT", {
          profile: draft,
          asPartner: editingPartner,
        }),
      "Preferences saved. New suggestions will use these settings.",
    );
  };

  return (
    <Screen
      eyebrow="Our time"
      title="Find a window that works for both."
      description="Choose your usual days and hours. Times are stored in your time zone and compared with your partner’s, including across daylight changes."
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
      {partner ? (
        <Card>
          <Heading detail="Each person sets their own local schedule.">
            Your shared time zones
          </Heading>
          {[me, partner].map((profile) => (
            <Body key={profile.id}>
              {profile.name}: {profile.timezone} ·{" "}
              {formatHour(profile.startHour)}–{formatHour(profile.endHour)}
            </Body>
          ))}
        </Card>
      ) : null}
      {config?.mode === "demo" && partner ? (
        <Button
          kind="secondary"
          onPress={() => {
            setDraft(null);
            setEditingPartner((selected) => !selected);
          }}
        >
          {editingPartner
            ? "Edit my preferences"
            : `Edit ${partner.name}’s demo preferences`}
        </Button>
      ) : null}
      <Card>
        <Heading
          detail={
            editingPartner && partner
              ? "This changes the demo partner profile."
              : "The matching engine uses these preferences for date ideas."
          }
        >
          {editingPartner && partner
            ? `${partner.name}’s preferences`
            : "Your preferences"}
        </Heading>
        {draft ? (
          <ProfileEditor
            key={`${target?.id || "self"}-${editingPartner}`}
            value={draft}
            onChange={setDraft}
          />
        ) : null}
        <Button busy={busy} disabled={!draft?.name.trim()} onPress={save}>
          Save preferences
        </Button>
      </Card>
      <Card>
        <Heading>Keep calendars in the loop</Heading>
        <Body>
          Google Calendar busy times can also block suggestions. Connect or
          manage it from Connections.
        </Body>
        <Button kind="quiet" onPress={() => router.push("/connections")}>
          Calendar connections
        </Button>
      </Card>
    </Screen>
  );
}

function formatHour(hour: number) {
  if (hour === 24) return "12 am";
  return `${hour % 12 || 12} ${hour >= 12 ? "pm" : "am"}`;
}
