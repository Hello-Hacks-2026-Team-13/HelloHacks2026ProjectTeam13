import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { useAcross } from "@/lib/across";
import { artwork, fontFamily, palette } from "@/constants/design";

export function PairHeader({ people = false }: { people?: boolean }) {
  const { state } = useAcross();
  const pathname = usePathname();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const room = state?.room;
  const me = room?.profiles.find((p) => p.id === state?.userId);
  const partner = room?.profiles.find((p) => p.id !== state?.userId);
  if (!me)
    return (
      <Text style={styles.brand}>
        across<Text style={{ color: palette.coral }}>.</Text>
      </Text>
    );
  const days = room
    ? Math.max(0, Math.floor((now - Date.parse(room.createdAt)) / 86400000))
    : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit our time zones and availability"
      onPress={() =>
        router.push({ pathname: "/time", params: { returnTo: pathname } })
      }
      style={[styles.pair, people && styles.people]}
    >
      <View style={styles.person}>
        {people ? (
          <View style={styles.avatar}>
            <Text style={styles.initial}>
              {me.name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        ) : null}
        <View style={styles.personCopy}>
          <Text numberOfLines={1} style={styles.personName}>
            {me.name}
          </Text>
          <Text numberOfLines={1} style={styles.city}>
            {city(me.timezone)}
          </Text>
          {!people ? (
            <Text style={styles.clock}>{time(now, me.timezone)}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.connector}>
        <Text style={styles.heart}>♡</Text>
        <Text style={styles.connected}>
          {people
            ? partner
              ? `Our space · day ${days + 1}`
              : "Your shared space"
            : "Our time"}
        </Text>
      </View>
      <View style={[styles.person, styles.right]}>
        <View style={styles.personCopy}>
          <Text
            numberOfLines={1}
            style={[styles.personName, styles.alignRight]}
          >
            {partner?.name || "Your person"}
          </Text>
          <Text numberOfLines={1} style={[styles.city, styles.alignRight]}>
            {partner ? city(partner.timezone) : "Invite to connect"}
          </Text>
          {!people && partner ? (
            <Text style={[styles.clock, styles.alignRight]}>
              {time(now, partner.timezone)}
            </Text>
          ) : null}
        </View>
        {people ? (
          <View style={[styles.avatar, styles.partnerAvatar]}>
            <Text style={styles.initial}>
              {partner?.name.slice(0, 1).toUpperCase() || "+"}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
function city(zone: string) {
  return zone.split("/").pop()?.replaceAll("_", " ") || zone;
}
function time(now: number, zone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

export type IdeaFilter = "all" | "movie" | "game" | "meal";
export function CategoryFilters({
  value,
  onChange,
}: {
  value: IdeaFilter;
  onChange: (value: IdeaFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filters}
    >
      {(
        [
          { id: "all", label: "All" },
          { id: "movie", label: "Movies" },
          { id: "game", label: "Games" },
          { id: "meal", label: "Recipes" },
        ] as const
      ).map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.id === "all" ? "All ideas" : item.label}
          accessibilityState={{ selected: value === item.id }}
          onPress={() => onChange(item.id)}
          style={styles.filter}
        >
          <View
            style={[
              styles.filterIcon,
              value === item.id && styles.filterSelected,
            ]}
          >
            {item.id === "all" ? (
              <View style={{ width: 25, height: 25 }}>
                <Image
                  source={artwork.all}
                  contentFit="contain"
                  style={{
                    position: "absolute",
                    top: 12.3225,
                    left: 13.845,
                    width: 11.155,
                    height: 6.545,
                  }}
                />
                <Image
                  source={artwork.allTop}
                  contentFit="contain"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 12.57,
                    width: 6.46,
                    height: 11.3025,
                  }}
                />
                <Image
                  source={artwork.allBottom}
                  contentFit="contain"
                  style={{
                    position: "absolute",
                    top: 13.6975,
                    left: 6.2975,
                    width: 6.46,
                    height: 11.3025,
                  }}
                />
                <Image
                  source={artwork.allLeft}
                  contentFit="contain"
                  style={{
                    position: "absolute",
                    top: 6.2375,
                    left: 0,
                    width: 11.155,
                    height: 6.56,
                  }}
                />
              </View>
            ) : (
              <Image
                source={artwork[item.id]}
                contentFit="contain"
                style={styles.categoryImage}
              />
            )}
          </View>
          <Text
            style={[
              styles.filterLabel,
              value === item.id && styles.filterLabelSelected,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontFamily,
    fontSize: 27,
    fontWeight: "800",
    color: palette.ink,
    marginBottom: 30,
  },
  pair: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    marginBottom: 32,
    borderRadius: 16,
    backgroundColor: "#FFF",
    boxShadow: "0px 7px 26px rgba(157,57,74,0.07)",
    gap: 6,
  },
  people: {
    backgroundColor: "#FFFBFC",
    borderBottomWidth: 1,
    borderBottomColor: palette.coralPale,
    boxShadow: "none",
    paddingVertical: 18,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    borderRadius: 0,
  },
  person: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    minWidth: 0,
  },
  personCopy: { flexShrink: 1 },
  right: { justifyContent: "flex-end" },
  alignRight: { textAlign: "right" },
  personName: {
    fontFamily,
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  city: { fontFamily, color: palette.muted, fontSize: 10, marginTop: 2 },
  clock: { fontFamily, color: palette.coralDark, fontSize: 11, marginTop: 2 },
  connector: { alignItems: "center", gap: 2 },
  heart: { fontSize: 26, color: palette.coral },
  connected: {
    fontFamily,
    fontSize: 10,
    fontWeight: "600",
    color: palette.coralDark,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.coralPale,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerAvatar: { backgroundColor: palette.bluePale },
  initial: {
    fontFamily,
    fontSize: 18,
    fontWeight: "700",
    color: palette.coralDark,
  },
  filters: { gap: 20, paddingVertical: 8, paddingRight: 2 },
  filter: { alignItems: "center", gap: 10, minWidth: 65 },
  filterIcon: {
    width: 65,
    height: 65,
    borderRadius: 25,
    backgroundColor: palette.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  filterSelected: { backgroundColor: palette.coral },
  categoryImage: { width: 28, height: 28 },
  filterLabel: { fontFamily, fontSize: 16, color: palette.muted },
  filterLabelSelected: { color: palette.ink, fontWeight: "600" },
});
