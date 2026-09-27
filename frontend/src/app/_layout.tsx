import { Stack, Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
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
          tabBarActiveTintColor: palette.coralDark,
          tabBarInactiveTintColor: palette.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarStyle: {
            height: 59 + insets.bottom,
            paddingTop: 5,
            paddingBottom: Math.max(7, insets.bottom),
            backgroundColor: "#FFFEFC",
            borderTopColor: palette.line,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Our space",
            tabBarIcon: ({ focused }) => (
              <SymbolView
                name={{ ios: "house.fill", android: "home", web: "home" }}
                size={21}
                tintColor={focused ? palette.coralDark : palette.muted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="time"
          options={{
            title: "Our time",
            tabBarIcon: ({ focused }) => (
              <SymbolView
                name={{
                  ios: "calendar",
                  android: "calendar-month",
                  web: "calendar_month",
                }}
                size={21}
                tintColor={focused ? palette.coralDark : palette.muted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="ideas"
          options={{
            title: "Date ideas",
            tabBarIcon: ({ focused }) => (
              <SymbolView
                name={{
                  ios: "sparkles",
                  android: "auto-awesome",
                  web: "auto_awesome",
                }}
                size={21}
                tintColor={focused ? palette.coralDark : palette.muted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: "Our plans",
            tabBarIcon: ({ focused }) => (
              <SymbolView
                name={{
                  ios: "heart.fill",
                  android: "favorite",
                  web: "favorite",
                }}
                size={21}
                tintColor={focused ? palette.coralDark : palette.muted}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="connections"
          options={{
            title: "Connections",
            tabBarIcon: ({ focused }) => (
              <SymbolView
                name={{ ios: "link", android: "link", web: "link" }}
                size={21}
                tintColor={focused ? palette.coralDark : palette.muted}
              />
            ),
          }}
        />
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
