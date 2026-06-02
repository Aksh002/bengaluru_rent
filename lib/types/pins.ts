export type OccupantType = "family" | "bachelor" | "any";
export type Furnishing = "furnished" | "semi" | "unfurnished";

export type PublicPin = {
  id: string;
  lat: number;
  lng: number;
  bhk: number;
  report_count: number;
  rating_avg?: number | null;
  rating_count?: number;
  has_listing: boolean;
  is_owner?: boolean;
  rent: number;
  furnished: boolean;
  furnishing: Furnishing;
  gated: boolean;
  society_name: string | null;
  occupant_type: OccupantType;
  deposit_months: number | null;
  neighbourhood: string | null;
  created_at: string;
  comment: string | null;
  comment_approved: boolean | null;
};

export type PinComment = {
  id: string;
  pin_id: string;
  body: string;
  comment_approved: boolean | null;
  created_at: string;
};

export type AreaRentStat = {
  name: string;
  count: number;
  median_by_bhk: Array<{
    bhk: number;
    median_rent: number;
  }>;
};

export type PinFilters = {
  availableOnly: boolean;
  bhk: number | null;
  furnishing: Furnishing | "any";
  gated: boolean | null;
  occupantType: OccupantType | "all";
  minRent: number | null;
  maxRent: number | null;
};

export const defaultPinFilters: PinFilters = {
  availableOnly: false,
  bhk: null,
  furnishing: "any",
  gated: null,
  occupantType: "all",
  minRent: null,
  maxRent: null,
};
