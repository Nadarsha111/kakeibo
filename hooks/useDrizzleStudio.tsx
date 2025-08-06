import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import { DatabaseConnector } from "../database";
import DatabaseSeeder from "../utils/databaseSeeder";

export const DrizzleStudioProvider = ({ children }: { children: React.ReactNode }) => {
  // Access the database instance
  const db = DatabaseConnector.getInstance().getDatabase();
  // DatabaseSeeder.seedProductionData();
  // Ensure the database is seeded before using it
  useDrizzleStudio(db);

  return <>{children}</>;
};