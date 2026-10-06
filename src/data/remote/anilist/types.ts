export interface AniListMediaDto {
  id: number;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  description?: string | null;
  coverImage?: { large?: string | null; extraLarge?: string | null } | null;
  bannerImage?: string | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  season?: string | null;
  seasonYear?: number | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  duration?: number | null;
  genres?: (string | null)[] | null;
  averageScore?: number | null;
  popularity?: number | null;
  studios?: { nodes?: ({ name?: string | null } | null)[] | null } | null;
}
export interface AniListResponse { data?: { Page?: { media?: (AniListMediaDto | null)[] | null } | null; Media?: AniListMediaDto | null }; errors?: { message?: string }[] }
