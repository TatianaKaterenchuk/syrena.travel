import React, { useState, useMemo } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius } from '../../src/theme';
import {
  PlaceCategory,
  BudgetTier,
  StarRating,
  BUDGET_LABELS,
  BUDGET_ICONS,
  STAR_LABELS,
  PlaceEditableFields,
} from '../../src/types';
import { usePlacesStore } from '../../src/stores/usePlacesStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { generateTags } from '../../src/utils/generateTags';
import { pickImage, takePhoto } from '../../src/utils/imagePicker';
import { uploadImage } from '../../src/services/firebase/storage';
import { searchPlacePhotos, PlacePhoto } from '../../src/services/googlePlaces';

// ---------------------------------------------------------------------------
// Constants (same as add-place.tsx)
// ---------------------------------------------------------------------------

const CATEGORIES: { key: PlaceCategory; label: string; icon: string }[] = [
  { key: 'restaurant', label: 'Eat', icon: 'restaurant-outline' },
  { key: 'lodging', label: 'Stay', icon: 'bed-outline' },
  { key: 'bar', label: 'Bar', icon: 'wine-outline' },
  { key: 'cafe', label: 'Café', icon: 'cafe-outline' },
  { key: 'club', label: 'Club', icon: 'musical-notes-outline' },
  { key: 'culture', label: 'Culture', icon: 'color-palette-outline' },
  { key: 'nature', label: 'Nature', icon: 'leaf-outline' },
  { key: 'shop', label: 'Shop', icon: 'bag-outline' },
  { key: 'services', label: 'Services', icon: 'construct-outline' },
];

