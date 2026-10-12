/**
 * Watch Later – animated splash.
 *
 * Full-bleed poster marquee: rows of catalog posters drift across the whole
 * screen (top to bottom, alternating directions) under a slow zoom, with the
 * wordmark springing in letter by letter and the tagline fading up after it.
 *
 * Posters paint instantly: a small bundled set of TMDb CDN artworks renders
 * on the first frame, the last fetched trending set is restored from local
 * cache, and a fresh trending fetch refreshes both in the background. Any
 * failed artwork degrades to a gradient tile, so the splash can never crash
 * or hang on network state.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, StatusBar, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';

const { width: W, height: H } = Dimensions.get('window');

const BASE = '#070312';
const TAGLINE = 'Your stories, on your time.';
const TILE_W = 92;
const TILE_H = 134;
const TILE_GAP = 10;
const ROW_GAP = 12;
const TILE_STRIDE = TILE_W + TILE_GAP;
const POSTER_CACHE_KEY = 'watch-later.splash-posters.v1';
// Tiles needed so one loop always covers the screen width, rotated + scaled.
const MIN_TILES = Math.max(6, Math.ceil(((W * 1.5) / TILE_STRIDE)));
// Rows needed so the marquee covers the screen top to bottom, rotated.
const ROW_COUNT = Math.max(4, Math.ceil(H / (TILE_H + ROW_GAP)) + 1);

/** Instant first-frame artwork (small w342 TMDb CDN files); failures fall back to tiles. */
const BUNDLED_POSTERS = [
  'https://image.tmdb.org/t/p/w342/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
  'https://image.tmdb.org/t/p/w342/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg',
  'https://image.tmdb.org/t/p/w342/74xTEgt7R36Fpooo50r9T25onhq.jpg',
  'https://image.tmdb.org/t/p/w342/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  'https://image.tmdb.org/t/p/w342/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
  'https://image.tmdb.org/t/p/w342/or06FN3Dka5tukK1e9sl16pB3iy.jpg',
  'https://image.tmdb.org/t/p/w342/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg',
  'https://image.tmdb.org/t/p/w342/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  'https://image.tmdb.org/t/p/w342/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
  'https://image.tmdb.org/t/p/w342/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
  'https://image.tmdb.org/t/p/w342/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg',
  'https://image.tmdb.org/t/p/w342/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
];

type Props = {
  /** flip to true once fonts/data/auth are ready */
  isReady?: boolean;
  /** called after the exit animation – unmount the splash here */
  onFinish: () => void;
  /** shortest time the splash stays on screen */
  minDuration?: number;
  /** retained for compatibility; no longer used (no clap moment) */
  onClap?: () => void;
};

/* ───────────────────────── title letters ───────────────────────── */

const TitleLetter = ({ ch, index, color }: { ch: string; index: number; color: string }) => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(400 + index * 45, withSpring(1, { damping: 12, stiffness: 170 }));
  }, [index, p]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.4], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: (1 - p.value) * 30 }, { scale: 0.6 + 0.4 * p.value }],
  }));
  return <Animated.Text style={[styles.titleLetter, { color }, style]}>{ch}</Animated.Text>;
};

/* ───────────────────────── poster marquee ───────────────────────── */

function PosterTile({ uri }: { uri: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <LinearGradient
        colors={['#3B2266', '#170B33']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tile}
      >
        <Ionicons name="film-outline" size={20} color="rgba(216,180,254,0.5)" />
      </LinearGradient>
    );
  }
  return <Animated.Image source={{ uri }} style={styles.tile} resizeMode="cover" onError={() => setFailed(true)} />;
}

