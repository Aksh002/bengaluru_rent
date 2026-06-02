export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ip_bans: {
        Row: {
          ip_hash: string;
          reason: string | null;
          banned_at: string;
        };
        Insert: {
          ip_hash: string;
          reason?: string | null;
          banned_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ip_bans"]["Row"]>;
        Relationships: [];
      };
      pins: {
        Row: {
          id: string;
          geom: unknown;
          lat: number;
          lng: number;
          bhk: number;
          rent: number;
          furnished: boolean;
          furnishing: "furnished" | "semi" | "unfurnished";
          gated: boolean;
          society_name: string | null;
          occupant_type: "family" | "bachelor" | "any";
          deposit_months: number | null;
          comment: string | null;
          comment_approved: boolean | null;
          session_id: string;
          ip_hash: string;
          report_count: number;
          is_hidden: boolean;
          is_suspicious: boolean;
          neighbourhood: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["pins"]["Row"]> & {
          lat: number;
          lng: number;
          bhk: number;
          rent: number;
          session_id: string;
          ip_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["pins"]["Row"]>;
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          pin_id: string;
          listing_type: "whole_flat" | "room";
          rent_per_room: number | null;
          available_from: "asap" | "next_month" | "flex";
          owner_email: string;
          owner_phone: string | null;
          owner_email_hash: string | null;
          gender_pref: "male" | "female" | "any";
          smoking_ok: boolean | null;
          food_pref: "veg" | "nonveg" | "any";
          parking_spots: number;
          is_active: boolean;
          session_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["listings"]["Row"]> & {
          pin_id: string;
          listing_type: "whole_flat" | "room";
          owner_email: string;
          session_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "listings_pin_id_fkey";
            columns: ["pin_id"];
            referencedRelation: "pins";
            referencedColumns: ["id"];
          },
        ];
      };
      seekers: {
        Row: {
          id: string;
          geom: unknown;
          looking_for: "whole_flat" | "room" | "any";
          budget_min: number;
          budget_max: number;
          bhk_pref: number | null;
          radius_km: number;
          email: string;
          email_hash: string | null;
          phone: string | null;
          gender: "male" | "female" | "other" | null;
          lifestyle_note: string | null;
          expires_at: string;
          is_active: boolean;
          session_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["seekers"]["Row"]> & {
          looking_for: "whole_flat" | "room" | "any";
          budget_max: number;
          email: string;
          session_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["seekers"]["Row"]>;
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          seeker_id: string;
          listing_id: string;
          match_score: number | null;
          matched_at: string;
          email_sent_at: string | null;
        };
        Insert: {
          seeker_id: string;
          listing_id: string;
          match_score?: number | null;
          matched_at?: string;
          email_sent_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["matches"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "matches_seeker_id_fkey";
            columns: ["seeker_id"];
            referencedRelation: "seekers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_listing_id_fkey";
            columns: ["listing_id"];
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          pin_id: string;
          reporter_ip_hash: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          pin_id: string;
          reporter_ip_hash: string;
          reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "reports_pin_id_fkey";
            columns: ["pin_id"];
            referencedRelation: "pins";
            referencedColumns: ["id"];
          },
        ];
      };
      ratings: {
        Row: {
          id: string;
          pin_id: string;
          rater_session_id: string;
          locality_score: number | null;
          build_quality: number | null;
          created_at: string;
        };
        Insert: {
          pin_id: string;
          rater_session_id: string;
          locality_score?: number | null;
          build_quality?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["ratings"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "ratings_pin_id_fkey";
            columns: ["pin_id"];
            referencedRelation: "pins";
            referencedColumns: ["id"];
          },
        ];
      };
      watchlist: {
        Row: {
          id: string;
          geom: unknown;
          email: string;
          phone: string | null;
          radius_km: number;
          bhk_pref: number | null;
          max_rent: number | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          email: string;
          phone?: string | null;
          radius_km?: number;
          bhk_pref?: number | null;
          max_rent?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["watchlist"]["Row"]>;
        Relationships: [];
      };
      newsletter: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["newsletter"]["Row"]>;
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          agent_type: "matching" | "moderation" | "email_loop";
          model: string;
          input_tokens: number | null;
          output_tokens: number | null;
          cost_usd: number | null;
          duration_ms: number | null;
          action_summary: Json | null;
          error: string | null;
          ran_at: string;
        };
        Insert: {
          agent_type: "matching" | "moderation" | "email_loop";
          model: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cost_usd?: number | null;
          duration_ms?: number | null;
          action_summary?: Json | null;
          error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["agent_runs"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_pin: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_bhk: number;
          p_rent: number;
          p_furnished: boolean;
          p_gated: boolean;
          p_society_name: string | null;
          p_occupant_type: "family" | "bachelor" | "any";
          p_deposit_months: number | null;
          p_comment: string | null;
          p_session_id: string;
          p_ip_hash: string;
          p_furnishing?: "furnished" | "semi" | "unfurnished";
          p_neighbourhood?: string | null;
        };
        Returns: Database["public"]["Tables"]["pins"]["Row"];
      };
      report_pin: {
        Args: {
          p_pin_id: string;
          p_reporter_ip_hash: string;
          p_reason: string | null;
        };
        Returns: void;
      };
      create_listing: {
        Args: {
          p_pin_id: string;
          p_listing_type: string;
          p_rent_per_room: number | null;
          p_available_from: string;
          p_owner_email: string;
          p_owner_phone: string | null;
          p_gender_pref: string;
          p_smoking_ok: boolean | null;
          p_food_pref: string;
          p_parking_spots: number;
          p_session_id: string;
          p_encryption_key: string;
        };
        Returns: string;
      };
      create_seeker: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_looking_for: string;
          p_budget_min: number;
          p_budget_max: number;
          p_bhk_pref: number | null;
          p_radius_km: number;
          p_email: string;
          p_phone: string;
          p_gender: string | null;
          p_lifestyle_note: string | null;
          p_session_id: string;
          p_encryption_key: string;
        };
        Returns: string;
      };
      find_candidates: {
        Args: {
          seeker_lat: number;
          seeker_lng: number;
          radius_km: number;
          budget_max: number;
        };
        Returns: Array<{
          id: string;
          pin_id: string;
          listing_type: string;
          rent_per_room: number | null;
          available_from: string;
          gender_pref: string;
          smoking_ok: boolean | null;
          food_pref: string;
          parking_spots: number;
          neighbourhood: string | null;
          bhk: number;
          rent: number;
          furnished: boolean;
          lat: number;
          lng: number;
        }>;
      };
      decrypt_field: {
        Args: {
          encrypted_value: string;
          encryption_key: string;
        };
        Returns: string | null;
      };
      encrypt_field: {
        Args: {
          plaintext: string;
          encryption_key: string;
        };
        Returns: string | null;
      };
      create_watchlist_entry: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_km: number;
          p_bhk_pref: number | null;
          p_max_rent: number | null;
          p_email: string;
          p_phone: string | null;
          p_encryption_key: string;
        };
        Returns: string;
      };
      get_watchlist_matches: {
        Args: {
          p_pin_id: string;
          p_bhk: number;
          p_rent: number;
        };
        Returns: Array<{
          id: string;
          email: string;
          phone: string | null;
        }>;
      };
      get_active_seekers_with_coords: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          lat: number;
          lng: number;
          looking_for: string;
          budget_min: number;
          budget_max: number;
          bhk_pref: number | null;
          radius_km: number;
          email: string;
          phone: string | null;
          gender: string | null;
          lifestyle_note: string | null;
          expires_at: string;
          is_active: boolean;
          session_id: string;
          created_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
