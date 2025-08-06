import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import { DatabaseConnector } from "../database";

export const DrizzleStudioProvider = ({ children }: { children: React.ReactNode }) => {
  // Access the database instance
  const db = DatabaseConnector.getInstance().getDatabase();
  
  useDrizzleStudio(db);

  return <>{children}</>;
};