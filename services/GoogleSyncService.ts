import { Alert, DevSettings } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Updates from "expo-updates";
import { getBackupService, getSettingsService, getTransactionService, type BackupSnapshot, type BackupSummary } from "../database";
import {
  statusCodes,
  GoogleSignin,
  type User,
} from "@react-native-google-signin/google-signin";
import { getSheetsWorkbookService, SHEET_TABS } from "./SheetsWorkbookService";

class GoogleSyncService {
  private static SPREADSHEET_NAME = "Kakeibo App Data";
  /** A complete copy of the app's data, kept next to the sheet in the user's Drive. */
  private static BACKUP_NAME = "Kakeibo Backup.json";
  /** Settings key holding when the last backup to Drive was saved. */
  public static LAST_BACKUP_KEY = "last_drive_backup";

  constructor() {
    GoogleSignin.configure({
      // The Google API scopes we want to request
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file", // Scope to see and manage files created by this app
      ],
      // Replace this with your web client ID from the Google Cloud Console
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
      offlineAccess: true, // for getting refresh tokens
    });
  }

  public async signIn(): Promise<User | null> {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      console.log("Google Sign-In successful:", userInfo.data);
      return userInfo.data?.user;
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log("User cancelled the login flow");
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log("Sign in is in progress already");
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert("Error", "Google Play services not available or outdated.");
      } else {
        console.error("Google Sign-In error:", error);
        Alert.alert(
          "Sign-In Error",
          "An unexpected error occurred during sign-in.",
        );
      }
      return null;
    }
  }

  public async signOut(): Promise<void> {
    try {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
      console.log("User signed out");
    } catch (error) {
      console.error("Google Sign-Out error:", error);
    }
  }

  public async isSignedIn(): Promise<boolean> {
    const user = await GoogleSignin.getCurrentUser();
    return user != null;
  }

  public async getCurrentUser(): Promise<User | null> {
    return GoogleSignin.getCurrentUser();
  }

  /**
   * Saves a full backup to Google Drive, then overwrites the Google Sheet with the current local
   * data (local wins). The backup goes first: it is what a restore needs, the sheet is a report.
   */
  public async push(): Promise<void> {
    try {
      let isSignedIn = await this.isSignedIn();
      if (!isSignedIn) {
        const user = await this.signIn();
        if (!user) {
          // User cancelled or sign-in failed
          return;
        }
      }

      Alert.alert(
        "Pushing...",
        "Backing up your data and updating Google Sheets. This may take a moment.",
      );
      await this.backupToDrive();
      await this.syncTransactions();
      Alert.alert(
        "Success",
        "Your full backup is saved to Google Drive and the sheet is up to date.",
      );
    } catch (error: any) {
      console.error("Push process failed:", error);
      Alert.alert(
        "Push Failed",
        error.message || "An unexpected error occurred during push.",
      );
    }
  }

  /**
   * Reads the Google Sheet and applies its rows to the local database: edited
   * rows update the matching local transaction, and rows with no matching ID
   * (e.g. new rows typed directly into the sheet) are created locally. Rows
   * that fail validation are left alone. A row deleted from the sheet does
   * NOT delete the local transaction - that's left to the app to avoid an
   * accidental sheet edit wiping data. Finishes by pushing so the sheet's ID
   * column reflects any newly-created rows.
   */
  public async pull(): Promise<void> {
    try {
      let isSignedIn = await this.isSignedIn();
      if (!isSignedIn) {
        const user = await this.signIn();
        if (!user) {
          return;
        }
      }

      Alert.alert(
        "Pulling...",
        "Reading changes from Google Sheets. This may take a moment.",
      );
      const summary = await this.pullTransactions();
      await this.backupToDrive();
      await this.syncTransactions();
      Alert.alert(
        "Pull Complete",
        `${summary.created} added, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.skipped} skipped.`,
      );
    } catch (error: any) {
      console.error("Pull process failed:", error);
      Alert.alert(
        "Pull Failed",
        error.message || "An unexpected error occurred during pull.",
      );
    }
  }

  /**
   * Replaces everything on this phone with the backup saved in Google Drive, after showing what is
   * in it and asking to confirm. The current data is first saved to a file on the phone, so a
   * mistaken restore can still be undone by hand. The app restarts afterwards so every screen
   * reloads from the restored data.
   */
  public async restore(): Promise<void> {
    try {
      if (!(await this.isSignedIn()) && !(await this.signIn())) return;

      const { accessToken } = await GoogleSignin.getTokens();
      const fileId = await this.findBackupFile(accessToken);
      if (!fileId) {
        Alert.alert(
          "No Backup Found",
          "There is no Kakeibo backup in this Google account yet. Push to Google Sheets once on the phone that has your data, then restore here.",
        );
        return;
      }

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Could not download the backup from Google Drive.");

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new Error("The backup file in Google Drive is damaged and can't be read.");
      }
      const { snapshot, summary } = getBackupService().validate(parsed);

      if (!(await this.confirmRestore(summary))) return;

      await this.saveLocalCopy();
      getBackupService().restoreSnapshot(snapshot);

      Alert.alert("Restored", "Your data has been restored. The app will now restart.", [
        { text: "OK", onPress: () => this.restartApp() },
      ]);
    } catch (error: any) {
      console.error("Restore failed:", error);
      Alert.alert("Restore Failed", error.message || "An unexpected error occurred during restore. Nothing on this phone was changed.");
    }
  }

  /** When the last backup to Drive was saved from this phone, if ever. */
  public getLastBackupTime(): string | null {
    return getSettingsService().getSetting(GoogleSyncService.LAST_BACKUP_KEY);
  }

  private async backupToDrive(): Promise<void> {
    const { accessToken } = await GoogleSignin.getTokens();
    const snapshot: BackupSnapshot = getBackupService().createSnapshot();
    const body = JSON.stringify(snapshot);
    const fileId = await this.findBackupFile(accessToken);

    let response: Response;
    if (fileId) {
      response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body,
      });
    } else {
      const boundary = `kakeibo-${Date.now()}`;
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: GoogleSyncService.BACKUP_NAME, mimeType: "application/json" }) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        body +
        `\r\n--${boundary}--`;
      response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: multipart,
      });
    }
    if (!response.ok) throw new Error("Could not save the backup to Google Drive.");

    // The snapshot records its own time, so this matches what a restore will show
    getSettingsService().setSetting(GoogleSyncService.LAST_BACKUP_KEY, snapshot.createdAt);
  }

  /** The backup file this app saved in the user's Drive, if any (the newest, should there be more). */
  private async findBackupFile(accessToken: string): Promise<string | null> {
    const query = encodeURIComponent(`name='${GoogleSyncService.BACKUP_NAME}' and trashed=false`);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) throw new Error("Could not look for the backup in Google Drive.");
    const result = await response.json();
    return result.files?.[0]?.id ?? null;
  }

  private confirmRestore(summary: BackupSummary): Promise<boolean> {
    const when = new Date(summary.createdAt).toLocaleString();
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    return new Promise((resolve) => {
      Alert.alert(
        "Restore This Backup?",
        `Saved ${when}\n\n` +
          `${plural(summary.profiles, "profile")}, ${plural(summary.accounts, "account")}, ` +
          `${plural(summary.transactions, "transaction")}, ${plural(summary.recurringItems, "recurring item")}.\n\n` +
          "Everything on this phone will be replaced with this backup.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Restore", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }

  /** Keeps what was on the phone before a restore, in the app's own files, just in case. */
  private async saveLocalCopy(): Promise<void> {
    if (!FileSystem.documentDirectory) return;
    const copy = getBackupService().createSnapshot();
    await FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}kakeibo-before-restore.json`, JSON.stringify(copy));
  }

  private restartApp(): void {
    if (Updates.isEnabled) {
      Updates.reloadAsync().catch(() => DevSettings.reload());
    } else {
      DevSettings.reload();
    }
  }

  private async syncTransactions() {
    const tokens = await GoogleSignin.getTokens();
    const accessToken = tokens.accessToken;

    const spreadsheetId = await this.findOrCreateSpreadsheet(accessToken);
    if (!spreadsheetId)
      throw new Error("Could not find or create spreadsheet.");

    await getSheetsWorkbookService().refresh(accessToken, spreadsheetId);
    console.log("Sync complete!");
  }

  private async pullTransactions(): Promise<{ created: number; updated: number; unchanged: number; skipped: number }> {
    const tokens = await GoogleSignin.getTokens();
    const accessToken = tokens.accessToken;

    const spreadsheetId = await this.findOrCreateSpreadsheet(accessToken);
    if (!spreadsheetId) {
      throw new Error("Could not find the spreadsheet. Push your data to Google Sheets first.");
    }

    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_TABS.TRANSACTIONS}`;
    const response = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to read data from Google Sheet.");
    }

    const result = await response.json();
    const rows: string[][] = result.values || [];
    const dataRows = rows.slice(1); // Drop the header row

    const transactionService = getTransactionService();
    const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0 };

    for (const row of dataRows) {
      const outcome = transactionService.upsertFromSheetRow(row);
      summary[outcome]++;
    }

    console.log("Pull complete:", summary);
    return summary;
  }

  private async findOrCreateSpreadsheet(
    accessToken: string,
  ): Promise<string | null> {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${GoogleSyncService.SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)`;

    // Search for the file
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!searchResponse.ok) {
      throw new Error("Failed to search for spreadsheet in Google Drive.");
    }

    const searchResult = await searchResponse.json();
    if (searchResult.files && searchResult.files.length > 0) {
      console.log(
        "Found existing spreadsheet with ID:",
        searchResult.files[0].id,
      );
      return searchResult.files[0].id;
    }

    // If not found, create it
    console.log("Spreadsheet not found, creating a new one.");
    const createUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { title: GoogleSyncService.SPREADSHEET_NAME },
      }),
    });

    if (!createResponse.ok) {
      throw new Error("Failed to create new spreadsheet.");
    }

    const createResult = await createResponse.json();
    console.log("Created new spreadsheet with ID:", createResult.spreadsheetId);
    return createResult.spreadsheetId;
  }
}

// Singleton instance for the service
const googleSyncServiceInstance = new GoogleSyncService();
export const getGoogleSyncService = (): GoogleSyncService =>
  googleSyncServiceInstance;
