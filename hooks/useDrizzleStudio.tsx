import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import DatabaseService from "../database/database";

export const DrizzleStudioProvider = ({ children }: { children: React.ReactNode }) => {
  // Access the database instance
  const db = (DatabaseService as any).db;
  
  useDrizzleStudio(db);

  return <>{children}</>;
};