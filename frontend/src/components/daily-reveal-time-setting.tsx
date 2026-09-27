import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { acrossApi, useAcross } from "@/lib/across";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  Notice,
  NoticeText,
} from "@/components/across-ui";
import { formatTimezone } from "@/lib/timezone";
import type { MomentsView } from "../../../shared/moments";

export function DailyRevealTimeSetting() {
  const { state, busy, execute } = useAcross();
  const [data, setData] = useState<MomentsView | null>(null);
  const [loadedRoomId, setLoadedRoomId] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  useFocusEffect(useCallback(() => () => setProblem(""), []));
  const room = state?.room;
  const paired = room?.profiles.length === 2;
  const revealTime = draft ?? data?.revealTime ?? "";

  useEffect(() => {
    if (!paired || !room?.id) return;
    let active = true;
    void acrossApi<MomentsView>("/moments")
      .then((next) => {
        if (active) {
          setData(next);
          setLoadedRoomId(room.id);
          setDraft(null);
          setProblem("");
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setProblem(
            cause instanceof Error
              ? cause.message
              : "Could not load the daily photo settings.",
          );
      });
    return () => {
      active = false;
    };
  }, [paired, room?.id]);

  const save = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(revealTime)) {
      setProblem("Enter a reveal time in 24-hour format, such as 21:00.");
      return;
    }
    void execute(async () => {
      const next = await acrossApi<MomentsView>("/moments/settings", "PUT", {
        revealTime,
      });
      setData(next);
      setDraft(null);
      setProblem("");
      return next;
    }, "Daily photo reveal time saved.");
  };

  if (!paired) return null;

  return (
    <Card>
      <Heading detail="The daily prompt opens 12 hours before the photos reveal.">
        Daily photo reveal time
      </Heading>
      {problem ? (
        <Notice tone="error">
          <NoticeText>{problem}</NoticeText>
        </Notice>
      ) : null}
      {data && loadedRoomId === room?.id ? (
        <>
          <Field
            label={`Reveal time in ${formatTimezone(data.zone)} (24-hour)`}
            value={revealTime}
            onChangeText={setDraft}
            placeholder="21:00"
            maxLength={5}
            accessibilityHint="Enter the daily photo reveal time in 24-hour HH:MM format."
          />
          <Body>
            A prompt that has already opened keeps its scheduled reveal time.
            Changes apply to the next unopened prompt.
          </Body>
          <Button
            busy={busy}
            disabled={revealTime === data.revealTime}
            onPress={save}
          >
            Save reveal time
          </Button>
        </>
      ) : problem ? null : (
        <Body>Loading your daily photo settings…</Body>
      )}
    </Card>
  );
}
