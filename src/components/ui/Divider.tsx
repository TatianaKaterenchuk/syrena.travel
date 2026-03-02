import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, spacing } from '../../theme';
import Text from './Text';

export type DividerVariant = 'line' | 'text' | 'diamond';

export interface DividerProps {
  variant?: DividerVariant;
  text?: string;
  style?: StyleProp<ViewStyle>;
}

const Divider: React.FC<DividerProps> = ({
  variant = 'line',
  text,
  style,
}) => {
  if (variant === 'line') {
    return <View style={[styles.line, style]} />;
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.line} />
      {variant === 'text' && text ? (
        <Text variant="caption" style={styles.text}>
          {text}
        </Text>
      ) : (
        <View style={styles.diamond} />
      )}
      <View style={styles.line} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.ui.divider,
  },
  text: {
    marginHorizontal: spacing.md,
  },
  diamond: {
    width: 6,
    height: 6,
    backgroundColor: colors.gold.muted,
    transform: [{ rotate: '45deg' }],
    marginHorizontal: spacing.md,
  },
});

export default React.memo(Divider);
