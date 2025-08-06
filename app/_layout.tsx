import { Stack } from "expo-router";
import { ThemeProvider } from "../context/ThemeContext";
import { SettingsProvider } from "../context/SettingsContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DrizzleStudioProvider } from "../hooks/useDrizzleStudio";
import "../global.css";

export default function Layout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <ThemeProvider>
          <DrizzleStudioProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </DrizzleStudioProvider>
        </ThemeProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
