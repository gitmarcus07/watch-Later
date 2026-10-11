export interface KitsuEpisodeDto {
  id?: string | number | null;
  attributes?: {
    number?: number | null;
    canonicalTitle?: string | null;
    titles?: { en_us?: string | null; en_jp?: string | null; ja_jp?: string | null } | null;
    synopsis?: string | null;
    airdate?: string | null;
    length?: number | null;
    thumbnail?: { original?: string | null } | null;
  } | null;
}

export interface KitsuEpisodesResponse {
  data?: KitsuEpisodeDto[] | null;
  meta?: { count?: number | null } | null;
}

export interface KitsuMappingsResponse {
  data?: ({ relationships?: { item?: { data?: { id?: string | number | null } | null } | null } | null } | null)[] | null;
}
