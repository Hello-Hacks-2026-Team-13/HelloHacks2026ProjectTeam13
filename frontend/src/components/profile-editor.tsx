import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Profile } from "../../../shared/types";
import { Chip, Field, Heading, palette } from "./across-ui";

export const GENRES = [
  { id: 35, label: "Comedy" },
  { id: 10749, label: "Romance" },
  { id: 12, label: "Adventure" },
  { id: 16, label: "Animation" },
  { id: 18, label: "Drama" },
  { id: 878, label: "Sci-fi" },
  { id: 9648, label: "Mystery" },
  { id: 99, label: "Documentary" },
];

const DAYS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 7, label: "Sun" },
];

export function newProfile(name = ""): Profile {
  return {
    id: "",
    name,
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver",
    country: "CA",
    startHour: 17,
    endHour: 22,
    days: [1, 2, 3, 4, 5, 6, 7],
    genres: [35, 10749],
    duration: 120,
    calendarConnected: false,
  };
}

export function ProfileEditor({
  value,
  onChange,
  compact = false,
}: {
  value: Profile;
  onChange: (profile: Profile) => void;
  compact?: boolean;
}) {
  const [startText, setStartText] = useState(String(value.startHour));
  const [endText, setEndText] = useState(String(value.endHour));
  const update = (changes: Partial<Profile>) =>
    onChange({ ...value, ...changes });
  const updateHour = (key: "startHour" | "endHour", text: string) => {
    if (key === "startHour") setStartText(text);
    else setEndText(text);
    if (/^\d{0,2}$/.test(text) && text !== "") {
      if (key === "startHour") update({ startHour: Number(text) });
      else update({ endHour: Number(text) });
    }
  };

  return (
    <View style={styles.form}>
      <Field
        label="Your name"
        value={value.name}
        onChangeText={(name) => update({ name })}
        placeholder="e.g. Jamie"
        autoCapitalize="words"
        maxLength={40}
      />
      {!compact ? (
        <>
          <Field
            label="Time zone"
            value={value.timezone}
            onChangeText={(timezone) => update({ timezone })}
            placeholder="America/Vancouver"
            autoCapitalize="none"
            accessibilityHint="Use an IANA time zone, such as America/Vancouver or Europe/London."
          />
          <Text style={styles.hint}>
            Use the IANA time zone shown by your device, for example
            America/Vancouver.
          </Text>
          <Field
            label="Country code"
            value={value.country}
            onChangeText={(country) =>
              update({ country: country.toUpperCase().slice(0, 2) })
            }
            placeholder="CA"
            autoCapitalize="characters"
            maxLength={2}
            accessibilityHint="Two-letter country code. Used to check movie availability."
          />
          <Heading detail="Times are interpreted in your own time zone.">
            When are you usually free?
          </Heading>
          <View style={styles.row}>
            <View style={styles.hourField}>
              <Field
                label="Start hour (0–23)"
                value={startText}
                onChangeText={(text) => updateHour("startHour", text)}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.hourField}>
              <Field
                label="End hour (1–24)"
                value={endText}
                onChangeText={(text) => updateHour("endHour", text)}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
          </View>
          <Text style={styles.hint}>
            For example, 17 to 22 means 5–10 pm. Split overnight availability
            across the two days.
          </Text>
          <Heading>Days you’re available</Heading>
          <View style={styles.chips}>
            {DAYS.map((day) => {
              const selected = value.days.includes(day.id);
              return (
                <Chip
                  key={day.id}
                  label={day.label}
                  selected={selected}
                  onPress={() =>
                    update({
                      days: selected
                        ? value.days.filter((id) => id !== day.id)
                        : [...value.days, day.id].sort(),
                    })
                  }
                />
              );
            })}
          </View>
          <Heading detail="Shared genres come first. If none fit, we try any genre either of you likes. Leave all unselected for no genre preference.">
            Movies you enjoy
          </Heading>
          <View style={styles.chips}>
            {GENRES.map((genre) => {
              const selected = value.genres.includes(genre.id);
              return (
                <Chip
                  key={genre.id}
                  label={genre.label}
                  selected={selected}
                  onPress={() =>
                    update({
                      genres: selected
                        ? value.genres.filter((id) => id !== genre.id)
                        : [...value.genres, genre.id].slice(0, 10),
                    })
                  }
                />
              );
            })}
          </View>
          <Heading detail="Suggestions fit within the shorter preference between you two.">
            Date length
          </Heading>
          <View style={styles.chips}>
            {[60, 90, 120, 150, 180, 240].map((minutes) => (
              <Chip
                key={minutes}
                label={
                  minutes >= 60
                    ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
                    : `${minutes} min`
                }
                selected={value.duration === minutes}
                onPress={() => update({ duration: minutes })}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 15 },
  row: { flexDirection: "row", gap: 12 },
  hourField: { flex: 1 },
  hint: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: -8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
