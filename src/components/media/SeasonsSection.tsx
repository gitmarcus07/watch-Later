import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { EpisodeList, hasAired } from '@/components/media/EpisodeList';
import { SetProgressDialog } from '@/components/media/SetProgressDialog';
import { EmptyState, ErrorView, EpisodeListSkeleton, LoadingView } from '@/components/feedback/FeedbackViews';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import { CatalogError } from '@/domain/errors/CatalogError';
import type { CatalogMedia, CatalogSeason, MediaEpisode, SeasonSummary } from '@/domain/models/media';
import type { SeriesProgress } from '@/domain/models/watchState';
import { fetchCatalogSeason, useCatalogSeason } from '@/features/catalog/hooks';
import { isUpcoming } from '@/features/catalog/upcoming';
import { useAnimeWatchedCount, useCachedSeason, useSeriesTrackingStatus, useStoreSeason, useToggleEpisode, useToggleSeason } from '@/features/watchState/hooks';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { markUpToHere } from '@/features/watchState/status';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { triggerLightHaptic, triggerSuccessHaptic } from '@/lib/haptics';
import { queryClient } from '@/lib/query/queryClient';
import { scheduleAutoSync } from '@/features/sync/autoSync';
import { colors, radius, spacing } from '@/theme';

function SeasonCard({ media, summary, expanded, upcoming, onToggleExpand, onSetProgress, onUpToHere }: {
  media: CatalogMedia;
  summary: SeasonSummary;
  expanded: boolean;
  upcoming: boolean;
  onToggleExpand: () => void;
  onSetProgress: (seasonNumber: number) => void;
  onUpToHere: (episode: MediaEpisode) => void;
}) {
  const identity = { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId } as const;
  // Heavy season payloads load lazily: only the open card hits the network or
  // SQLite episode tables, so opening a show never fires N parallel fetches.
  // Anime cards pass their summary so episodes resolve from its refs without
  // re-walking the franchise chain. The header checkbox pulls that same cached
  // payload on demand, which is what makes it work before the card is expanded.
  const [onDemandSeason, setOnDemandSeason] = useState<CatalogSeason | undefined>(undefined);
  const [pullingSeason, setPullingSeason] = useState(false);
  const seasonQuery = useCatalogSeason(identity, expanded ? summary.seasonNumber : undefined, summary);
  const localSeasonQuery = useCachedSeason(identity, expanded ? summary.seasonNumber : undefined);
  const season: CatalogSeason | undefined = seasonQuery.data ?? localSeasonQuery.data ?? onDemandSeason;
  const emptySeason: CatalogSeason = { series: identity, seasonNumber: summary.seasonNumber, name: summary.name, episodes: [] };
  const episodeMutation = useToggleEpisode(media, season ?? emptySeason);
  const watchedIds = episodeMutation.watchedIds;
  const toggleSeasonMutation = useToggleSeason(media, summary.seasonNumber);
  const storeSeasonMutation = useStoreSeason(media);
  const trackingStatus = useSeriesTrackingStatus(identity);
  const storedRef = useRef('');

  useEffect(() => {
    if (!expanded || !trackingStatus.data || !seasonQuery.data) return;
    const key = `${summary.seasonNumber}:${seasonQuery.data.episodes.length}`;
    if (storedRef.current === key) return;
    storedRef.current = key;
    storeSeasonMutation.mutate(seasonQuery.data);
  }, [expanded, trackingStatus.data, seasonQuery.data, storeSeasonMutation, summary.seasonNumber]);

  const episodes = season?.episodes ?? [];
  // Weekly shows publish one episode at a time, so only what has already
  // aired can be marked — the rest is locked until its air date arrives.
  const releasedEpisodes = episodes.filter((episode) => hasAired(episode.airDate));
  const episodeCount = episodes.length || summary.episodeCount || 0;
  const watchedCount = episodes.length
    ? episodes.filter((episode) => watchedIds.includes(episode.providerId)).length
    : Math.min(watchedIds.length, episodeCount);
  // Collapsed cards have no episode rows loaded, so fall back to the counts —
  // a finished season (10/10) must read as watched in both states.
  const allWatched = episodes.length
    ? releasedEpisodes.length > 0 && releasedEpisodes.every((episode) => watchedIds.includes(episode.providerId))
    : episodeCount > 0 && watchedCount >= episodeCount;
  const busy = episodeMutation.isPending || toggleSeasonMutation.isPending;
  const supportsSeasonLoad =
    (identity.provider === 'tmdb' && identity.mediaType === 'series')
    || (identity.provider === 'anilist' && identity.mediaType === 'anime')
    || (identity.provider === 'tvdb' && identity.mediaType !== 'movie');

  const applySeasonToggle = (target: CatalogSeason) => {
    // Only the aired rows are written; unreleased episodes are never marked.
    const aired = target.episodes.filter((episode) => hasAired(episode.airDate));
    if (!aired.length) {
      triggerLightHaptic();
      showToast(`None of ${summary.name} has aired yet`, 'info');
      return;
    }
    const watchedNow = aired.every((episode) => watchedIds.includes(episode.providerId));
    triggerLightHaptic();
    toggleSeasonMutation.mutate({ watched: !watchedNow, season: { ...target, episodes: aired } }, {
      onSuccess: () => {
        triggerSuccessHaptic();
        void queryClient.invalidateQueries({ queryKey: ['watch'] });
        scheduleAutoSync('mutation');
        showToast(watchedNow ? `${summary.name} marked unwatched` : `${summary.name} marked watched`, watchedNow ? 'info' : 'success');
      },
      onError: (error) => void showDialog({ type: 'error', title: 'Couldn’t update this season', message: friendlyErrorMessage(error) }),
    });
  };

  const toggleSeason = async () => {
    if (busy || pullingSeason) return;
    if (season?.episodes.length) { applySeasonToggle(season); return; }
    if (!supportsSeasonLoad) {
      triggerLightHaptic();
      showToast('Episodes for this season aren’t available yet', 'info');
      return;
    }
    // Nothing loaded yet: pull the payload the expanded card would use, then
    // toggle it, so the checkbox works without opening the card first.
    triggerLightHaptic();
    setPullingSeason(true);
    try {
      const loaded = await fetchCatalogSeason(identity, summary.seasonNumber, summary);
      setOnDemandSeason(loaded);
      if (loaded.episodes.length) applySeasonToggle(loaded);
      else showToast('Episodes for this season aren’t available yet', 'info');
    } catch (error) {
      void showDialog({ type: 'error', title: 'Couldn’t load this season', message: friendlyErrorMessage(error) });
    } finally {
      setPullingSeason(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${summary.name}, ${watchedCount} of ${episodeCount} watched, ${expanded ? 'collapse' : 'expand'}`}
          accessibilityState={{ expanded }}
          onPress={onToggleExpand}
          style={({ pressed }) => [styles.cardTitle, pressed && styles.pressed]}
        >
          <View style={styles.cardCopy}>
            <AppText variant="bodyMedium" numberOfLines={1}>{summary.name}</AppText>
            <AppText variant="caption" muted>{episodeCount ? `${watchedCount}/${episodeCount} watched` : season?.episodes.length ? `${watchedCount}/${season.episodes.length} watched` : 'Tap to view episodes'}</AppText>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </Pressable>
        {/* An unreleased title has nothing to tick yet: the "mark season
            watched" box only appears once the season can actually be seen. */}
        {upcoming ? <View style={styles.seasonToggle} accessibilityLabel={`${summary.name} has not released yet`}><Ionicons name="calendar-outline" size={21} color={colors.textMuted} /></View> : (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Mark ${summary.name} ${allWatched ? 'unwatched' : 'watched'}`}
          accessibilityState={{ checked: allWatched, disabled: busy || pullingSeason, busy: pullingSeason }}
          disabled={busy || pullingSeason}
          onPress={() => void toggleSeason()}
          hitSlop={8}
          style={styles.seasonToggle}
        >
          {pullingSeason ? <ActivityIndicator size="small" color={colors.accent} /> : (
            <Ionicons name={allWatched ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={allWatched ? colors.success : colors.textMuted} />
          )}
        </Pressable>
        )}
      </View>
      {expanded ? (
        seasonQuery.isLoading && !localSeasonQuery.data ? <View style={styles.cardBody}><EpisodeListSkeleton rows={Math.min(Math.max(summary.episodeCount ?? 4, 2), 6)} /></View>
          : seasonQuery.isError && !localSeasonQuery.data ? <View style={styles.cardBody}><ErrorView message={seasonQuery.error instanceof CatalogError ? seasonQuery.error.userMessage : 'Could not load this season.'} onRetry={() => void seasonQuery.refetch()} /></View>
          : season?.episodes.length ? (
            <View style={styles.cardBody}>
              {season.episodes.length > 1 && !upcoming ? <Pressable accessibilityRole="button" accessibilityLabel={`Set progress in ${summary.name}`} onPress={() => onSetProgress(summary.seasonNumber)}><AppText variant="label" style={styles.link}>I am on…</AppText></Pressable> : null}
              <EpisodeList episodes={season.episodes} watchedIds={episodeMutation.watchedIds} disabled={busy} onToggleEpisode={(episode, watched) => { triggerLightHaptic(); episodeMutation.toggle({ episode, watched }); }} onUpToHere={onUpToHere} />
            </View>
          ) : <View style={styles.cardBody}><EmptyState icon="list-outline" title="No episodes listed" message="This season does not have episode metadata available." /></View>
      ) : null}
    </View>
  );
}

