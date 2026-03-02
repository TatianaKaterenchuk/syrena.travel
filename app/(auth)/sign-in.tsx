import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Image,
} from 'react-native';
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
      await signIn(email, password);
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
        {/* Logo with animated mermaid */}
        <Animated.View style={[styles.logoContainer, { opacity: fadeAnim }]}>
          <Animated.View style={[styles.logoIcon, { transform: [{ translateY: floatTranslate }] }]}>
            <Image
              source={require('../../assets/images/mermaid.png')}
              style={styles.mermaidImage}
              resizeMode="contain"
            />
          </Animated.View>

          <Text style={styles.brandText}>SYRENA</Text>
          <View style={styles.diamondDivider}>
            <Animated.View style={[styles.dividerLine, { opacity: shimmerAnim }]} />
            <Text style={styles.diamond}>✦</Text>
            <Animated.View style={[styles.dividerLine, { opacity: shimmerAnim }]} />
          </View>
          <Text style={styles.subtitle}>TRAVEL</Text>
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
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.text.tertiary}
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.text.tertiary}
              secureTextEntry={!showPassword}
              editable={!isLoading}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={16}
                color={colors.text.tertiary}
              />
            </Pressable>
          </View>

          <Pressable style={styles.forgotButton}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>

          <Pressable
            style={[styles.signInButton, (!email || !password) && styles.signInButtonDisabled]}
            onPress={handleSignIn}
            disabled={isLoading}
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
          <Pressable onPress={() => router.push('/(auth)/sign-up')}>
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
