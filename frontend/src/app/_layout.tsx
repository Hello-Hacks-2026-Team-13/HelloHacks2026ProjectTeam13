import { Stack, Tabs } from "expo-router";
import { Image } from "expo-image";
import { View } from "react-native";
import { artwork, fontFamily } from "@/constants/design";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AcrossProvider, useAcross } from "@/lib/across";
import { palette } from "@/components/across-ui";

function AppNavigation() {
  const { config, authenticated, loading } = useAcross();
  const insets = useSafeAreaInsets();
  if (loading || (config?.mode === "live" && !authenticated)) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.coral,
          tabBarInactiveTintColor: palette.muted,
          tabBarLabelPosition: "below-icon",
          tabBarLabelStyle: {
            fontFamily,
            fontSize: 11,
            fontWeight: "500",
            marginTop: 6,
          },
          tabBarStyle: {
            height: 88 + insets.bottom,
            paddingTop: 10,
            paddingBottom: Math.max(12, insets.bottom),
            backgroundColor: "#FFFFFF",
            borderTopWidth: 0,
            boxShadow: "0px -4px 20px rgba(84,87,92,0.08)",
          },
          tabBarItemStyle: { maxWidth: 180 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ focused }) => (
              <NavIcon name="home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="moment"
          options={{
            title: "Check-in",
            tabBarAccessibilityLabel: "Check-in: Our daily moment",
            tabBarIcon: ({ focused }) => (
              <NavIcon name="checkin" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="ideas"
          options={{
            title: "Brainstorm",
            tabBarIcon: ({ focused }) => (
              <NavIcon name="ideas" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: "Upcoming",
            tabBarIcon: ({ focused }) => (
              <NavIcon name="upcoming" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="connections"
          options={{
            title: "Account",
            tabBarIcon: ({ focused }) => (
              <NavIcon name="account" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen name="time" options={{ title: "Our time", href: null }} />
      </Tabs>
    </>
  );
}

export default function RootLayout() {
  return (
    <AcrossProvider>
      <AppNavigation />
    </AcrossProvider>
  );
}

function NavIcon({
  name,
  focused,
}: {
  name: "home" | "checkin" | "ideas" | "upcoming" | "account";
  focused: boolean;
}) {
  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 18,
        backgroundColor: focused ? palette.coral : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={artwork[focused ? (`${name}Active` as const) : name]}
        contentFit="contain"
        style={{
          width: name === "ideas" ? 31 : 24,
          height: name === "ideas" ? 31 : 24,
        }}
      />
    </View>
  );
}
