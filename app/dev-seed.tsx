// Dev-only: seeds sample data when opened via deep link, e.g. over adb:
//   adb shell am start -a android.intent.action.VIEW -d "kakeibo://dev-seed"
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Redirect } from "expo-router";
import DatabaseSeeder from "../utils/databaseSeeder";

export default function DevSeed() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!__DEV__) return;
    const production = DatabaseSeeder.seedProductionData();
    const profiles = DatabaseSeeder.seedSampleProfiles();
    console.log(`[dev-seed] production=${production} profiles=${profiles}`);
    setDone(true);
  }, []);

  if (!__DEV__ || done) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Seeding…</Text>
    </View>
  );
}
