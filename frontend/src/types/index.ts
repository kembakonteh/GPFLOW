// ── Enums (mirror backend Python enums) ──────────────────────────────────────

export type TripDirection    = 'outbound' | 'inbound';
export type TripStatus       = 'draft' | 'open' | 'closed' | 'in_transit' | 'arrived' | 'completed';
export type PricingModel     = 'per_kg' | 'per_item' | 'flat';
export type BookingStatus    = 'confirmed' | 'received' | 'in_transit' | 'ready' | 'collected' | 'delivered' | 'held';
export type CollectionType   = 'self_collect' | 'operator_delivers';
export type PaymentStatus    = 'unpaid' | 'paid' | 'refunded';
export type OperatorTier     = 'starter' | 'regular' | 'pro';
export type OperatorStatus   = 'onboarding' | 'active' | 'suspended';
export type WeightUnit       = 'kg' | 'lbs';
export type PackageScanStatus = 'pending' | 'received' | 'delivered';

// ── Operator ─────────────────────────────────────────────────────────────────

export interface Operator {
  id:                   string;
  name:                 string;
  email:                string;
  phone:                string;
  business_name:        string;
  logo_url?:            string;
  country:              string;
  city:                 string;
  weight_unit:          WeightUnit;
  tier:                 OperatorTier;
  status:               OperatorStatus;
  onboarding_checklist: OnboardingChecklist;
  created_at:           string;
  updated_at:           string;
  // Mailing address
  mailing_address_line1?: string;
  mailing_address_line2?: string;
  mailing_city?:          string;
  mailing_state?:         string;
  mailing_zip?:           string;
  mailing_country?:       string;
  mailing_instructions?:  string;
}

export interface OnboardingChecklist {
  profile_complete:       boolean;
  first_trip_created:     boolean;
  first_booking_received: boolean;
  billing_setup:          boolean;
}

