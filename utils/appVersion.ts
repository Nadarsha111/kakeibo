import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export interface AppVersionInfo {
  /** App version from package.json (via app.config.js) */
  version: string;
  /** Description of the code that is running: an over-the-air update, the bundled build, or dev */
  update: string;
}

/**
 * Looks for a newer over-the-air update and downloads it. It is not applied until
 * applyDownloadedUpdate() restarts the app.
 */
export async function downloadAvailableUpdate(): Promise<'disabled' | 'none' | 'downloaded'> {
  if (!Updates.isEnabled) return 'disabled';
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return 'none';
  await Updates.fetchUpdateAsync();
  return 'downloaded';
}

export function applyDownloadedUpdate(): Promise<void> {
  return Updates.reloadAsync();
}

/**
 * Tells which version is on the device, including which over-the-air update (if any) it has
 * received, so a phone can be matched against what was published.
 */
export function getAppVersionInfo(): AppVersionInfo {
  const version = Constants.expoConfig?.version ?? 'unknown';

  if (!Updates.isEnabled) {
    return { version, update: 'Development build (updates off)' };
  }
  if (Updates.isEmbeddedLaunch || !Updates.updateId) {
    return { version, update: 'Built-in (no update installed)' };
  }

  const shortId = Updates.updateId.slice(0, 8);
  const published = Updates.createdAt
    ? Updates.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const channel = Updates.channel ? `${Updates.channel} · ` : '';
  return { version, update: `${channel}${shortId}${published ? ` · ${published}` : ''}` };
}
