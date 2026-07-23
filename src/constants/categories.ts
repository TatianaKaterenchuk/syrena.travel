import { PlaceCategory } from '../types';
import { colors } from '../theme';

export interface CategoryConfig {
  key: PlaceCategory;
  label: string;
  icon: string; // Ionicons name
  color: string;
}

export const CATEGORIES: CategoryConfig[] = [
  { key: 'restaurant', label: 'Restaurant', icon: 'restaurant-outline', color: colors.category.restaurant },
  { key: 'lodging', label: 'Lodging', icon: 'bed-outline', color: colors.category.lodging },
  { key: 'bar', label: 'Bar', icon: 'wine-outline', color: colors.category.bar },
  { key: 'cafe', label: 'Café', icon: 'cafe-outline', color: colors.category.cafe },
  { key: 'club', label: 'Club', icon: 'musical-notes-outline', color: colors.category.club },
  { key: 'culture', label: 'Culture', icon: 'color-palette-outline', color: colors.category.culture },
  { key: 'nature', label: 'Nature', icon: 'leaf-outline', color: colors.category.nature },
  { key: 'shop', label: 'Shop', icon: 'bag-outline', color: colors.category.shop },
  { key: 'services', label: 'Services', icon: 'construct-outline', color: colors.category.services },
];

export const getCategoryConfig = (category: PlaceCategory): CategoryConfig => {
  return CATEGORIES.find((c) => c.key === category) || CATEGORIES[0];
};

export const getCategoryColor = (category: PlaceCategory): string => {
  return getCategoryConfig(category).color;
};

export const getCategoryIcon = (category: PlaceCategory): string => {
  return getCategoryConfig(category).icon;
};
