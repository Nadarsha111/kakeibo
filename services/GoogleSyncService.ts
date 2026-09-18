import { Alert } from "react-native";
import { getTransactionService } from "../database";
import {
  statusCodes,
  GoogleSignin,
  type User,
} from "@react-native-google-signin/google-signin";

class GoogleSyncService {
  private static SPREADSHEET_NAME = "Kakeibo App Data";

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
   * Overwrites the Google Sheet with the current local data (local wins).
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
        "Your data is being pushed to Google Sheets. This may take a moment.",
      );
      await this.syncTransactions();
      Alert.alert(
        "Success",
        "Your data has been successfully pushed to Google Sheets.",
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

  private async syncTransactions() {
    // 1. Ensure user is signed in and get an access token
    const tokens = await GoogleSignin.getTokens();
    const accessToken = tokens.accessToken;

    // 2. Find or create the spreadsheet
    const spreadsheetId = await this.findOrCreateSpreadsheet(accessToken);
    if (!spreadsheetId)
      throw new Error("Could not find or create spreadsheet.");

    // 3. Get all transactions from the local database
    const transactionService = getTransactionService();
    const transactions = transactionService.getAllTransactionsForExport();

    // 4. Format data for the sheet (add headers)
    const values = [
      [
        "ID",
        "Date",
        "Type",
        "Category",
        "Amount",
        "Description",
        "Payment Method",
        "Account ID",
        "Profile ID",
      ],
      ...transactions.map((t) => [
        t.id,
        t.date,
        t.type,
        t.category,
        t.amount,
        t.description,
        t.paymentMethod,
        t.accountId,
        t.profileId,
      ]),
    ];

    // 5. Write data to the sheet
    await this.writeToSheet(accessToken, spreadsheetId, values);
    console.log("Sync complete!");
  }

  private async pullTransactions(): Promise<{ created: number; updated: number; unchanged: number; skipped: number }> {
    const tokens = await GoogleSignin.getTokens();
    const accessToken = tokens.accessToken;

    const spreadsheetId = await this.findOrCreateSpreadsheet(accessToken);
    if (!spreadsheetId) {
      throw new Error("Could not find the spreadsheet. Push your data to Google Sheets first.");
    }

    const range = "Sheet1";
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
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

  private async writeToSheet(
    accessToken: string,
    spreadsheetId: string,
    values: any[][],
  ) {
    const range = "Sheet1";
    // Clear the sheet first to ensure fresh data
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`;
    await fetch(clearUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Write the new data
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
    const response = await fetch(writeUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error writing to sheet:", errorData);
      throw new Error("Failed to write data to Google Sheet.");
    }

    console.log(`Successfully wrote ${values.length} rows to spreadsheet.`);
  }
}

// Singleton instance for the service
const googleSyncServiceInstance = new GoogleSyncService();
export const getGoogleSyncService = (): GoogleSyncService =>
  googleSyncServiceInstance;
