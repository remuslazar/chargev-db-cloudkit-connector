export interface Coordinates {
  lng: number;
  lat: number;
}

export interface Address {
  country: string;
  city: string;
  street: string;
  postcode: string;
}

export interface CostInfo {
  description_short?: string;
  description_long?: string
  freeparking: boolean;
  freecharging: boolean;
}

export interface FaultReport {
  created: number;
  description: string;
}

export interface Chargepoint {
  count: number;
  power: number;
  type: string;
}

export interface OpeningHours {
  '24/7': boolean;
  description?: string;
  // e.g. "sunday": "from 09:00 till 20:00"
  days: {
    [key: string]: string
  };
}

export interface Chargecard {
  id: number;
}

export interface Chargelocation {
  ge_id: number;
  name: string;
  address: Address;
  coordinates: Coordinates;
  chargepoints: Chargepoint[];
  network?: string;
  operator?: string;
  cost: CostInfo;
  fault_report?: FaultReport;
  verified: boolean;
  barrierfree: boolean;
  openinghours: OpeningHours;
  url: string;
  ladeweile?: string;
  location_description?: string;
  general_information?: string;
  photos: number[];
  chargecards: Chargecard[];
  _hashValue: string;
}
