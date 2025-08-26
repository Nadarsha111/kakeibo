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

  public async sync(): Promise<void> {
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
        "Syncing...",
        "Your data is being synced to Google Sheets. This may take a moment.",
      );
      await this.syncTransactions();
      Alert.alert(
        "Success",
        "Your data has been successfully synced to Google Sheets.",
      );
    } catch (error: any) {
      console.error("Sync process failed:", error);
      Alert.alert(
        "Sync Failed",
        error.message || "An unexpected error occurred during sync.",
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
