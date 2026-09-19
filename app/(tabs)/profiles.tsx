import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getProfileService } from '../../database';
import { Profile } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import AddProfileScreen from '../../components/AddProfileScreen';
import { useTabBarInset } from '../../components/PebbleTabBar';

export default function ProfilesScreen() {
  const tabInset = useTabBarInset();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [profileToEdit, setProfileToEdit] = useState<Profile | null>(null);

  const loadProfiles = useCallback(() => {
    try {
      const profileService = getProfileService();
      const profilesList = profileService.getProfiles();
      setProfiles(profilesList);
    } catch (error) {
      console.error('Error loading profiles:', error);
      Alert.alert('Error', 'Failed to load profiles.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    loadProfiles();
    setRefreshing(false);
  };

  const handleProfileAdded = () => {
    loadProfiles();
    setShowAddProfile(false);
    setProfileToEdit(null);
  };

  const handleEditProfile = (profile: Profile) => {
    setProfileToEdit(profile);
    setShowAddProfile(true);
  };

  const handleDeleteProfile = (profile: Profile) => {
    Alert.alert(
      'Delete Profile',
      `Are you sure you want to delete "${profile.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              const profileService = getProfileService();
              profileService.deleteProfile(profile.id);
              loadProfiles();
            } catch (error: any) {
              console.error('Error deleting profile:', error);
              Alert.alert('Error', error.message || 'Failed to delete profile. It might be in use.');
            }
          },
        },
      ]
    );
  };

  const renderProfileItem = ({ item }: { item: Profile }) => (
    <TouchableOpacity
      style={styles.profileCard}
      onPress={() => handleEditProfile(item)}
      onLongPress={() => handleDeleteProfile(item)}
    >
      <View style={styles.profileInfo}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="store-outline" size={24} color={theme.colors.primary} />
        </View>
        <View style={styles.profileDetails}>
          <Text style={styles.profileName}>{item.name}</Text>
          {item.description && (
            <Text style={styles.profileDescription}>{item.description}</Text>
          )}
        </View>
      </View>
      <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        {/* <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity> */}
        <Text style={styles.headerTitle}>Manage Profiles</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setProfileToEdit(null);
            setShowAddProfile(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={profiles}
        renderItem={renderProfileItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContainer, { paddingBottom: 20 + tabInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="store-search-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Profiles Found</Text>
            <Text style={styles.emptyText}>
              Add a profile to separate your personal and business finances.
            </Text>
          </View>
        }
      />

      <AddProfileScreen
        visible={showAddProfile}
        onClose={() => {
          setShowAddProfile(false);
          setProfileToEdit(null);
        }}
        onProfileAdded={handleProfileAdded}
        profileToEdit={profileToEdit}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 44,
      paddingBottom: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    addButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    addButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    listContainer: {
      padding: 20,
    },
    profileCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      marginBottom: 12,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    profileInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: `${theme.colors.primary}20`,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    profileDetails: {
      flex: 1,
    },
    profileName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    profileDescription: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      marginTop: 40,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 40,
    },
  });