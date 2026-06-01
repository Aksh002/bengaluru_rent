export type OccupantType = "family" | "bachelor" | "any";

export type PublicPin = {
  id: string;
  lat: number;
  lng: number;
  bhk: number;
  rent: number;
  furnished: boolean;
  gated: boolean;
  society_name: string | null;
  occupant_type: OccupantType;
  neighbourhood: string | null;
  created_at: string;
  report_count: number;
  comment: string | null;
  comment_approved: boolean | null;
};
