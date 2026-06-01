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
        };
        Returns: Database["public"]["Tables"]["pins"]["Row"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
