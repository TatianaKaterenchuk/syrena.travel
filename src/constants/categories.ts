import { PlaceCategory } from '../types';
import { colors } from '../theme';

export interface CategoryConfig {
  key: PlaceCategory;
  label: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: CategoryConfig[] = [
  { key: 'restaurant', label: 'Eat', emoji: '🍽️', color: colors.category.restaurant },
  { key: 'hotel', label: 'Stay', emoji: '🏨', color: colors.category.hotel },
  { key: 'bar', label: 'Bar', emoji: '🍸', color: colors.category.bar },
  { key: 'culture', label: 'Do', emoji: '🎯', color: colors.category.culture },
  { key: 'nature', label: 'Nature', emoji: '🌿', color: colors.category.nature },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️', color: colors.category.shopping },
  { key: 'services', label: 'Services', emoji: '🔧', color: colors.category.services },
];

export const getCategoryConfig = (category: PlaceCategory): CategoryConfig => {
  return CATEGORIES.find((c) => c.key === category) || CATEGORIES[0];
};

export const getCategoryColor = (category: PlaceCategory): string => {
  return getCategoryConfig(category).color;
};

export const getCategoryEmoji = (category: PlaceCategory): string => {
  return getCategoryConfig(category).emoji;
};
