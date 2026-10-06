import { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { colors, radius, spacing } from '@/theme';

interface PosterCardProps {
  title: string;
  posterUri?: string;
  subtitle?: string;
  badge?: string;
  progress?: number;
  width?: number;
  palette?: readonly [string, string];
  onPress?: () => void;
}

export const PosterCard = memo(function PosterCard({ title, posterUri, subtitle, badge, progress, width = 132, palette = ['#51416C', '#202637'], onPress }: PosterCardProps) {
  const poster = <View style={[styles.poster, { width, height: width * 1.46 }]}>
    {posterUri ? <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <LinearGradient colors={[...palette]} style={styles.art}>
      <View style={styles.artTop}><Ionicons name="sparkles" size={14} color="rgba(255,255,255,0.7)" /></View>
      <AppText variant="caption" style={styles.artTitle} numberOfLines={3}>{title.toUpperCase()}</AppText>
      <View style={styles.artMark}><View style={styles.artMarkInner} /></View>
    </LinearGradient>}
    {badge ? <View style={styles.badge}><AppText variant="caption" style={styles.badgeText}>{badge}</AppText></View> : null}
    {typeof progress === 'number' ? <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} /></View> : null}
  </View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`} onPress={onPress} style={({ pressed }) => [styles.container, { width }, pressed && styles.pressed]}>
    {poster}
    <AppText variant="bodyMedium" numberOfLines={1} style={styles.title}>{title}</AppText>
    {subtitle ? <AppText variant="caption" muted numberOfLines={1}>{subtitle}</AppText> : null}
  </Pressable>;
});

const styles = StyleSheet.create({
  container: { gap: spacing.xs }, poster: { overflow: 'hidden', borderRadius: radius.medium, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  art: { flex: 1, padding: spacing.md, justifyContent: 'space-between' }, artTop: { alignItems: 'flex-end' }, artTitle: { color: colors.white, letterSpacing: 1.1, textShadowColor: '#000', textShadowRadius: 8 },
  artMark: { width: 30, height: 30, borderRadius: 15, borderColor: 'rgba(255,255,255,0.48)', borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' }, artMarkInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.8)' },
  badge: { position: 'absolute', left: spacing.sm, top: spacing.sm, backgroundColor: 'rgba(11,13,18,0.78)', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }, badgeText: { fontSize: 10, color: colors.white },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.26)' }, progressFill: { height: 3, backgroundColor: colors.accent }, title: { marginTop: spacing.xs }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
