export type MediaKind = 'Movie' | 'Series' | 'Anime';

export interface PreviewMedia {
  id: string;
  title: string;
  subtitle: string;
  kind: MediaKind;
  year: string;
  rating: string;
  palette: readonly [string, string];
}

// UI-only preview content. This data is never written to a repository or database.
export const mockMedia: PreviewMedia[] = [
  { id: 'dune-part-two', title: 'Dune: Part Two', subtitle: 'Sci-fi · 2024', kind: 'Movie', year: '2024', rating: '8.5', palette: ['#B98256', '#422F3E'] },
  { id: 'blue-eye-samurai', title: 'Blue Eye Samurai', subtitle: 'Season 1 · 8 episodes', kind: 'Series', year: '2023', rating: '8.7', palette: ['#46758A', '#182C46'] },
  { id: 'one-piece', title: 'One Piece', subtitle: 'Season 1 · 1151 episodes', kind: 'Anime', year: '1999', rating: '8.9', palette: ['#4A8F9E', '#213952'] },
  { id: 'poor-things', title: 'Poor Things', subtitle: 'Fantasy · 2023', kind: 'Movie', year: '2023', rating: '7.8', palette: ['#5B8F8A', '#373052'] },
  { id: 'the-bear', title: 'The Bear', subtitle: 'Season 3 · 10 episodes', kind: 'Series', year: '2024', rating: '8.6', palette: ['#B67A4A', '#39272C'] },
];

export const mockContinue = {
  media: mockMedia[1],
  episode: 'Season 1 · Episode 6',
  progress: 0.72,
};
