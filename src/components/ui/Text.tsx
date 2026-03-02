import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleSheet,
} from 'react-native';
import { textStyles, colors } from '../../theme';

export type TextVariant = keyof typeof textStyles;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  children: React.ReactNode;
}

const Text: React.FC<TextProps> = ({
  variant = 'body',
  color,
  style,
  children,
  ...rest
}) => {
  const variantStyle = textStyles[variant];

  return (
    <RNText
      style={[variantStyle, color ? { color } : undefined, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
};

export default React.memo(Text);