function MarqueeRow({ uris, duration, reverse, opacity }: { uris: string[]; duration: number; reverse?: boolean; opacity: number }) {
  const count = Math.max(uris.length, MIN_TILES);
  const loopWidth = count * TILE_STRIDE;
  const x = useSharedValue(reverse ? -loopWidth : 0);

  useEffect(() => {
    x.value = withRepeat(
      withTiming(reverse ? 0 : -loopWidth, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [duration, loopWidth, reverse, x]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // Cycle the available posters to fill the row: with only a handful of
  // artworks every tile still shows a poster instead of a dark gap.
  const tiles = useMemo(() => {
    const source: (string | undefined)[] = uris.length ? [...uris] : [undefined];
    const list: (string | undefined)[] = [];
    while (list.length < count) list.push(source[list.length % source.length]);
    return [...list, ...list];
  }, [uris, count]);

  return (
    <View style={styles.rowClip}>
      <Animated.View style={[styles.row, { width: loopWidth * 2, opacity }, style]}>
        {tiles.map((uri, index) => <PosterTile key={index} uri={uri} />)}
      </Animated.View>
    </View>
  );
}

/* ───────────────────────────── screen ───────────────────────────── */

export default function SplashScreen({ isReady = true, onFinish, minDuration = 4000 }: Props) {
  const [minDone, setMinDone] = useState(false);
  // Bundled artwork paints instantly; cache + trending replace it when ready.
  const [posters, setPosters] = useState<string[]>(BUNDLED_POSTERS);

  const tagIn = useSharedValue(0);
  const marqueeIn = useSharedValue(0);
  const zoom = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    tagIn.value = withDelay(1300, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    marqueeIn.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    zoom.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.ease) }), -1, true);
    const timer = setTimeout(() => setMinDone(true), minDuration);
    return () => clearTimeout(timer);
  }, [minDuration, tagIn, marqueeIn, zoom]);

  // Posters in speed order: bundled (instant) → last cached set (local read)
  // → fresh trending (network). Every stage is optional.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(POSTER_CACHE_KEY)
      .then((cached) => {
        if (cancelled || !cached) return;
        try {
          const uris = (JSON.parse(cached) as unknown[]).filter((uri): uri is string => typeof uri === 'string' && uri.startsWith('http'));
          if (uris.length >= 6) setPosters(uris.slice(0, 21));
        } catch {
          // Corrupt cache is simply ignored.
        }
      })
      .catch(() => undefined);
    catalogRepository
      .getTrending()
      .then((items) => {
        if (cancelled) return;
        const uris = items.map((item) => item.posterUrl).filter((uri): uri is string => Boolean(uri));
        if (uris.length >= 6) {
          const fresh = uris.slice(0, 21);
          setPosters(fresh);
          void AsyncStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(fresh)).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isReady && minDone) {
      exit.value = withTiming(1, { duration: 480, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(onFinish)();
      });
    }
    // onFinish has an inline identity in the layout; re-subscribing to it
    // would replay the exit, so readiness alone drives this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, minDone]);

  // Round-robin the posters across full-height rows so every row drifts.
  const rows = useMemo(() => {
    const buckets: string[][] = Array.from({ length: ROW_COUNT }, () => []);
    posters.forEach((uri, index) => {
      buckets[index % ROW_COUNT].push(uri);
    });
    return buckets;
  }, [posters]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: interpolate(exit.value, [0, 0.6, 1], [1, 1, 0]),
  }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(exit.value, [0, 1], [1, 1.12]) }],
    opacity: interpolate(exit.value, [0, 0.7], [1, 0], Extrapolation.CLAMP),
  }));
  const marqueeStyle = useAnimatedStyle(() => ({
    opacity: marqueeIn.value,
    transform: [{ scale: 1.12 + zoom.value * 0.07 }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagIn.value,
    transform: [{ translateY: (1 - tagIn.value) * 14 }],
  }));

  const wordOne = 'watch ';
  const wordTwo = 'Later';
  const durations = [24000, 30000, 27000, 32000, 25000, 31000, 28000];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents="auto">
      <StatusBar hidden />
      <LinearGradient colors={['#070312', '#1E0A44', '#3B0764']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.glow} pointerEvents="none" />

      <Animated.View style={[styles.marquee, marqueeStyle]} pointerEvents="none">
        {rows.map((uris, index) => (
          <MarqueeRow key={index} uris={uris} duration={durations[index % durations.length]} reverse={index % 2 === 1} opacity={0.5 - (index % 3) * 0.07} />
        ))}
      </Animated.View>

      {/* legibility scrims over the moving posters */}
      <LinearGradient colors={['rgba(7,3,18,0.9)', 'rgba(7,3,18,0.2)']} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={['rgba(7,3,18,0.2)', 'rgba(7,3,18,0.94)']} style={styles.bottomScrim} pointerEvents="none" />
      <View style={styles.centerScrim} pointerEvents="none" />

      <Animated.View style={[styles.center, contentStyle]}>
        <View style={styles.titleRow} accessible accessibilityLabel="watch Later">
          {wordOne.split('').map((ch, i) => (
            <TitleLetter key={`a${i}`} ch={ch} index={i} color="#FFFFFF" />
          ))}
          {wordTwo.split('').map((ch, i) => (
            <TitleLetter key={`b${i}`} ch={ch} index={wordOne.length + i} color="#C084FC" />
          ))}
        </View>
        <Animated.Text style={[styles.tagline, tagStyle]}>{TAGLINE}</Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

/* ───────────────────────────── styles ───────────────────────────── */

const styles = StyleSheet.create({
  root: { backgroundColor: BASE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 999, elevation: 999 },
  glow: { position: 'absolute', top: H * 0.28, left: W * 0.5 - 190, width: 380, height: 380, borderRadius: 190, backgroundColor: 'rgba(139,61,255,0.22)' },
  marquee: { position: 'absolute', top: -TILE_H, bottom: -TILE_H, left: -TILE_W, right: -TILE_W, gap: ROW_GAP, transform: [{ rotate: '-4deg' }], justifyContent: 'center' },
  rowClip: { height: TILE_H, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: TILE_GAP, height: TILE_H },
  tile: { width: TILE_W, height: TILE_H, borderRadius: 10, backgroundColor: '#170B33', alignItems: 'center', justifyContent: 'center' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: H * 0.3 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.36 },
  centerScrim: { position: 'absolute', top: H * 0.32, bottom: H * 0.28, left: 0, right: 0, backgroundColor: 'rgba(7,3,18,0.55)' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  titleLetter: {
    fontSize: Math.min(W * 0.12, 54),
    fontWeight: '800',
    letterSpacing: -1,
    textShadowColor: 'rgba(168,85,247,0.65)',
    textShadowRadius: 22,
    textShadowOffset: { width: 0, height: 0 },
  },
  tagline: { marginTop: 12, fontSize: 16, fontWeight: '400', color: 'rgba(255,255,255,0.82)', letterSpacing: 0.4, textAlign: 'center' },
});
