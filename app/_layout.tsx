import { Stack } from "expo-router";
import { ThemeProvider } from "../context/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native";

export default function Layout() {
  return (
      <ThemeProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
  );
}
