import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export interface Database {
  public: {
    Tables: {
      library_media: Table<CloudMediaRow>;
      watchlist_entries: Table<CloudStateRow & { added_at: string }>;
      movie_watches: Table<CloudStateRow & { watched_at: string | null }>;
      tracked_series: Table<CloudStateRow & { tracking_started_at: string }>;
      episode_watches: Table<CloudEpisodeRow>;
      profiles: Table<{ id: string; created_at: string; updated_at: string }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row> = { Row: Row; Insert: Row; Update: Partial<Row>; Relationships: [] };
type CloudMediaRow = { user_id: string; provider: string; media_type: string; provider_id: string; title: string; original_title: string | null; overview: string | null; poster_url: string | null; backdrop_url: string | null; release_date: string | null; year: number | null; genres: Json; number_of_seasons: number | null; number_of_episodes: number | null; season_summaries: Json; episode_metadata: string; updated_at: string };
type CloudStateRow = { user_id: string; provider: string; media_type: string; provider_id: string; is_deleted: boolean; updated_at: string };
type CloudEpisodeRow = { user_id: string; provider: string; episode_provider_id: string; series_provider: string; series_media_type: string; series_provider_id: string; season_number: number; episode_number: number; title: string; overview: string | null; air_date: string | null; still_url: string | null; runtime_minutes: number | null; watched_at: string | null; is_deleted: boolean; updated_at: string };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