export interface OperatorStats {
  total_trips:           number;
  active_trips:          number;
  total_bookings:        number;
  bookings_this_month:   number;
  revenue_this_month:    number;
  currency:              string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token:  string;
  refresh_token: string;
  operator:      Operator;
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface RegisterRequest {
  name:          string;
  business_name: string;
  email:         string;
  phone:         string;
  password:      string;
  country:       string;
  city:          string;
  weight_unit?:  WeightUnit;
}

// ── Trip announcement ─────────────────────────────────────────────────────────

export interface TripAnnouncement {
  whatsapp_message: string;
  public_url:       string;
}

// ── Drop-off location ─────────────────────────────────────────────────────────

export interface DropoffLocation {
  id:            string;
  label:         string;
  address?:      string;
  city?:         string;
  state?:        string;
  display_order: number;
}

export interface DropoffLocationCreate {
  label:         string;
  address?:      string;
  city?:         string;
  state?:        string;
  display_order?: number;
}

// ── Trip ─────────────────────────────────────────────────────────────────────

export interface Trip {
  id:                  string;
  operator_id:         string;
  direction:           TripDirection;
  direction_badge:     string;
  origin_city:         string;
  origin_country:      string;
  destination_city:    string;
  destination_country: string;
  departure_date:      string;   // ISO date string
  cutoff_date:         string;
  status:              TripStatus;
  pricing_model:       PricingModel;
  rate_per_kg:         number;
  currency:            string;
  capacity_kg?:          number;
  accepted_item_types:   string[];
  customs_advisory?:     string;
  domestic_mailing_rate_per_lb?: number;
  public_slug:           string;
  view_count:            number;
  pickup_location?:      string;
  pickup_window?:        string;
  pickup_notes?:         string;
  arrived_at?:           string;
  arrival_notified_at?:  string;
  operator_name:         string;
  operator_business_name: string;
  booking_counts?: {
    total:      number;
    confirmed:  number;
    received:   number;
    in_transit: number;
    ready:      number;
    collected:  number;
    delivered:  number;
  };
  drop_off_locations?: DropoffLocation[];
  created_at: string;
  updated_at: string;
}

export interface TripCreate {
  direction:           TripDirection;
  origin_city:         string;
  origin_country:      string;
  destination_city:    string;
  destination_country: string;
  departure_date:      string;
  cutoff_date:         string;
  pricing_model:       PricingModel;
  rate_per_kg:         number;
  currency:            string;
  capacity_kg?:        number;
  accepted_item_types?: string[];
  customs_advisory?:   string;
}

export interface TripUpdate {
  status?:           TripStatus;
  pickup_location?:  string;
  pickup_window?:    string;
  pickup_notes?:     string;
}

export interface ArrivalRequest {
  pickup_location: string;
  pickup_window:   string;
  pickup_notes?:   string;
  collection_assignments: Array<{
    booking_id:      string;
    collection_type: CollectionType;
  }>;
}

// ── BookingPackage ────────────────────────────────────────────────────────────

export interface BookingPackage {
  id:                string;
  package_number:    number;
  description:       string | null;
  package_reference: string;
  weight_kg:         number | null;
  qr_code:           string | null;
  scan_status:       PackageScanStatus;
  scanned_at:        string | null;
}

// ── Booking ───────────────────────────────────────────────────────────────────

export interface Booking {
  id:               string;
  trip_id:          string;
  operator_id:      string;
  reference_number: string;
  sender_name:      string;
  sender_phone:     string;
  sender_email?:    string;
  recipient_name:   string;
  recipient_phone?: string;
  recipient_city:   string;
  item_description: string;
  quantity:         number;
  estimated_weight_kg:  number;
  confirmed_weight_kg?: number;
  estimated_cost_display?: string;
  confirmed_cost_display?: string;
  currency:         string;
  status:           BookingStatus;
  collection_type?: CollectionType;
  payment_status:   PaymentStatus;
  qr_label_generated:    boolean;
  qr_label_generated_at?: string;
  qr_label_url?:         string;
  last_scanned_at?: string;
  scan_count:       number;
  package_count:    number;
  packages:         BookingPackage[];
  // Delivery address
  delivery_address_line1?: string;
  delivery_address_line2?: string;
  delivery_city?:          string;
  delivery_state?:         string;
  delivery_zip?:           string;
  delivery_country?:       string;
  delivery_notes?:         string;
  mailing_fee_charged?:    number;
  total_cost_minor?:       number;
  total_cost_usd?:         number;
  trip_public_slug?:    string;
  trip_departure_date?: string;
  trip_direction?:      string;
  created_at: string;
  updated_at: string;
}

export interface WeighInRequest {
  confirmed_weight_kg: number;
  payment_status?:     PaymentStatus;
}

export interface StatusUpdate {
  status:           BookingStatus;
  collection_type?: CollectionType;
}

// ── Notification log ──────────────────────────────────────────────────────────

export interface NotificationLog {
  id:                   string;
  booking_id?:          string;
  trip_id?:             string;
  operator_id:          string;
  recipient_type:       string;
  phone_number:         string;
  template_name:        string;
  message_body?:        string;
  status:               string;
  whatsapp_message_id?: string;
  sent_at:              string;
  delivered_at?:        string;
  error_message?:       string;
}

// ── Public trip (no auth) ──────────────────────────────────────────────────────

export interface PublicTrip {
  id:                  string;
  direction:           TripDirection;
  direction_badge:     string;
  origin_city:         string;
  origin_country:      string;
  destination_city:    string;
  destination_country: string;
  departure_date:      string;
  cutoff_date:         string;
  status:              TripStatus;
  pricing_model:       PricingModel;
  rate_display:        string;   // e.g. '$3.62/lb'
  rate_per_kg:         number;
  currency:            string;
  capacity_kg?:          number;
  spots_remaining?:      number;
  accepted_item_types:   string[];
  customs_advisory?:     string;
  domestic_mailing_rate_per_lb?: number;
  public_slug:           string;
  view_count:          number;
  pickup_location?:    string;
  pickup_window?:      string;
  arrived_at?:         string;
  operator_name:       string;
  operator_business_name: string;
  operator_phone:      string;
  // Operator mailing address
  operator_mailing_address_line1?: string;
  operator_mailing_address_line2?: string;
  operator_mailing_city?:          string;
  operator_mailing_state?:         string;
  operator_mailing_zip?:           string;
  operator_mailing_country?:       string;
  operator_mailing_instructions?:  string;
  drop_off_locations?: DropoffLocation[];
}

// ── Tracking (public) ──────────────────────────────────────────────────────────

export interface StatusEvent {
  status:      string;
  label:       string;
  occurred_at: string | null;
}

export interface TripForTracking {
  direction:        string;
  origin_city:      string;
  destination_city: string;
  departure_date:   string;
  status:           string;
}

export interface BookingTracking {
  reference_number:  string;
  sender_first_name: string;
  recipient_city:    string;
  item_description:  string;
  status:            BookingStatus;
  status_label:      string;
  collection_type?:  CollectionType;
  pickup_location?:  string;
  pickup_window?:    string;
  trip:              TripForTracking;
  timeline:          StatusEvent[];
  last_scanned_at?:  string;
}

// ── Booking public creation ────────────────────────────────────────────────────

export interface BookingPublicCreate {
  trip_id:             string;
  sender_name:         string;
  sender_phone:        string;
  sender_email?:       string;
  recipient_name:      string;
  recipient_phone?:    string;
  recipient_city:      string;
  item_description:    string;
  quantity:            number;
  estimated_weight_kg: number;
}

export interface BookingPackagePublic {
  package_number:    number;
  package_reference: string;
  description:       string | null;
}

export interface BookingPublicResponse {
  id:                     string;
  reference_number:       string;
  trip_id:                string;
  status:                 string;
  estimated_cost_display?: string;
  currency:               string;
  sender_name:            string;
  recipient_name:         string;
  recipient_city:         string;
  item_description:       string;
  estimated_weight_kg:    number;
  package_count:          number;
  packages:               BookingPackagePublic[];
  // Delivery address (optional)
  delivery_address_line1?: string;
  delivery_address_line2?: string;
  delivery_city?:          string;
  delivery_state?:         string;
  delivery_zip?:           string;
  delivery_country?:       string;
  delivery_notes?:         string;
  mailing_fee_charged?:    number;
}
