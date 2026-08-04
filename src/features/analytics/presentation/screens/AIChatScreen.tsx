import React, { useState, useRef } from 'react';
import { View, StyleSheet, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useAiChat } from '../../../../core/api/hooks/useAI';
import { getApiErrorMessage } from '../../../../core/network/api';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  isLoading?: boolean;
}

const QUICK_PROMPTS = [
  'How is business looking today?',
  'What should I watch out for right now?',
  'Any tips to reduce food waste?',
  'How do I set up a recipe for a menu item?',
  'What can I do to boost average order value?',
];

export const AIChatScreen: React.FC = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'assistant',
      text: "Hi! I'm your PrabandhOS assistant. Ask me about today's business, inventory, staff, or general cafe operations advice.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const aiChat = useAiChat();

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;
    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: 'user', text: text.trim(), timestamp: new Date() };
    const historyForApi = messages
      .filter((m) => !m.isLoading)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const loadingId = `loading_${Date.now()}`;
    setMessages((prev) => [...prev, { id: loadingId, role: 'assistant', text: '...', timestamp: new Date(), isLoading: true }]);

    try {
      const reply = await aiChat.mutateAsync({ history: historyForApi, message: text.trim() });
      setMessages((prev) => prev.map((m) => (m.id === loadingId ? { ...m, text: reply, isLoading: false } : m)));
    } catch (err) {
      const errText = getApiErrorMessage(err);
      setMessages((prev) => prev.map((m) => (m.id === loadingId ? { ...m, text: `Sorry, I couldn't respond just now — ${errText}`, isLoading: false } : m)));
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chat-processing-outline" title="AI Chat" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <View style={styles.aiAvatar}>
            <Icon name="robot" size={16} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>AI Chat</Text>
            <Text style={styles.headerSubtitle}>Powered by Gemini</Text>
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View key={msg.id} style={[styles.bubbleRow, msg.role === 'user' && styles.bubbleRowMine]}>
            {msg.role === 'assistant' && (
              <View style={styles.smallAvatar}>
                <Icon name={msg.isLoading ? 'dots-horizontal' : 'robot-outline'} size={14} color={COLORS.accent} />
              </View>
            )}
            <View style={[styles.bubble, msg.role === 'user' ? styles.bubbleMine : styles.bubbleAssistant]}>
              <Text style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextMine]}>{msg.text}</Text>
            </View>
          </View>
        ))}

        {messages.length <= 2 && (
          <View style={styles.quickPrompts}>
            <Text style={styles.quickLabel}>Try asking:</Text>
            {QUICK_PROMPTS.map((p) => (
              <TouchableOpacity key={p} style={styles.promptChip} onPress={() => sendMessage(p)}>
                <Text style={styles.promptChipText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.composerWrapper, focused && styles.composerWrapperFocused]}>
            <TextInput
              style={[styles.composerInput, webNoOutline]}
              placeholder="Ask me about your cafe..."
              placeholderTextColor={COLORS.placeholder}
              value={input}
              onChangeText={setInput}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => sendMessage(input)}
              returnKeyType="send"
              multiline
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isTyping) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
          >
            <Icon name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingBottom: isDesktopWeb ? 9 : 9,
  },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.aiIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  headerSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1 : 0.75 },
  chatArea: { flex: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: isDesktopWeb ? 11 : 10.5 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  smallAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.aiIconBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isDesktopWeb ? 6 : 6,
  },
  bubble: { maxWidth: '80%', borderRadius: 8, paddingHorizontal: isDesktopWeb ? 11 : 10.5, paddingVertical: isDesktopWeb ? 8 : 7.5 },
  bubbleAssistant: { backgroundColor: COLORS.cardAlt, borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: COLORS.accent, borderTopRightRadius: 4 },
  bubbleText: { fontSize: isDesktopWeb ? 14 : 12, lineHeight: 20, color: COLORS.heading },
  bubbleTextMine: { color: '#FFFFFF' },
  quickPrompts: { marginTop: isDesktopWeb ? 4 : 3 },
  quickLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 6 },
  promptChip: {
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 10,
    paddingHorizontal: isDesktopWeb ? 9 : 9,
    paddingVertical: isDesktopWeb ? 8 : 7.5,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  promptChipText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.accent, fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: isDesktopWeb ? 8 : 7.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 8 : 7.5,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.background,
  },
  composerWrapper: {
    flex: 1,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 11 : 10.5,
    paddingVertical: isDesktopWeb ? 8 : 7.5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    maxHeight: 100,
  },
  composerWrapperFocused: { borderColor: COLORS.accent, borderWidth: 2 },
  composerInput: { fontSize: 16, color: COLORS.heading, minHeight: 20 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
