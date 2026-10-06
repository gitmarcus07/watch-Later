export const ANIME_SEARCH_QUERY = `
query SearchAnime($search: String!) {
  Page(page: 1, perPage: 20) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id title { romaji english native } description
      coverImage { large extraLarge } bannerImage
      startDate { year month day } season seasonYear format status
      episodes duration genres averageScore popularity
      studios(isMain: true) { nodes { name } }
    }
  }
}`;

export const ANIME_DETAIL_QUERY = `
query AnimeDetails($id: Int!) {
  Media(id: $id, type: ANIME) {
    id title { romaji english native } description
    coverImage { large extraLarge } bannerImage
    startDate { year month day } season seasonYear format status
    episodes duration genres averageScore popularity
    studios(isMain: true) { nodes { name } }
  }
}`;
