import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getProfileService } from '../../database';
import { Profile } from '../../types';

interface AddProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onProfileAdded: () => void;
  profileToEdit?: Profile | null;
}

export default function AddProfileModal({
  visible,
  onClose,
  onProfileAdded,
  profileToEdit,
}: AddProfileModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (profileToEdit) {
      setName(profileToEdit.name);
      setDescription(profileToEdit.description || '');
    } else {
      setName('');
      setDescription('');
    }
  }, [profileToEdit, visible]);

  const handleSaveProfile = () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Profile name is required.');
      return;
    }

    try {
      const profileService = getProfileService();
      if (profileToEdit) {
        profileService.updateProfile(profileToEdit.id, {
          name: name.trim(),
          description: description.trim(),
        });
      } else {
        profileService.addProfile({
          name: name.trim(),
          description: description.trim(),
        });
      }
      onProfileAdded();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile.');
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>
            {profileToEdit ? 'Edit Profile' : 'Add New Profile'}
          </Text>
          
          <Text style={styles.label}>Profile Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Personal, Business"
            placeholderTextColor={theme.colors.textSecondary}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="A short description of the profile"
            placeholderTextColor={theme.colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSaveProfile}
            >
              <Text style={[styles.buttonText, styles.saveButtonText]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContainer: {
      width: '90%',
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 24,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 24,
      textAlign: 'center',
    },
    label: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 16,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: theme.colors.card,
      marginRight: 8,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      marginLeft: 8,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    saveButtonText: {
      color: '#fff',
    },
  });