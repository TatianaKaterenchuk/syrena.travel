import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../theme';
import Text from './Text';

export type PillSize = 'sm' | 'md';

export interface PillProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: PillSize;
}

const Pill: React.FC<PillProps> = ({
  label,
  color = colors.background.tertiary,
  textColor = colors.text.primary,
  size = 'md',
}) => {
  const sizeStyles = size === 'sm' ? styles.sm : styles.md;

  return (
    <View style={[styles.base, sizeStyles, { backgroundColor: color }]}>
      <Text
        variant="pill"
        color={textColor}
        style={size === 'sm' ? styles.smText : undefined}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
  },
  sm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  md: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  smText: {
    fontSize: 10,
  },
});

export default React.memo(Pill);
