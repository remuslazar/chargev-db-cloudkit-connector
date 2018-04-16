import {CKRecord} from "../cloudkit/cloudkit.types";

export enum ChargeEventSource {
  cloudKit = 0,
  goingElectric = 1,
}

export const allSourcesOtherThanChargEVSource = [
    ChargeEventSource.goingElectric,
];

export interface ChargeEvent {
  source: ChargeEventSource;
  timestamp: Date;
  chargepoint: string; // e.g. chargepoint-0-3358
  comment: string;
  nickname?: string;
  userID?: string;
}

export interface CheckIn extends ChargeEvent {
  reason: number;
  plug?: string;
}

export interface CKCheckIn extends CheckIn, CKRecord {}

export interface Ladelog extends ChargeEvent {
  modified: Date;
  isFault: boolean;
}
