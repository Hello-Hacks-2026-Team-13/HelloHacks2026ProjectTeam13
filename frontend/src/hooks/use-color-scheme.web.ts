import { useSyncExternalStore } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Keep the server's light theme through hydration, then use the device theme. */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const colorScheme = useRNColorScheme();
  return hasHydrated ? colorScheme : "light";
}