const BUDGET_TIERS: { key: BudgetTier; label: string; icon: string }[] = [
  { key: 1, label: BUDGET_LABELS[1], icon: BUDGET_ICONS[1] },
  { key: 2, label: BUDGET_LABELS[2], icon: BUDGET_ICONS[2] },
  { key: 3, label: BUDGET_LABELS[3], icon: BUDGET_ICONS[3] },
  { key: 4, label: BUDGET_LABELS[4], icon: BUDGET_ICONS[4] },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditPlaceModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, mode } = useLocalSearchParams<{ id: string; mode: 'edit' | 'suggest' }>();

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const { places, updatePlace, submitEditSuggestion } = usePlacesStore();

  const place = useMemo(() => places.find((p) => p.id === id), [places, id]);

  // Form state — pre-filled from existing place
  const [name, setName] = useState(place?.name ?? '');
  const [description, setDescription] = useState(place?.description ?? '');
  const [mustTry, setMustTry] = useState(place?.mustTry ?? '');
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory>(
    place?.category ?? 'restaurant',
  );
  const [subcategory, setSubcategory] = useState(place?.subcategory ?? '');
  const [address, setAddress] = useState(place?.address ?? '');
  const [city, setCity] = useState(place?.city ?? '');
  const [country, setCountry] = useState(place?.country ?? '');
  const [selectedBudget, setSelectedBudget] = useState<BudgetTier | null>(
    place?.budgetTier ?? null,
  );
  const [manualTagInput, setManualTagInput] = useState('');
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<string[]>(place?.tags ?? []);
  const [isSaving, setIsSaving] = useState(false);

  // Photo state
  const [photos, setPhotos] = useState<string[]>(place?.imageURLs ?? []);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const originalPhotoUrls = useMemo(() => new Set(place?.imageURLs ?? []), [place]);

  // Web photo search state
  const [webPhotos, setWebPhotos] = useState<PlacePhoto[]>([]);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);

  const handlePickImage = async (aspect?: [number, number]) => {
    const uri = await pickImage(aspect);
    if (uri) setPhotos((prev) => [...prev, uri]);
  };

  const handleTakePhoto = async (aspect?: [number, number]) => {
    const uri = await takePhoto(aspect);
    if (uri) setPhotos((prev) => [...prev, uri]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMovePhoto = (index: number, direction: 'left' | 'right') => {
    setPhotos((prev) => {
      const newPhotos = [...prev];
      const swapIndex = direction === 'left' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= newPhotos.length) return prev;
      [newPhotos[index], newPhotos[swapIndex]] = [newPhotos[swapIndex], newPhotos[index]];
      return newPhotos;
    });
  };

  const handleSearchWeb = async () => {
    const query = name || place?.name;
    if (!query) {
      Alert.alert('Enter a name first', 'A place name is needed to search for photos.');
      return;
    }
    setShowWebSearch(true);
    setIsSearchingWeb(true);
    try {
      const results = await searchPlacePhotos(query);
      setWebPhotos(results);
    } catch (error) {
      console.error('Error searching web photos:', error);
    } finally {
      setIsSearchingWeb(false);
    }
  };

  const handleSelectWebPhoto = (photo: PlacePhoto) => {
    if (photos.includes(photo.url)) {
      // Already added — remove it
      setPhotos((prev) => prev.filter((p) => p !== photo.url));
    } else {
      setPhotos((prev) => [...prev, photo.url]);
    }
  };

  const showSourcePicker = (aspect: [number, number] | undefined) => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => handleTakePhoto(aspect) },
      { text: 'Photo Library', onPress: () => handlePickImage(aspect) },
      { text: 'Search Web', onPress: handleSearchWeb },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleAddPhoto = () => {
    Alert.alert('Photo Shape', 'Choose aspect ratio', [
      { text: 'Square', onPress: () => showSourcePicker([1, 1]) },
      { text: 'Portrait', onPress: () => showSourcePicker([3, 4]) },
      { text: 'Landscape', onPress: () => showSourcePicker([4, 3]) },
      { text: 'Free', onPress: () => showSourcePicker(undefined) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleRemoveExistingTag = (tag: string) => {
    setExistingTags((prev) => prev.filter((t) => t !== tag));
  };

  const isEditMode = mode === 'edit';
  const title = isEditMode ? 'Edit Place' : 'Suggest Edit';

  // Compute diff between current form and original place
  const computeChanges = (): {
    changes: PlaceEditableFields;
    original: PlaceEditableFields;
  } => {
    if (!place) return { changes: {}, original: {} };

    const changes: PlaceEditableFields = {};
    const original: PlaceEditableFields = {};

    if (name.trim() !== place.name) {
      changes.name = name.trim();
      original.name = place.name;
    }
    if (description.trim() !== place.description) {
      changes.description = description.trim();
      original.description = place.description;
    }
    if (mustTry.trim() !== (place.mustTry ?? '')) {
      changes.mustTry = mustTry.trim();
      original.mustTry = place.mustTry ?? '';
    }
    if (selectedCategory !== place.category) {
      changes.category = selectedCategory;
      original.category = place.category;
    }
    if (subcategory.trim() !== (place.subcategory ?? '')) {
      changes.subcategory = subcategory.trim();
      original.subcategory = place.subcategory;
    }
    if (address.trim() !== place.address) {
      changes.address = address.trim();
      original.address = place.address;
    }
    if (city.trim() !== place.city) {
      changes.city = city.trim();
      original.city = place.city;
    }
    if (country.trim() !== place.country) {
      changes.country = country.trim();
      original.country = place.country;
    }
    if ((selectedBudget ?? null) !== (place.budgetTier ?? null)) {
      changes.budgetTier = selectedBudget;
      original.budgetTier = place.budgetTier ?? null;
    }

    // Check if tags were modified (removed existing or added new ones)
    const tagsChanged =
      existingTags.length !== place.tags.length ||
      !existingTags.every((t) => place.tags.includes(t)) ||
      manualTags.length > 0;

    if (changes.category || changes.budgetTier !== undefined || changes.city || changes.country || tagsChanged) {
      const newAutoTags = generateTags({
        category: selectedCategory,
        subcategory: subcategory.trim() || undefined,
        budgetTier: selectedBudget,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
      });
      // Merge: auto-generated + surviving existing + new manual tags
      const allTags = Array.from(new Set([...newAutoTags, ...existingTags, ...manualTags]));
      changes.tags = allTags;
      original.tags = place.tags;
    }

    return { changes, original };
  };

  const handleAddManualTag = () => {
    const tags = manualTagInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && !manualTags.includes(t));
    if (tags.length > 0) {
      setManualTags((prev) => [...prev, ...tags]);
      setManualTagInput('');
    }
  };

  const handleRemoveManualTag = (tag: string) => {
    setManualTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (!place || !user || !profile) return;

    if (!name.trim()) {
      Alert.alert('Required', 'Place name is required.');
      return;
    }

    const { changes, original } = computeChanges();

    // Check if photos changed
    const photosChanged =
      photos.length !== (place.imageURLs?.length ?? 0) ||
      !photos.every((p, i) => p === place.imageURLs?.[i]);

    if (Object.keys(changes).length === 0 && !photosChanged) {
      Alert.alert('No Changes', 'No fields were modified.');
      return;
    }

    setIsSaving(true);
    try {
      // Upload new photos if changed
      let finalImageURLs: string[] | undefined;
      if (photosChanged) {
        setIsUploadingPhoto(true);
        const uploadedURLs: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          if (originalPhotoUrls.has(photo)) {
            // Keep existing Firebase Storage URL as-is
            uploadedURLs.push(photo);
            continue;
          }
          if (/^https?:\/\//i.test(photo)) {
            // New remote URL (Google Places CDN) — save directly. We used to
            // re-upload these to Firebase Storage but the round-trip could
            // silently fail, leaving the place with no images.
            uploadedURLs.push(photo);
            continue;
          }
          try {
            const path = `places/${user.uid}/${Date.now()}_${i}.jpg`;
            const url = await uploadImage(path, photo);
            uploadedURLs.push(url);
          } catch (uploadErr) {
            console.warn('[edit-place] failed to upload photo', i, uploadErr);
          }
        }
        finalImageURLs = uploadedURLs;
        setIsUploadingPhoto(false);
      }

      if (isEditMode) {
        const updateData = { ...changes };
        if (finalImageURLs) {
          (updateData as any).imageURLs = finalImageURLs;
        }
        await updatePlace(place.id, updateData);
        Alert.alert('Updated', 'Place has been updated.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await submitEditSuggestion({
          placeId: place.id,
          placeName: place.name,
          submittedBy: user.uid,
          submittedByName: profile.displayName || 'Anonymous',
          submittedByPhoto: profile.photoURL || '',
          status: 'pending',
          changes,
          originalValues: original,
        });
        Alert.alert(
          'Suggestion Submitted',
          'Your edit suggestion has been sent for admin review.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setIsSaving(false);
      setIsUploadingPhoto(false);
    }
  };

  // Loading / not found guard
  if (!place) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
          <Text style={styles.loadingText}>Loading place...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <Pressable onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.gold.primary} />
          ) : (
            <Text style={styles.saveText}>SAVE</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode badge */}
        <View style={styles.modeBadge}>
          <Ionicons
            name={isEditMode ? 'create-outline' : 'git-pull-request-outline'}
            size={14}
            color={isEditMode ? colors.gold.primary : colors.text.secondary}
          />
          <Text style={styles.modeBadgeText}>
            {isEditMode
              ? 'Admin: Changes apply immediately'
              : 'Changes will be submitted for admin review'}
          </Text>
        </View>

        {/* ---- Photos ---- */}
        <Text style={styles.label}>PHOTOS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoScroll}
          contentContainerStyle={styles.photoScrollContent}
        >
          {photos.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoImage} />
              <Pressable
                style={styles.photoRemoveBtn}
                onPress={() => handleRemovePhoto(index)}
                disabled={isSaving}
              >
                <Ionicons name="close-circle" size={22} color={colors.ui.error} />
              </Pressable>
              {photos.length > 1 && (
                <View style={styles.reorderBar}>
                  {index > 0 && (
                    <Pressable
                      style={styles.reorderArrow}
                      onPress={() => handleMovePhoto(index, 'left')}
                      hitSlop={6}
                    >
                      <Ionicons name="chevron-back" size={14} color={colors.text.primary} />
                    </Pressable>
                  )}
                  <Text style={styles.photoIndex}>{index + 1}</Text>
                  {index < photos.length - 1 && (
                    <Pressable
                      style={styles.reorderArrow}
                      onPress={() => handleMovePhoto(index, 'right')}
                      hitSlop={6}
                    >
                      <Ionicons name="chevron-forward" size={14} color={colors.text.primary} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ))}
          <Pressable style={styles.photoAddBtn} onPress={handleAddPhoto} disabled={isSaving}>
            {isUploadingPhoto ? (
              <ActivityIndicator size="small" color={colors.gold.primary} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={24} color={colors.gold.primary} />
                <Text style={styles.photoAddText}>Add</Text>
              </>
            )}
          </Pressable>
        </ScrollView>

        {/* Web Photo Search Results */}
        {showWebSearch && (
          <View style={styles.webSearchSection}>
            <View style={styles.webSearchHeader}>
              <Text style={styles.webSearchTitle}>WEB PHOTOS</Text>
              <Pressable onPress={() => setShowWebSearch(false)}>
                <Ionicons name="close" size={18} color={colors.text.tertiary} />
              </Pressable>
            </View>
            {isSearchingWeb ? (
              <ActivityIndicator size="small" color={colors.gold.primary} style={{ paddingVertical: spacing.md }} />
            ) : webPhotos.length === 0 ? (
              <Text style={styles.webSearchEmpty}>No photos found</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.webSearchScroll}>
                {webPhotos.map((photo) => {
                  const isSelected = photos.includes(photo.url);
                  return (
                    <Pressable key={photo.id} onPress={() => handleSelectWebPhoto(photo)} style={styles.webPhotoThumb}>
                      <Image source={{ uri: photo.url }} style={[styles.webPhotoImage, isSelected && styles.webPhotoSelected]} />
                      {isSelected && (
                        <View style={styles.webPhotoCheck}>
                          <Ionicons name="checkmark-circle" size={22} color={colors.gold.primary} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* ---- Name ---- */}
        <Text style={styles.label}>NAME *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Place name"
          placeholderTextColor={colors.text.tertiary}
          editable={!isSaving}
        />

        {/* ---- Category ---- */}
        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              style={[
                styles.categoryChip,
                selectedCategory === cat.key && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(cat.key)}
              disabled={isSaving}
            >
              <Ionicons name={cat.icon as any} size={14} color={selectedCategory === cat.key ? colors.gold.primary : colors.text.secondary} />
              <Text
                style={[
                  styles.categoryLabel,
                  selectedCategory === cat.key && styles.categoryLabelActive,
                ]}
              >
                {cat.label.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ---- Subcategory ---- */}
        <Text style={styles.label}>SUBCATEGORY</Text>
        <TextInput
          style={styles.input}
          value={subcategory}
          onChangeText={setSubcategory}
          placeholder="e.g. Pizza Place, Boutique Hotel"
          placeholderTextColor={colors.text.tertiary}
          editable={!isSaving}
        />

        {/* ---- Price Range ---- */}
        <Text style={styles.label}>PRICE RANGE</Text>
        <View style={styles.budgetGrid}>
          {BUDGET_TIERS.map((tier) => (
            <Pressable
              key={tier.key}
              style={[
                styles.budgetChip,
                selectedBudget === tier.key && styles.budgetChipActive,
              ]}
              onPress={() =>
                setSelectedBudget(selectedBudget === tier.key ? null : tier.key)
              }
              disabled={isSaving}
            >
              <Text
                style={[
                  styles.budgetIcon,
                  selectedBudget === tier.key && styles.budgetIconActive,
                ]}
              >
                {tier.icon}
              </Text>
              <Text
                style={[
                  styles.budgetLabel,
                  selectedBudget === tier.key && styles.budgetLabelActive,
                ]}
              >
                {tier.label.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ---- Description ---- */}
        <Text style={styles.label}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Tell us about this place..."
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!isSaving}
        />

        {/* ---- Must-try (food & drink places only) ---- */}
        {(selectedCategory === 'restaurant' ||
          selectedCategory === 'cafe' ||
          selectedCategory === 'bar' ||
          selectedCategory === 'club') && (
          <>
            <Text style={styles.label}>
              {selectedCategory === 'bar' || selectedCategory === 'club'
                ? 'MUST-TRY COCKTAILS / DRINKS'
                : 'MUST-TRY DISHES'}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea, { minHeight: 70 }]}
              value={mustTry}
              onChangeText={setMustTry}
              placeholder="What should people order?"
              placeholderTextColor={colors.text.tertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!isSaving}
            />
          </>
        )}

        {/* ---- Address ---- */}
        <Text style={styles.label}>ADDRESS</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Street address"
          placeholderTextColor={colors.text.tertiary}
          editable={!isSaving}
        />

        {/* ---- City & Country ---- */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>CITY</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={colors.text.tertiary}
              editable={!isSaving}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>COUNTRY</Text>
            <TextInput
              style={styles.input}
              value={country}
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor={colors.text.tertiary}
              editable={!isSaving}
            />
          </View>
        </View>

        {/* ---- Tags ---- */}
        <Text style={styles.label}>TAGS</Text>
        {/* Existing tags (removable) */}
        <View style={styles.tagsContainer}>
          {existingTags.map((tag) => (
            <Pressable
              key={tag}
              style={styles.editableTag}
              onPress={() => handleRemoveExistingTag(tag)}
              disabled={isSaving}
            >
              <Text style={styles.editableTagText}>{tag}</Text>
              <Ionicons name="close" size={12} color={colors.text.secondary} />
            </Pressable>
          ))}
        </View>

        {/* Manual tags */}
        {manualTags.length > 0 && (
          <View style={styles.tagsContainer}>
            {manualTags.map((tag) => (
              <Pressable
                key={tag}
                style={styles.manualTag}
                onPress={() => handleRemoveManualTag(tag)}
              >
                <Text style={styles.manualTagText}>{tag}</Text>
                <Ionicons name="close" size={12} color={colors.gold.primary} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Tag input */}
        <View style={styles.tagInputRow}>
          <TextInput
            style={[styles.input, styles.tagInput]}
            value={manualTagInput}
            onChangeText={setManualTagInput}
            placeholder="Add tags (comma separated)"
            placeholderTextColor={colors.text.tertiary}
            onSubmitEditing={handleAddManualTag}
            returnKeyType="done"
            editable={!isSaving}
          />
          <Pressable style={styles.addTagButton} onPress={handleAddManualTag}>
            <Ionicons name="add" size={18} color={colors.gold.primary} />
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
  },
  headerTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  saveText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
    letterSpacing: 2,
  },

  // Content
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },

  // Mode badge
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold.primary + '10',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  modeBadgeText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.secondary,
    letterSpacing: 0.3,
    flex: 1,
  },

  // Form
  label: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 2,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  textArea: {
    height: 100,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
  },

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: colors.gold.primary + '15',
    borderColor: colors.gold.primary,
  },
  categoryIcon: {
    // icon size handled inline
  },
  categoryLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.secondary,
    letterSpacing: 1.5,
  },
  categoryLabelActive: {
    color: colors.gold.primary,
  },

  // Budget
  budgetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  budgetChip: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    gap: 4,
  },
  budgetChipActive: {
    backgroundColor: colors.gold.primary + '15',
    borderColor: colors.gold.primary,
  },
  budgetIcon: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 14,
    color: colors.text.secondary,
  },
  budgetIconActive: {
    color: colors.gold.primary,
  },
  budgetLabel: {
    fontFamily: fonts.sans.medium,
    fontSize: 9,
    color: colors.text.tertiary,
    letterSpacing: 1,
  },
  budgetLabelActive: {
    color: colors.gold.primary,
  },

  // Tags
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.xs,
  },
  autoTag: {
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  autoTagText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    letterSpacing: 0.3,
  },
  manualTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gold.primary + '15',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '30',
  },
  manualTagText: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    color: colors.gold.primary,
    letterSpacing: 0.3,
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tagInput: {
    flex: 1,
  },
  addTagButton: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
  },

  // Photos
  photoScroll: {
    marginBottom: spacing.sm,
  },
  photoScrollContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.sm,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.background.primary + 'CC',
    borderRadius: 11,
  },
  reorderBar: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  reorderArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndex: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.primary,
    minWidth: 16,
    textAlign: 'center',
  },
  photoAddBtn: {
    width: 90,
    height: 90,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.gold.primary + '40',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background.tertiary,
  },
  photoAddText: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.gold.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Web photo search
  webSearchSection: {
    marginTop: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    padding: spacing.sm,
  },
  webSearchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  webSearchTitle: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
  },
  webSearchEmpty: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  webSearchScroll: {
    gap: spacing.sm,
  },
  webPhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  webPhotoImage: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
  },
  webPhotoSelected: {
    opacity: 0.6,
  },
  webPhotoCheck: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.background.primary,
    borderRadius: 11,
  },

  // Editable tags
  editableTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  editableTagText: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
});
