import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/buttons/IconButton';
import { AppButton } from '@/components/buttons/AppButton';
import { EpisodeList, SeasonSelector } from '@/components/media/EpisodeList';
import { Screen } from '@/components/common/Screen';
import { mockMedia } from '@/features/catalog/mock/mockMedia';
import { colors, radius, spacing } from '@/theme';

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [season, setSeason] = useState('Season 1');
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const media = mockMedia.find((item) => item.id === id) ?? mockMedia[0];
  const episodic = media.kind !== 'Movie';
  return <Screen><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
    <View style={styles.hero}><LinearGradient colors={[...media.palette]} style={StyleSheet.absoluteFill} /><View style={styles.heroTop}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><IconButton name="ellipsis-horizontal" label="More options" onPress={() => undefined} /></View><View style={styles.heroTitle}><AppText variant="caption" style={styles.kind}>{media.kind.toUpperCase()}</AppText><AppText variant="heading1">{media.title}</AppText><AppText variant="bodySmall" color="rgba(255,255,255,0.78)">{media.kind === 'Movie' ? `${media.year}  ·  ${media.kind}` : `${media.year}  ·  ${media.kind}  ·  ${media.subtitle}`}</AppText></View></View>
    <View style={styles.body}><View style={styles.metadata}><View style={styles.rating}><Ionicons name="star" color={colors.accent} size={16} /><AppText variant="label">{media.rating}</AppText></View><AppText variant="caption" muted>Popular with film lovers</AppText></View>
      <AppButton label={saved ? 'Added to Watchlist' : 'Add to Watchlist'} icon={<Ionicons name={saved ? 'checkmark' : 'bookmark-outline'} size={18} color={colors.background} />} onPress={() => setSaved((current) => !current)} />
      <View style={styles.section}><AppText variant="heading3">Overview</AppText><AppText variant="bodySmall" muted style={styles.overview}>{media.title} is a story worth keeping close. This preview detail gives your future collection a home for a synopsis, genres and credits.</AppText><View style={styles.tags}><View style={styles.tag}><AppText variant="caption" muted>{media.kind}</AppText></View><View style={styles.tag}><AppText variant="caption" muted>Drama</AppText></View><View style={styles.tag}><AppText variant="caption" muted>Adventure</AppText></View></View></View>
      {episodic ? <View style={styles.section}><AppText variant="heading3" style={styles.seasonHeading}>Episodes</AppText><SeasonSelector season={season} onPress={() => setSeasonPickerOpen((open) => !open)} />{seasonPickerOpen ? <View style={styles.seasonOptions}>{['Season 1', 'Season 2', 'Season 3'].map((item) => <AppButton key={item} label={item} variant={season === item ? 'secondary' : 'text'} onPress={() => { setSeason(item); setSeasonPickerOpen(false); }} />)}</View> : null}<EpisodeList /></View> : null}
    </View>
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ scroll: { paddingBottom: spacing['2xl'] }, hero: { height: 350, marginHorizontal: -spacing.xl, padding: spacing.xl, justifyContent: 'space-between', overflow: 'hidden' }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }, heroTitle: { gap: spacing.sm, paddingBottom: spacing.sm }, kind: { color: colors.accent, letterSpacing: 1.4 }, body: { paddingTop: spacing.lg }, metadata: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }, rating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill }, section: { marginTop: spacing['2xl'] }, overview: { marginTop: spacing.md, lineHeight: 23 }, tags: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }, tag: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }, seasonHeading: { marginBottom: spacing.md }, seasonOptions: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md, gap: spacing.xs } });
