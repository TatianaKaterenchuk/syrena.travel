import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useGuidesStore, useAuthStore } from '../../src/stores';
import { pickImage } from '../../src/utils/imagePicker';
import { uploadImage } from '../../src/services/firebase/storage';

export default function AddGuideScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const { createGuide } = useGuidesStore();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [websiteURL, setWebsiteURL] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canSave = name.trim().length > 0 && city.trim().length > 0;

  const handlePickPhoto = async () => {
    const uri = await pickImage();
    if (uri) setPhoto(uri);
  };

  const handleSave = async () => {
    if (!user || !profile || !canSave) return;

    setIsSaving(true);
    try {
      let photoURL = '';
      if (photo) {
        const path = `guides/${user.uid}/${Date.now()}.jpg`;
        photoURL = await uploadImage(path, photo);
      }

      await createGuide({
        userId: user.uid,
        userName: profile.displayName || 'Anonymous',
        userPhoto: profile.photoURL || '',
        name: name.trim(),
        city: city.trim(),
        country: country.trim(),
        description: description.trim(),
        websiteURL: websiteURL.trim(),
        photoURL,
      });

      router.back();
    } catch (error) {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Add Guide</Text>
        <Pressable
          onPress={handleSave}
          style={[styles.headerButton, styles.headerButtonRight]}
          disabled={!canSave || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.gold.primary} />
          ) : (
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <View style={styles.headerRule} />

      <ScrollView
        style={styles.form}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        <View style={styles.photoSection}>
          <Pressable style={styles.photoPicker} onPress={handlePickPhoto}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={28} color={colors.gold.muted} />
              </View>
            )}
          </Pressable>
          <Text style={styles.photoHint}>Add a photo of the guide</Text>
        </View>

        {/* Name */}
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Maria's Warsaw Tours"
          placeholderTextColor={colors.text.tertiary}
          value={name}
          onChangeText={setName}
          maxLength={100}
        />

        {/* Location */}
        <Text style={styles.label}>Location *</Text>
        <View style={styles.locationRow}>
          <View style={styles.locationField}>
            <Ionicons name="location-outline" size={16} color={colors.gold.muted} />
            <TextInput
              style={styles.locationInput}
              placeholder="City"
              placeholderTextColor={colors.text.tertiary}
              value={city}
              onChangeText={setCity}
            />
          </View>
          <View style={styles.locationField}>
            <Ionicons name="globe-outline" size={16} color={colors.gold.muted} />
            <TextInput
              style={styles.locationInput}
              placeholder="Country"
              placeholderTextColor={colors.text.tertiary}
              value={country}
              onChangeText={setCountry}
            />
          </View>
        </View>

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="What kind of tours do they offer? What makes them special?"
          placeholderTextColor={colors.text.tertiary}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
        />

        {/* Website / Link */}
        <Text style={styles.label}>Website or Link</Text>
        <View style={styles.urlField}>
          <Ionicons name="link-outline" size={16} color={colors.gold.muted} />
          <TextInput
            style={styles.urlInput}
            placeholder="e.g. mariastours.com or instagram.com/..."
            placeholderTextColor={colors.text.tertiary}
            value={websiteURL}
            onChangeText={setWebsiteURL}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  cancelText: {
    fontFamily: fonts.sans.medium,
    fontSize: 15,
    color: colors.text.secondary,
  },
  saveText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 15,
    color: colors.gold.primary,
  },
  saveTextDisabled: {
    color: colors.text.tertiary,
  },
  headerRule: {
    height: 1,
    backgroundColor: colors.ui.divider,
    marginHorizontal: spacing.xl,
  },

  // Form
  form: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },

  // Photo
  photoSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  photoPicker: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
  },
  photoImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  photoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 1.5,
    borderColor: colors.ui.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoHint: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
  },

  // Fields
  label: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: spacing.lg,
  },
  input: {
    fontFamily: fonts.sans.regular,
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  locationRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  locationField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  locationInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 12,
  },
  descriptionInput: {
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
    letterSpacing: 0.15,
    minHeight: 100,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  urlField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ui.cardBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  urlInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 12,
  },
});
