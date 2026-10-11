import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { HitsFootnote, HitsGrid } from '@/components/hits/HitsGrid';
import { useGlobalHitsLive, useHitReport, useHitReports } from '@/features/hits/hooks';
import {
  daysUntilPublication,
  isPeriodComplete,
  parseHitsPeriod,
  periodLabel,
  publicationDate,
  shiftMonthKey,
  shiftYearKey,
  type HitsPeriodType,
} from '@/features/hits/period';
import type { HitReportItem, HitsMediaType } from '@/features/hits/types';
import { triggerLightHaptic } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

type Source = 'live' | 'published';

function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function GlobalHitsScreen() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const [periodType, setPeriodType] = useState<HitsPeriodType>('month');
  const [media, setMedia] = useState<HitsMediaType>('movie');
  const [key, setKey] = useState(() => currentMonthKey(today));
  const [source, setSource] = useState<Source>('live');

  const complete = isPeriodComplete(periodType, key);
  const liveQuery = useGlobalHitsLive(periodType, key, media, source === 'live');
  const reportQuery = useHitReport(periodType, key, source === 'published');
  const archiveQuery = useHitReports(true);
  const archive = useMemo(
    () => (archiveQuery.data ?? []).filter((report) => report.periodType === periodType),
    [archiveQuery.data, periodType],
  );
  const reportHasData = (reportQuery.data?.movies.length ?? 0) + (reportQuery.data?.series.length ?? 0) > 0;

  const items: HitReportItem[] = source === 'published'
    ? (media === 'movie' ? reportQuery.data?.movies : reportQuery.data?.series) ?? []
    : liveQuery.data?.items ?? [];
  const loading = source === 'published' ? reportQuery.isLoading : liveQuery.isLoading;
  const loadError = source === 'published' ? reportQuery.isError : liveQuery.isError;

  const switchType = (next: HitsPeriodType) => {
    if (next === periodType) return;
    triggerLightHaptic();
    setPeriodType(next);
    setKey(next === 'month' ? currentMonthKey(today) : String(today.getFullYear()));
    setSource('live');
  };

  const stepPeriod = (delta: number) => {
    const shifted = periodType === 'month' ? shiftMonthKey(key, delta) : shiftYearKey(key, delta);
    if (!shifted) return;
    // Floor at 2000 and never into the future.
    if (shifted < (periodType === 'month' ? '2000-01' : '2000')) return;
    if (!parseHitsPeriod(periodType, shifted)) return;
    triggerLightHaptic();
    setKey(shifted);
    setSource('live');
  };

  const openArchive = (periodKey: string) => {
    triggerLightHaptic();
    setKey(periodKey);
    setSource('published');
  };

  const openTitle = (item: HitReportItem) => {
    router.push({ pathname: '/media/[id]', params: { id: `tmdb:${item.mediaType}:${item.tmdbId}` } });
  };

  const countdown = daysUntilPublication(periodType, key, today);
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(120, Math.floor((Math.min(width, 760) - spacing.xl * 2 - spacing.md) / 2));
  const statusLine = source === 'published'
    ? reportQuery.data
      ? `Published ${reportQuery.data.generatedAt.slice(0, 10)} · TMDB data ${reportQuery.data.retrievedAt.slice(0, 10)}`
      : 'Published report'
    : liveQuery.data
      ? `${complete ? 'Final data' : 'Live preview'} · updated ${new Date(liveQuery.data.retrievedAt).toLocaleString()}${countdown != null ? ` · final report in ${countdown} day${countdown === 1 ? '' : 's'}` : ''}`
      : 'Live preview';

  return <Screen>
    <View style={styles.header}>
      <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
      <View style={styles.titleCopy}>
        <AppText variant="heading1">Global Hits</AppText>
        <AppText variant="bodySmall" muted>TMDB popularity rankings by release period</AppText>
      </View>
    </View>
    <View style={styles.pills}>
      {(['month', 'year'] as HitsPeriodType[]).map((option) => (
        <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: option === periodType }} onPress={() => switchType(option)} style={[styles.pill, option === periodType && styles.pillActive]}>
          <AppText variant="label" style={option === periodType ? styles.pillTextActive : styles.pillText}>{option === 'month' ? 'Monthly' : 'Yearly'}</AppText>
        </Pressable>
      ))}
      <View style={styles.pillGap} />
      {(['movie', 'series'] as HitsMediaType[]).map((option) => (
        <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: option === media }} onPress={() => { if (option !== media) { triggerLightHaptic(); setMedia(option); } }} style={[styles.pill, option === media && styles.pillActive]}>
          <AppText variant="label" style={option === media ? styles.pillTextActive : styles.pillText}>{option === 'movie' ? 'Movies' : 'Series'}</AppText>
        </Pressable>
      ))}
    </View>
    <View style={styles.stepper}>
      <IconButton name="chevron-back" label="Previous period" onPress={() => stepPeriod(-1)} variant="subtle" size={20} />
      <AppText variant="heading3" style={styles.periodLabel}>{periodLabel(periodType, key)}</AppText>
      <IconButton name="chevron-forward" label="Next period" onPress={() => stepPeriod(1)} variant="subtle" size={20} />
    </View>
    <View style={styles.pills}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: source === 'live' }} onPress={() => { if (source !== 'live') { triggerLightHaptic(); setSource('live'); } }} style={[styles.pill, source === 'live' && styles.pillActive]}>
        <AppText variant="label" style={source === 'live' ? styles.pillTextActive : styles.pillText}>Live preview</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: source === 'published' }} onPress={() => { if (source !== 'published') { triggerLightHaptic(); setSource('published'); } }} style={[styles.pill, source === 'published' && styles.pillActive]}>
        <AppText variant="label" style={source === 'published' ? styles.pillTextActive : styles.pillText}>Published</AppText>
      </Pressable>
      <AppText variant="caption" muted style={styles.status}>{statusLine}</AppText>
    </View>
    {archive.length ? (
      <View style={styles.archive}>
        <AppText variant="caption" muted style={styles.archiveTitle}>PAST REPORTS</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.archiveRow}>
          {archive.map((report) => {
            const selected = source === 'published' && report.periodKey === key;
            return <Pressable key={`${report.periodType}:${report.periodKey}`} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Open ${periodLabel(report.periodType, report.periodKey)} report`} onPress={() => openArchive(report.periodKey)} style={[styles.chip, selected && styles.chipActive]}>
              <AppText variant="label" style={selected ? styles.pillTextActive : styles.pillText}>{periodLabel(report.periodType, report.periodKey)}</AppText>
            </Pressable>;
          })}
        </ScrollView>
      </View>
    ) : null}
    <View style={styles.list}>
      <HitsGrid
        items={items}
        loading={loading}
        loadError={loadError}
        cardWidth={cardWidth}
        emptyTitle={source === 'published' && !reportHasData ? 'No report yet' : 'No eligible releases'}
        emptyMessage={source === 'published' && !reportHasData
          ? `The ${periodLabel(periodType, key)} report has not been published yet. Check the live preview instead.`
          : `Nothing with a valid release date in ${periodLabel(periodType, key)}.`}
        onRetry={() => { void (source === 'published' ? reportQuery.refetch() : liveQuery.refetch()); }}
        onOpen={openTitle}
      />
    </View>
    <HitsFootnote text={`Ranked by TMDB popularity among ${periodType === 'month' ? 'that month\u2019s' : 'that year\u2019s'} releases — not box-office or viewership figures.${complete || source === 'published' ? '' : ` Final report publishes ${publicationDate(periodType, key) ?? ''}.`}`} />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  titleCopy: { flex: 1, gap: 2 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  pill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.textSecondary },
  pillTextActive: { color: colors.white },
  pillGap: { width: spacing.sm },
  status: { flex: 1, textAlign: 'right' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  periodLabel: { color: colors.textPrimary },
  archive: { gap: spacing.sm, paddingBottom: spacing.sm },
  archiveTitle: { letterSpacing: 1, marginLeft: spacing.xs },
  archiveRow: { gap: spacing.sm, paddingRight: spacing.xl },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  list: { flex: 1, minHeight: 200 },
});
