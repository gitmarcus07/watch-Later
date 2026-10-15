import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { FadeInView } from '@/components/common/FadeInView';
import { IconButton } from '@/components/buttons/IconButton';
import { GenreCard } from '@/components/genres/GenreCard';
import { GENRES, type GenreEntry } from '@/features/genres/catalog';
import { spacing } from '@/theme';

/**
 * The genre grid: each genre is a themed gradient card — its own hue, name
 * top-left — two per row, alphabetical, with a staggered entrance.
 */
export default function GenresScreen() {
  const router = useRouter();
  const openGenre = (genre: GenreEntry) => {
    router.push({ pathname: '/genre/[id]', params: { id: String(genre.id) } } as never);
  };
  return (
    <Screen>
      <FadeInView>
        <View style={styles.header}>
          <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
          <View style={styles.title}>
            <AppText variant="heading1">Genres</AppText>
            <AppText variant="caption" muted>Movies, shows, and anime — pick a vibe</AppText>
          </View>
        </View>
      </FadeInView>
      <FlatList
        data={GENRES}
        keyExtractor={(entry) => entry.slug}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        style={styles.flat}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <FadeInView delay={Math.min(index, 8) * 40} style={styles.cell}>
            <GenreCard
              name={item.name}
              gradient={item.gradient}
              style={styles.fill}
              onPress={() => openGenre(item)}
            />
          </FadeInView>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { flex: 1, gap: spacing.xs },
  flat: { flex: 1 },
  grid: { paddingBottom: spacing['2xl'], gap: spacing.sm },
  row: { gap: spacing.sm },
  cell: { flex: 1 },
  fill: { flex: 1 },
});
