export interface JikanEpisodeDto {
  mal_id?: number | null;
  title?: string | null;
  episode?: string | number | null;
  aired?: string | null;
  synopsis?: string | null;
  filler?: boolean | null;
  recap?: boolean | null;
}

export interface JikanEpisodesResponse {
  pagination?: { last_visible_page?: number | null; has_next_page?: boolean | null } | null;
  data?: JikanEpisodeDto[] | null;
}
