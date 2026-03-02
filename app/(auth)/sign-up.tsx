import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore } from '../../src/stores';

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [about, setAbout] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isFormValid = displayName && username && email && password.length >= 6;

  const signUp = useAuthStore((s) => s.signUp);

  const handleSignUp = async () => {
    if (!isFormValid) return;
    setIsLoading(true);
    try {
      await signUp(email, password, displayName, username, about.trim(), referralSource.trim());
      router.replace('/');
    } catch (error: any) {
      const message =
        error?.code === 'auth/email-already-in-use'
          ? 'An account with this email already exists'
          : error?.code === 'auth/weak-password'
          ? 'Password should be at least 6 characters'
          : error?.code === 'auth/invalid-email'
          ? 'Please enter a valid email address'
          : 'Something went wrong. Please try again';
      Alert.alert('Sign Up Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={colors.text.primary}
            />
          </Pressable>

          <Text style={styles.title}>Create Account</Text>

          {/* Decorative divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerStar}>✦</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.subtitle}>
            Join Syrena and discover extraordinary destinations
          </Text>
        </View>

        {/* Brass accent line */}
        <View style={styles.brassLine} />

        {/* Form */}
        <View style={styles.form}>
          <View>
            <Text style={styles.label}>DISPLAY NAME</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="person-outline"
                size={16}
                color={colors.text.tertiary}
              />
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
          </View>

          <View>
            <Text style={styles.label}>USERNAME</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.atSymbol}>@</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View>
            <Text style={styles.label}>EMAIL</Text>
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
                placeholder="you@email.com"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View>
            <Text style={styles.label}>PASSWORD</Text>
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
                placeholder="Min. 6 characters"
                placeholderTextColor={colors.text.tertiary}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color={colors.text.tertiary}
                />
              </Pressable>
            </View>
          </View>

          <View>
            <Text style={styles.label}>ABOUT YOU</Text>
            <Text style={styles.labelHint}>Only visible to admins</Text>
            <View style={[styles.inputContainer, styles.multilineContainer]}>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={about}
                onChangeText={setAbout}
                placeholder="Tell us a little about yourself..."
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          <View>
            <Text style={styles.label}>WHERE DID YOU HEAR ABOUT US?</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={colors.text.tertiary}
              />
              <TextInput
                style={styles.input}
                value={referralSource}
                onChangeText={setReferralSource}
                placeholder="A friend, social media, etc."
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
          </View>

          <Pressable
            style={[
              styles.signUpButton,
              !isFormValid && styles.signUpButtonDisabled,
            ]}
            onPress={handleSignUp}
            disabled={isLoading || !isFormValid}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.background.primary} />
            ) : (
              <Text style={styles.signUpButtonText}>CREATE ACCOUNT</Text>
            )}
          </Pressable>
        </View>

        {/* Terms */}
        <Text style={styles.terms}>
          By creating an account, you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>

        {/* Sign In Link */}
        <View style={styles.signInContainer}>
          <Text style={styles.signInPrompt}>Already have an account? </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.signInLink}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    flexGrow: 1,
  },
  // Header
  headerSection: {
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.ui.cardBg,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  title: {
    fontFamily: fonts.serif.bold,
    fontSize: 26,
    color: colors.text.primary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: colors.ui.border,
  },
  dividerStar: {
    fontSize: 10,
    color: colors.gold.muted,
  },
  subtitle: {
    fontFamily: fonts.sans.regular,
    fontSize: 14,
    color: colors.text.tertiary,
    lineHeight: 22,
  },
  brassLine: {
    height: 0.5,
    backgroundColor: colors.gold.muted + '40',
    marginBottom: spacing.xl,
  },
  // Form
  form: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  label: {
    fontFamily: fonts.sans.medium,
    fontSize: 10,
    color: colors.text.tertiary,
    letterSpacing: 2,
    marginBottom: spacing.xs + 2,
  },
  labelHint: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.text.tertiary,
    opacity: 0.6,
    marginBottom: spacing.xs + 2,
    marginTop: -spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ui.searchBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  atSymbol: {
    fontFamily: fonts.sans.medium,
    fontSize: 15,
    color: colors.text.tertiary,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    paddingVertical: spacing.md,
  },
  multilineContainer: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  multilineInput: {
    minHeight: 60,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  signUpButton: {
    backgroundColor: colors.gold.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.gold.metallic,
  },
  signUpButtonDisabled: {
    opacity: 0.4,
  },
  signUpButtonText: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.background.primary,
    letterSpacing: 2,
  },
  // Terms
  terms: {
    fontFamily: fonts.sans.regular,
    fontSize: 11,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.xl,
  },
  termsLink: {
    color: colors.gold.primary,
    fontFamily: fonts.sans.medium,
  },
  // Sign In
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  signInPrompt: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
  },
  signInLink: {
    fontFamily: fonts.sans.semiBold,
    fontSize: 13,
    color: colors.gold.primary,
  },
});