/**
 * Seasons and episodes as one collapsible list. The season you're currently
 * on opens automatically; tap any episode to toggle it, long-press to mark
 * everything up to that episode. Anime works exactly like series: its TV
 * seasons resolve per season (real titles via the Jikan open API), and
 * one-off specials never appear as fake seasons.
 */
export function SeasonsSection({ media, progress, initialSeasonNumber }: {
  media: CatalogMedia;
  progress?: SeriesProgress;
  initialSeasonNumber?: number;
}) {
  const summaries = media.seasonSummaries ?? [];
  const currentSeason = initialSeasonNumber ?? progress?.nextEpisode?.seasonNumber ?? summaries[0]?.seasonNumber;
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => currentSeason !== undefined ? { [currentSeason]: true } : {});
  const [userToggled, setUserToggled] = useState(false);
  // Progress arrives async after the catalog payload; auto-open the season
  // the viewer is actually on unless they already picked one manually.
  useEffect(() => {
    if (userToggled || currentSeason === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync of async progress into UI state
    setExpanded((current) => (current[currentSeason] ? current : { ...current, [currentSeason]: true }));
  }, [currentSeason, userToggled]);
  const [progressTarget, setProgressTarget] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Unreleased titles show their season/episode structure but never a
  // "mark watched" control — there is nothing to have watched yet.
  const upcoming = isUpcoming(media);

  if (media.mediaType === 'anime' && !summaries.length) {
    // Total unknown and no season data: keep the manual stepper so existing
    // progress is never lost — unless it hasn't premiered, where a stepper
    // would only invite marking an unwatched title as watched.
    if (upcoming) return <UpcomingTitleNotice />;
    return <AnimeProgressCard media={media} progress={progress} />;
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['watch'] });
    scheduleAutoSync('mutation');
  };

  const saveUpToHere = (seasonNumber: number, episodeNumber: number) => {
    setBusy(true);
    triggerLightHaptic();
    markUpToHere(media, seasonNumber, episodeNumber).then((marked) => {
      triggerSuccessHaptic();
      refresh();
      // Weekly shows clamp the position to what has aired, so report the
      // position that was actually written.
      showToast(marked === episodeNumber ? `Marked up to S${seasonNumber}E${episodeNumber}` : `Marked up to S${seasonNumber}E${marked} — later episodes haven’t aired`, 'success');
    }).catch((error: unknown) => {
      void showDialog({ type: 'error', title: 'Couldn’t update episodes', message: friendlyErrorMessage(error) });
    }).finally(() => setBusy(false));
  };

  const confirmUpToHere = (episode: MediaEpisode) => {
    void showDialog({
      type: 'info', title: `Mark up to S${episode.seasonNumber}E${episode.episodeNumber}?`,
      message: 'Every episode up to and including this one will be marked watched.',
      primaryAction: { label: 'Mark watched' }, secondaryAction: { label: 'Cancel' },
    }).then((confirmed) => {
      if (confirmed) saveUpToHere(episode.seasonNumber, episode.episodeNumber);
    });
  };

  if (!summaries.length) {
    return <View style={styles.messageCard}><Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} /><AppText variant="bodySmall" muted style={styles.messageText}>Season metadata is not available for this title.</AppText></View>;
  }

  const denominator = progress?.totalEpisodeCount ?? progress?.cachedEpisodeCount ?? 0;

  return (
    <View style={styles.container}>
      <AppText variant="caption" muted>
        {upcoming
          ? 'Not released yet — episodes unlock and become tappable on their release date.'
          : `${progress && denominator > 0 ? `${progress.watchedEpisodeCount}/${denominator} episodes watched · ` : ''}Tap an episode to toggle it · long-press marks up to here · episodes that haven’t aired stay locked`}
      </AppText>
      {media.mediaType === 'anime' && !upcoming ? <AnimeLegacyCountImporter media={media} progress={progress} /> : null}
      {summaries.map((summary) => (
        <SeasonCard
          key={summary.seasonNumber}
          media={media}
          summary={summary}
          expanded={expanded[summary.seasonNumber] ?? false}
          upcoming={upcoming}
          onToggleExpand={() => { setUserToggled(true); setExpanded((current) => ({ ...current, [summary.seasonNumber]: !current[summary.seasonNumber] })); }}
          onSetProgress={setProgressTarget}
          onUpToHere={confirmUpToHere}
        />
      ))}
      <SetProgressDialog key={progressTarget === undefined ? 'closed' : `season-${progressTarget}`} visible={progressTarget !== undefined} mediaTitle={media.title} initialSeason={progressTarget ?? currentSeason ?? 1} onClose={() => setProgressTarget(undefined)} onSave={(seasonNumber, episodeNumber) => { setProgressTarget(undefined); saveUpToHere(seasonNumber, episodeNumber); }} />
      {busy ? <LoadingView label="Updating episodes" /> : null}
    </View>
  );
}

