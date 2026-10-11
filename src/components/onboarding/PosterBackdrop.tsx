/**
 * Shared animated backdrop for onboarding screens.
 *
 * Full-bleed drifting marquee rows of catalog posters (movies, shows, anime)
 * under soft legibility scrims. Rows cover the screen top to bottom in
 * alternating directions, so the backdrop never leaves an empty band.
 * Artwork is instant bundled TMDb art; any failed tile degrades to a
 * gradient tile, so the backdrop can never look broken.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: W, height: H } = Dimensions.get('window');

const TILE_W = 96;
const TILE_H = 140;
const TILE_GAP = 10;
const ROW_GAP = 12;
const TILE_STRIDE = TILE_W + TILE_GAP;
const MIN_TILES = Math.max(6, Math.ceil(((W * 1.5) / TILE_STRIDE)));
const ROW_COUNT = Math.max(3, Math.ceil(H / (TILE_H + ROW_GAP)) + 1);

const w342 = (path: string) => `https://image.tmdb.org/t/p/w342${path}`;

const MOVIES = [
  '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
  '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  '/74xTEgt7R36Fpooo50r9T25onhq.jpg',
  '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
  '/or06FN3Dka5tukK1e9sl16pB3iy.jpg',
  '/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg',
  '/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg',
].map(w342);

const SHOWS = [
  '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  '/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
  '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
  '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg',
  '/uJUtYWEhaB9XbzKQEG6y5ZjS3Rl.jpg',
  '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
].map(w342);

const ANIME = [
  '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
  '/q719jXXEzOoYaps6babgKnONONX.jpg',
  '/5KlRFKKSbyCiyYpZSS3A6G5bW0K.jpg',
  '/dM2w364MScsjFf8pfMbaWUcWrR.jpg',
  '/yFHHfHcUgGAxziP1C3lLt0q2T4s.jpg',
  '/reEMJA1uzscCbkpeRJeTT2bjqUp.jpg',
].map(w342);

export const BACKDROP_ROWS = [MOVIES, SHOWS, ANIME];

function PosterTile({ uri }: { uri: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <LinearGradient
        colors={['#2A1650', '#170B33']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tile}
      >
        <Ionicons name="film-outline" size={22} color="rgba(255,255,255,0.35)" />
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

const DURATIONS = [26000, 32000, 29000, 34000, 27000, 33000];

export function PosterBackdrop({ rowCount = 3, opacity = 0.5 }: { rowCount?: 2 | 3; opacity?: number }) {
  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // Fill the screen top to bottom, cycling the bundled categories so rows
  // never repeat the same posters back to back. rowCount sets the minimum.
  const rows = useMemo(() => {
    const total = Math.max(rowCount, ROW_COUNT);
    return Array.from({ length: total }, (_, index) => BACKDROP_ROWS[index % BACKDROP_ROWS.length]);
  }, [rowCount]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#070312', '#1E0A44', '#3B0764']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.marquee, fadeStyle]}>
        {rows.map((uris, index) => (
          <MarqueeRow key={index} uris={uris} duration={DURATIONS[index % DURATIONS.length]} reverse={index % 2 === 1} opacity={Math.max(0.18, opacity - (index % 3) * 0.06)} />
        ))}
      </Animated.View>
      <LinearGradient colors={['rgba(7,3,18,0.9)', 'rgba(7,3,18,0.25)']} style={styles.topScrim} />
      <LinearGradient colors={['rgba(7,3,18,0.3)', 'rgba(7,3,18,0.94)']} style={styles.bottomScrim} />
      <View style={styles.centerScrim} />
    </View>
  );
}

const styles = StyleSheet.create({
  marquee: { position: 'absolute', top: -TILE_H, bottom: -TILE_H, left: -TILE_W, right: -TILE_W, gap: ROW_GAP, transform: [{ rotate: '-4deg' }], justifyContent: 'center' },
  rowClip: { height: TILE_H, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: TILE_GAP, height: TILE_H },
  tile: { width: TILE_W, height: TILE_H, borderRadius: 10, backgroundColor: '#170B33', alignItems: 'center', justifyContent: 'center' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: H * 0.3 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.4 },
  centerScrim: { position: 'absolute', top: H * 0.3, bottom: H * 0.26, left: 0, right: 0, backgroundColor: 'rgba(7,3,18,0.55)' },
});
