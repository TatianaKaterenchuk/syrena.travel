import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore } from '../../src/stores';

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Animations
  const passwordInputRef = useRef<TextInput>(null);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Float animation for mermaid
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    // Shimmer for decorative elements
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0.4,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const floatTranslate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const signIn = useAuthStore((s) => s.signIn);

  // ---------- Handlers ----------

  const handleSignIn = async () => {
    if (!email || !password) return;
    setIsLoading(true);
    try {
      // Normalize the email: trim whitespace and lowercase the local part / domain.
      // iPad's on-screen keyboard often slips in a leading capital or trailing space,
      // and our App Review demo account has a period in the local part which auto-
      // correct sometimes mangles into a different domain.
      const normalizedEmail = email.trim().toLowerCase();
      await signIn(normalizedEmail, password);
      router.replace('/');
    } catch (error: any) {
      const message =
        error?.code === 'auth/invalid-credential'
          ? 'Invalid email or password'
          : error?.code === 'auth/user-not-found'
          ? 'No account found with this email'
          : error?.code === 'auth/too-many-requests'
          ? 'Too many attempts. Please try again later'
          : 'Something went wrong. Please try again';
      Alert.alert('Sign In Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email || !email.trim()) {
      Alert.alert(
        'Email Required',
        'Enter your email address above first, then tap Forgot Password again.',
      );
      return;
    }
    // Firebase stores emails case-insensitively but our sign-in normalizes
    // to lowercase, so the reset lookup must match.
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const { resetPassword } = await import('../../src/services/firebase/auth');
      await resetPassword(normalizedEmail);
      Alert.alert(
        'Reset Email Sent',
        `If an account exists for ${normalizedEmail}, a password reset link has been sent. Check your inbox.`,
      );
    } catch (error: any) {
      // Log so we can debug in TestFlight if reset silently fails.
      console.warn('[sign-in] resetPassword error', error?.code, error?.message);
      // Don't leak whether the email exists; show a generic confirmation
      Alert.alert(
        'Reset Email Sent',
        `If an account exists for ${normalizedEmail}, a password reset link has been sent.`,
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Tap anywhere outside the inputs to dismiss the keyboard */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={Keyboard.dismiss}
        accessible={false}
      />
      <View style={[styles.content, { paddingTop: insets.top + 40 }]} pointerEvents="box-none">
        {/* Logo with animated mermaid */}
        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim }]}>
          <Animated.View style={[styles.logoIcon, { transform: [{ translateY: floatTranslate }] }]}>
            <Image
              source={require('../../assets/images/mermaid.png')}
              style={styles.mermaidImage}
              contentFit="contain"
            />
          </Animated.View>

          <Text style={styles.brandText}>SYRENA</Text>
          <View style={styles.diamondDivider}>
            <Animated.View style={[styles.dividerLine, { opacity: shimmerAnim }]} />
            <Text style={styles.diamond}>✦</Text>
            <Animated.View style={[styles.dividerLine, { opacity: shimmerAnim }]} />
          </View>
          <Text style={styles.subtitle}>VOYAGER</Text>
          <Text style={styles.tagline}>Discover extraordinary places</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View style={[styles.form, { opacity: fadeAnim }]}>
          <View style={styles.formAccentLine} />

          <View style={styles.inputContainer}>
            <Ionicons
              name="mail-outline"
              size={16}
              color={colors.text.tertiary}
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.text.tertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="username"
              autoComplete="email"
              importantForAutofill="yes"
              editable={!isLoading}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.text.tertiary}
            />
            <TextInput
              ref={passwordInputRef}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.text.tertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="password"
              autoComplete="current-password"
              importantForAutofill="yes"
              editable={!isLoading}
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              accessibilityRole="button"
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.text.tertiary}
              />
            </Pressable>
          </View>

          <Pressable
            style={styles.forgotButton}
            onPress={handleForgotPassword}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Forgot password"
            accessibilityRole="button"
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>

          <Pressable
            style={[styles.signInButton, (!email || !password) && styles.signInButtonDisabled]}
            onPress={handleSignIn}
            disabled={isLoading || !email || !password}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.background.primary} />
            ) : (
              <Text style={styles.signInButtonText}>SIGN IN</Text>
            )}
          </Pressable>

        </Animated.View>

        {/* Sign Up Link */}
        <View style={styles.signUpContainer}>
          <Text style={styles.signUpPrompt}>Don't have an account?</Text>
          <Pressable onPress={() => router.push('/(auth)/welcome')}>
            <Text style={styles.signUpLink}>Sign Up</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },

  // ─── Logo ──────────────────────────────────────────────────────
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    width: 140,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  mermaidImage: {
    width: 140,
    height: 150,
  },
  brandText: {
    fontFamily: fonts.serif.bold,
    fontSize: 32,
    letterSpacing: 14,
    color: colors.gold.primary,
  },
  diamondDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: 8,
  },
  dividerLine: {
    width: 40,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gold.muted,
  },
  diamond: {
    fontSize: 8,
    color: colors.gold.metallic,
  },
  subtitle: {
    fontFamily: fonts.sans.medium,
    fontSize: 11,
    letterSpacing: 8,
    color: colors.gold.muted,
  },
  tagline: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
    letterSpacing: 1,
    fontStyle: 'italic',
  },

  // ─── Form ──────────────────────────────────────────────────────
  form: {
    gap: 14,
  },
  formAccentLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gold.muted,
    marginBottom: spacing.sm,
    opacity: 0.6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ui.searchBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.ui.border,
    borderTopColor: colors.gold.muted,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 14,
    letterSpacing: 0.3,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotText: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.gold.metallic,
  },
  signInButton: {
    backgroundColor: colors.gold.primary,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.gold.metallic,
    shadowColor: colors.gold.muted,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  signInButtonDisabled: {
    opacity: 0.4,
  },
  signInButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.background.primary,
    letterSpacing: 3,
  },

  // ─── Sign Up ───────────────────────────────────────────────────
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    paddingBottom: 44,
    gap: 6,
  },
  signUpPrompt: {
    fontFamily: fonts.sans.regular,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.text.tertiary,
  },
  signUpLink: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.gold.primary,
  },
});
