import type { PropsWithChildren, ReactNode } from "react";
import { Image } from "expo-image";
import { PairHeader } from "./figma-ui";
import { palette, fontFamily, artwork } from "@/constants/design";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export { palette } from "@/constants/design";

export function Screen({
  eyebrow,
  title,
  description,
  children,
  header = "clocks",
  hero,
  adornment,
}: PropsWithChildren<{
  header?: "clocks" | "people" | "none";
  hero?: keyof typeof artwork;
  adornment?: keyof typeof artwork;
  eyebrow?: string;
  title: string;
  description?: string;
}>) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.page}>
          {hero ? (
            <Image
              source={artwork[hero]}
              contentFit="cover"
              style={styles.heroImage}
            />
          ) : header !== "none" ? (
            <PairHeader people={header === "people"} />
          ) : null}
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.pageTitle}>
              {title}
            </Text>
            {adornment ? (
              <Image
                source={artwork[adornment]}
                contentFit="contain"
                style={styles.adornment}
              />
            ) : null}
          </View>
          {description ? (
            <Text style={styles.pageDescription}>{description}</Text>
          ) : null}
          <View style={styles.pageBody}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Heading({
  children,
  detail,
}: {
  children: string;
  detail?: string;
}) {
  return (
    <View style={styles.headingWrap}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {detail ? <Text style={styles.helper}>{detail}</Text> : null}
    </View>
  );
}

export function Body({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  autoComplete,
  maxLength,
  multiline,
  editable = true,
  accessibilityHint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?:
    "default" | "email-address" | "number-pad" | "decimal-pad" | "url";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: "email" | "off";
  maxLength?: number;
  multiline?: boolean;
  editable?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#858A9D"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        maxLength={maxLength}
        multiline={multiline}
        editable={editable}
        selectionColor={palette.coral}
        style={[
          styles.input,
          multiline && styles.multiline,
          !editable && styles.disabledInput,
        ]}
      />
    </View>
  );
}

export function Button({
  children,
  onPress,
  disabled = false,
  kind = "primary",
  busy = false,
  accessibilityLabel,
}: PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "quiet" | "danger";
  busy?: boolean;
  accessibilityLabel?: string;
}>) {
  const textStyle =
    kind === "primary"
      ? styles.primaryText
      : kind === "danger"
        ? styles.dangerText
        : kind === "quiet"
          ? styles.quietText
          : styles.secondaryText;
  const variantStyle =
    kind === "primary"
      ? styles.button_primary
      : kind === "danger"
        ? styles.button_danger
        : kind === "quiet"
          ? styles.button_quiet
          : styles.button_secondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyle,
        (disabled || busy) && styles.buttonDisabled,
        pressed && !(disabled || busy) && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={kind === "primary" ? "#FFFFFF" : palette.coralDark}
          size="small"
        />
      ) : null}
      <Text style={textStyle}>{children}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Notice({
  children,
  tone = "info",
}: PropsWithChildren<{ tone?: "info" | "error" | "success" }>) {
  const toneStyle =
    tone === "error"
      ? styles.noticeError
      : tone === "success"
        ? styles.noticeSuccess
        : styles.noticeInfo;
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "text"}
      style={[styles.notice, toneStyle]}
    >
      {children}
    </View>
  );
}

export function NoticeText({ children }: PropsWithChildren) {
  return <Text style={styles.noticeText}>{children}</Text>;
}

export function InlineLink({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.inlineLink,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.inlineLinkText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.paper },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  page: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  brand: {
    color: palette.ink,
    fontFamily,
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -1.2,
    marginBottom: 28,
  },
  brandDot: { color: palette.coral },
  eyebrow: {
    color: palette.muted,
    fontFamily,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroImage: {
    width: "100%",
    aspectRatio: 433 / 314,
    maxHeight: 305,
    marginBottom: 20,
    borderRadius: 20,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  adornment: { width: 32, height: 30 },
  pageTitle: {
    flexShrink: 1,
    color: palette.ink,
    fontFamily,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  pageDescription: {
    color: palette.muted,
    fontFamily,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 9,
    maxWidth: 560,
  },
  pageBody: { gap: 22, marginTop: 26 },
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    boxShadow: "0px 4px 22px rgba(63,65,78,0.045)",
    gap: 14,
  },
  headingWrap: { gap: 4 },
  sectionTitle: {
    color: palette.ink,
    fontFamily,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "700",
  },
  helper: { color: palette.muted, fontFamily, fontSize: 14, lineHeight: 20 },
  body: { color: palette.muted, fontFamily, fontSize: 15, lineHeight: 22 },
  field: { gap: 7 },
  label: {
    color: palette.ink,
    fontFamily,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: "#F2F3F7",
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: palette.ink,
    backgroundColor: "#F2F3F7",
    fontFamily,
    fontSize: 16,
  },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  disabledInput: { opacity: 0.55 },
  button: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  button_primary: { backgroundColor: palette.coral },
  button_secondary: {
    backgroundColor: palette.coralPale,
    borderWidth: 1,
    borderColor: palette.coralPale,
  },
  button_quiet: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: palette.line,
  },
  button_danger: {
    backgroundColor: palette.dangerPale,
    borderWidth: 1,
    borderColor: "#E8C7C7",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.78 },
  primaryText: {
    color: "#FFFFFF",
    fontFamily,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryText: {
    color: palette.coralDark,
    fontFamily,
    fontSize: 15,
    fontWeight: "700",
  },
  quietText: {
    color: palette.ink,
    fontFamily,
    fontSize: 15,
    fontWeight: "600",
  },
  dangerText: {
    color: palette.danger,
    fontFamily,
    fontSize: 15,
    fontWeight: "700",
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    backgroundColor: palette.coralPale,
    borderColor: palette.coral,
  },
  chipText: {
    color: palette.muted,
    fontFamily,
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextSelected: { color: palette.coralDark, fontWeight: "700" },
  notice: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeInfo: { backgroundColor: palette.bluePale, borderColor: "#CBD9E2" },
  noticeError: { backgroundColor: palette.dangerPale, borderColor: "#E8C7C7" },
  noticeSuccess: { backgroundColor: palette.greenPale, borderColor: "#C7DDCD" },
  noticeText: { color: palette.ink, fontFamily, fontSize: 14, lineHeight: 20 },
  inlineLink: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  inlineLinkText: {
    color: palette.coralDark,
    fontFamily,
    fontSize: 15,
    fontWeight: "700",
  },
});
