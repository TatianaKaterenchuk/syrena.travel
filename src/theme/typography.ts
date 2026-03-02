import { colors } from './colors';

export const fonts = {
  serif: {
    regular: 'PlayfairDisplay-Regular',
    bold: 'PlayfairDisplay-Bold',
  },
  sans: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semiBold: 'Inter-SemiBold',
  },
} as const;

export const textStyles = {
  brand: {
    fontFamily: fonts.serif.bold,
    fontSize: 28,
    letterSpacing: 6,
    color: colors.gold.primary,
  },
  brandSubtitle: {
    fontFamily: fonts.sans.medium,
    fontSize: 12,
    letterSpacing: 4,
    color: colors.gold.light,
  },
  h1: {
    fontFamily: fonts.serif.bold,
    fontSize: 24,
    color: colors.text.primary,
  },
  h2: {
    fontFamily: fonts.serif.regular,
    fontSize: 20,
    color: colors.text.primary,
  },
  h3: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 16,
    color: colors.text.primary,
  },
  body: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  bodyMedium: {
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
  },
  pill: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  button: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
} as const;
