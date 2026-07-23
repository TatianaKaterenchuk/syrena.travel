import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius } from '../../src/theme';
import { useAuthStore, useMessagingStore } from '../../src/stores';
import { Message } from '../../src/types';
import { Timestamp } from 'firebase/firestore';

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversationId, recipientUid, recipientName, recipientPhoto } =
    useLocalSearchParams<{
      conversationId: string;
      recipientUid: string;
      recipientName: string;
      recipientPhoto: string;
    }>();

  const { user, profile } = useAuthStore();
  const {
    messages: allMessages,
    fetchMessages,
    subscribeMessages,
    sendMessage,
    markAsRead,
    getOrCreateConversation,
  } = useMessagingStore();

  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [convoId, setConvoId] = useState(conversationId || '');
  const [isInitializing, setIsInitializing] = useState(!conversationId);

  const messages = allMessages[convoId] || [];

  // Get or create conversation if we only have recipientUid
  useEffect(() => {
    if (conversationId) {
      setConvoId(conversationId);
      setIsInitializing(false);
      return;
    }
    // Missing required params (e.g. opened from a stale deep link) — don't sit
    // on an infinite spinner; show the empty state instead.
    if (!user?.uid || !profile || !recipientUid || !recipientName) {
      setIsInitializing(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const id = await getOrCreateConversation(
          user.uid,
          profile.displayName,
          profile.photoURL || '',
          recipientUid,
          recipientName,
          recipientPhoto || '',
        );
        if (!cancelled) {
          setConvoId(id);
          setIsInitializing(false);
        }
      } catch (error) {
        console.error('Error initializing conversation:', error);
        setIsInitializing(false);
        if (!cancelled) {
          Alert.alert(
            'Could Not Open Chat',
            'Something went wrong starting this conversation. Please try again.',
            [{ text: 'OK', onPress: () => router.back() }],
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, user?.uid, recipientUid]);

  // Fetch messages immediately + subscribe for real-time updates
  useEffect(() => {
    if (!convoId) return;
    // Immediate fetch so messages show up right away
    fetchMessages(convoId);
    // Real-time subscription for new messages
    const unsub = subscribeMessages(convoId);
    return () => unsub();
  }, [convoId]);

  // Mark as read on open AND whenever new messages arrive while the chat is
  // open — otherwise the unread badge stays lit until the chat is reopened.
  // markAsRead is idempotent so extra calls are harmless.
  useEffect(() => {
    if (!convoId || !user?.uid) return;
    markAsRead(convoId, user.uid);
  }, [convoId, user?.uid, messages.length]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !user?.uid || !convoId || isSending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSending(true);

    const recipient = recipientUid || '';
    const senderName = profile?.displayName || 'Someone';
    try {
      await sendMessage(convoId, user.uid, senderName, text.trim(), recipient);
      setText('');
    } catch (error) {
      console.error('Error sending:', error);
      // Keep the draft in the composer so nothing is lost.
      Alert.alert('Message Not Sent', 'Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  }, [text, user?.uid, convoId, recipientUid, isSending]);

  const formatTime = (ts: Timestamp | null | undefined) => {
    if (!ts || !ts.toDate) return '';
    const date = ts.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.fromUid === user?.uid;
    const nextMsg = messages[index + 1]; // FlatList is inverted, so +1 is older
    const showTime =
      !nextMsg ||
      !nextMsg.createdAt?.toDate ||
      !item.createdAt?.toDate ||
      item.createdAt.toDate().getTime() - nextMsg.createdAt.toDate().getTime() > 300000; // 5 min gap

    return (
      <View style={styles.messageWrapper}>
        {showTime && item.createdAt && (
          <Text style={styles.timeLabel}>{formatTime(item.createdAt)}</Text>
        )}
        <View
          style={[
            styles.messageBubble,
            isMe ? styles.messageBubbleMine : styles.messageBubbleTheirs,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMe ? styles.messageTextMine : styles.messageTextTheirs,
            ]}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  if (isInitializing) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Pressable
          style={styles.headerProfile}
          onPress={() => {
            if (recipientUid) {
              // Use replace to swap modals instead of nesting them
              router.replace(`/modal/user-profile?id=${recipientUid}`);
            }
          }}
          accessibilityLabel="View profile"
          accessibilityRole="button"
        >
          {recipientPhoto ? (
            <Image source={{ uri: recipientPhoto }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Ionicons name="person" size={16} color={colors.text.tertiary} />
            </View>
          )}
          <Text style={styles.headerName} numberOfLines={1}>
            {recipientName || 'Chat'}
          </Text>
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      {/* Messages + Input wrapped together so keyboard pushes both */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 52}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <View style={styles.emptyChatIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.gold.muted} />
              </View>
              <Text style={styles.emptyChatText}>
                Start a conversation with {recipientName || 'your friend'}
              </Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.text.tertiary}
            multiline
            maxLength={1000}
          />
          <Pressable
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.background.primary} />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={text.trim() ? colors.background.primary : colors.text.tertiary}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ui.border,
    backgroundColor: colors.background.secondary,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: colors.gold.muted + '50',
  },
  headerAvatarFallback: {
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerName: {
    fontFamily: fonts.serif.bold,
    fontSize: 16,
    color: colors.text.primary,
    flex: 1,
  },
  headerSpacer: {
    width: 36,
  },

  // Messages list
  messagesList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageWrapper: {
    marginVertical: 2,
  },
  timeLabel: {
    fontFamily: fonts.sans.regular,
    fontSize: 10,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginVertical: spacing.sm,
    letterSpacing: 0.5,
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    marginVertical: 1,
  },
  messageBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.gold.primary,
    borderBottomRightRadius: 4,
  },
  messageBubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background.tertiary,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextMine: {
    color: colors.text.inverse,
  },
  messageTextTheirs: {
    color: colors.text.primary,
  },

  // Empty state
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
    transform: [{ scaleY: -1 }], // flip because FlatList is inverted
  },
  emptyChatIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background.secondary,
    borderWidth: 0.5,
    borderColor: colors.gold.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChatText: {
    fontFamily: fonts.sans.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.ui.border,
    backgroundColor: colors.background.secondary,
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.sans.regular,
    fontSize: 15,
    color: colors.text.primary,
    backgroundColor: colors.ui.searchBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    borderWidth: 0.5,
    borderColor: colors.ui.border,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: colors.background.tertiary,
  },
});
