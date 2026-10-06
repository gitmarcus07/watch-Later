import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/buttons/IconButton';
import { Screen } from '@/components/common/Screen';
import { colors, spacing } from '@/theme';

export default function LoginScreen() {
  return <Screen><View style={styles.header}><IconButton name="close" label="Close" onPress={() => router.back()} /></View><View style={styles.content}><View style={styles.icon}><Ionicons name="person-outline" size={26} color={colors.accent} /></View><AppText variant="heading1">Welcome back</AppText><AppText muted>Account sign-in is being prepared. Guest mode is ready to use.</AppText></View></Screen>;
}

const styles = StyleSheet.create({ header: { paddingTop: spacing.md, alignItems: 'flex-start' }, content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.xl }, icon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm } });
