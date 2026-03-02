import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  View,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import Text from './Text';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const AVATAR_SIZES: Record<AvatarSize, number> = {
  sm: 32,
  md: 44,
  lg: 64,
  xl: 96,
};

const FONT_SIZES: Record<AvatarSize, number> = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 36,
};

const BADGE_SIZES: Record<AvatarSize, number> = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 32,
};

export interface AvatarProps {
  uri?: string | null;
  size?: AvatarSize;
  onPress?: () => void;
  showEditBadge?: boolean;
  name?: string;
}

const Avatar: React.FC<AvatarProps> = ({
  uri,
  size = 'md',
  onPress,
  showEditBadge = false,
  name,
}) => {
  const dimension = AVATAR_SIZES[size];
  const fontSize = FONT_SIZES[size];
  const badgeDimension = BADGE_SIZES[size];

  const initials = useMemo(() => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0]?.toUpperCase() ?? '?';
  }, [name]);

  const containerStyle: ViewStyle = {
    width: dimension,
    height: dimension,
    borderRadius: dimension / 2,
  };

  const content = (
    <View style={[styles.container, containerStyle]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, containerStyle as any]}
        />
      ) : (
        <View style={[styles.fallback, containerStyle]}>
          <Text
            variant="body"
            color={colors.gold.primary}
            style={{ fontSize }}
          >
            {initials}
          </Text>
        </View>
      )}

      {showEditBadge && (
        <View
          style={[
            styles.badge,
            {
              width: badgeDimension,
              height: badgeDimension,
              borderRadius: badgeDimension / 2,
            },
          ]}
        >
          <Ionicons
            name="camera"
            size={badgeDimension * 0.55}
            color={colors.text.primary}
          />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ui.border,
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background.primary,
  },
});

export default React.memo(Avatar);