/**
 * One-time carry-over for anime tracked with the old manual counter: when a
 * title has a legacy count but no per-episode watches yet, the first N
 * episodes are marked watched after the season loads. Runs once, silently.
 */
function AnimeLegacyCountImporter({ media, progress }: { media: CatalogMedia; progress?: SeriesProgress }) {
  const identity = { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId } as const;
  const countQuery = useAnimeWatchedCount(identity);
  const seasonQuery = useCatalogSeason(identity, 1, media.seasonSummaries?.find((summary) => summary.seasonNumber === 1));
  const importedRef = useRef(false);

  useEffect(() => {
    const legacyCount = countQuery.data ?? 0;
    const season = seasonQuery.data;
    if (importedRef.current || legacyCount <= 0 || (progress?.watchedEpisodeCount ?? 0) > 0 || !season?.episodes.length) return;
    importedRef.current = true;
    const upTo = Math.min(legacyCount, season.episodes.length);
    markUpToHere(media, 1, upTo)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['watch'] });
        scheduleAutoSync('mutation');
      })
      .catch(() => { importedRef.current = false; });
  }, [countQuery.data, seasonQuery.data, progress?.watchedEpisodeCount, media]);

  return null;
}

/**
 * Placeholder where the episode-progress controls would sit, for a title that
 * has not been released yet. Nothing can be marked before its air date.
 */
