import DatabaseConnector from './DatabaseConnector';
import { Profile } from '../types';

/**
 * Service class for managing profiles
 */
class ProfileService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
  }

  /**
   * Get all profiles
   */
  getProfiles(): Profile[] {
    try {
      const profiles = this.db.getAllSync('SELECT * FROM profiles ORDER BY name');
      return profiles as Profile[];
    } catch (error) {
      console.error('Error getting profiles:', error);
      return [];
    }
  }

  /**
   * Get profile by ID
   */
  getProfileById(id: number): Profile | null {
    try {
      const profile = this.db.getFirstSync('SELECT * FROM profiles WHERE id = ?', [id]);
      return (profile as Profile) || null;
    } catch (error) {
      console.error('Error getting profile by id:', error);
      return null;
    }
  }

  /**
   * Add a new profile
   */
  addProfile(profile: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): number {
    try {
      const now = new Date().toISOString();
      const result = this.db.runSync(
        `INSERT INTO profiles (name, description, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?)`,
        [profile.name, profile.description || null, now, now]
      );

      console.log('Profile added:', { id: result.lastInsertRowId, name: profile.name });
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding profile:', error);
      throw error;
    }
  }

  /**
   * Update an existing profile
   */
  updateProfile(id: number, profile: Partial<Omit<Profile, 'id' | 'createdAt'>>): void {
    try {
      const now = new Date().toISOString();
      const fields = [];
      const values = [];

      if (profile.name !== undefined) {
        fields.push('name = ?');
        values.push(profile.name);
      }
      if (profile.description !== undefined) {
        fields.push('description = ?');
        values.push(profile.description);
      }

      if (fields.length === 0) {
        console.warn('No fields to update for profile:', id);
        return;
      }

      fields.push('updatedAt = ?');
      values.push(now);
      values.push(id);

      this.db.runSync(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`, values);

      console.log('Profile updated:', id);
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  /**
   * Delete a profile. This will fail if the profile is in use by accounts (loan accounts included).
   */
  deleteProfile(id: number): void {
    try {
      // Check for associated accounts (loan accounts live in the accounts table too)
      const accountCount = this.db.getFirstSync('SELECT COUNT(*) as count FROM accounts WHERE profileId = ?', [id]) as { count: number };
      if (accountCount.count > 0) {
        throw new Error(`Cannot delete profile with ${accountCount.count} associated accounts.`);
      }

      this.db.runSync('DELETE FROM profiles WHERE id = ?', [id]);
      console.log('Profile deleted:', id);
    } catch (error) {
      console.error('Error deleting profile:', error);
      throw error;
    }
  }
}

export default ProfileService;