function UpcomingTitleNotice() {
  return <View style={styles.messageCard}><Ionicons name="calendar-outline" size={19} color={colors.accent} /><AppText variant="bodySmall" muted style={styles.messageText}>Not released yet — episode progress unlocks once it starts airing.</AppText></View>;
}

/**
 * Manual episode counter for anime whose episode total is unknown. AniList
 * publishes no season data for these, so the stepper is the honest path.
 * Reaching the total marks the title watched automatically.
 */
function AnimeProgressCard({ media, progress }: { media: CatalogMedia; progress?: SeriesProgress }) {
  const identity = { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId } as const;
  const countQuery = useAnimeWatchedCount(identity);
  const [busy, setBusy] = useState(false);
  const total = media.numberOfEpisodes && media.numberOfEpisodes > 0 ? media.numberOfEpisodes : undefined;
  const count = Math.max(0, countQuery.data ?? 0);

  if (!total) {
    return <View style={styles.messageCard}><Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} /><AppText variant="bodySmall" muted style={styles.messageText}>Episode-level metadata is not available from AniList for this title.</AppText></View>;
  }

  const step = (next: number) => {
    const clamped = Math.min(total, Math.max(0, next));
    if (busy || clamped === count) return;
    setBusy(true);
    (async () => {
      await watchStateRepository.setAnimeWatchedCount(media, clamped);
      if (clamped >= total && !progress?.isComplete) await watchStateRepository.setSeriesComplete(media, true);
      else if (clamped < total && progress?.isComplete) await watchStateRepository.setSeriesComplete(media, false);
      void queryClient.invalidateQueries({ queryKey: ['watch'] });
      if (clamped >= total) showToast('Marked as watched', 'success');
    })().catch((error: unknown) => {
      void showDialog({ type: 'error', title: 'Couldn’t update episode progress', message: friendlyErrorMessage(error) });
    }).finally(() => setBusy(false));
  };

  return (
    <View style={styles.animeCard}>
      <View style={styles.animeTop}>
        <View style={styles.animeCopy}>
          <AppText variant="bodyMedium">Episodes watched</AppText>
          <AppText variant="caption" muted>{count} of {total}{progress?.isComplete ? ' · watched' : ''}</AppText>
        </View>
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel="One fewer episode watched" accessibilityState={{ disabled: busy || count <= 0 }} disabled={busy || count <= 0} onPress={() => step(count - 1)} hitSlop={8} style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
            <Ionicons name="remove" size={20} color={colors.textPrimary} />
          </Pressable>
          <AppText variant="heading2" style={styles.stepCount}>{count}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="One more episode watched" accessibilityState={{ disabled: busy || count >= total }} disabled={busy || count >= total} onPress={() => step(count + 1)} hitSlop={8} style={({ pressed }) => [styles.step, styles.stepAdd, pressed && styles.pressed]}>
            <Ionicons name="add" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(1, count / total) * 100}%` }]} /></View>
      <AppText variant="caption" muted>Tap + for each episode you finish — reaching {total} marks it watched.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.medium, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.md, paddingVertical: spacing.sm, minHeight: 60 },
  cardTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  seasonToggle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, gap: 2 },
  cardBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  link: { color: colors.accent },
  messageCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.medium, padding: spacing.lg, backgroundColor: colors.surface },
  messageText: { flex: 1 },
  pressed: { opacity: 0.78 },
  animeCard: { gap: spacing.md, borderRadius: radius.medium, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  animeTop: { gap: spacing.md },
  animeCopy: { gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  step: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  stepAdd: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepCount: { color: colors.white },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.accent },
});
