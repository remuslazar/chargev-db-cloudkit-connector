import {format} from "util";
import {CKLocation, CKRecord, CKRef, CKTimestamp} from "../cloudkit/cloudkit.types";
import {ChargeEventSource, Ladelog} from "../chargev-db/chargeevent.types";
import {Chargelocation} from "../GE/api.interface";
const goingElectricStrings = require('../strings/goingelectric');

const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();

export enum CKCheckInReason {
  // noinspection JSUnusedGlobalSymbols
  ok = 10,
  recovery = 11,

  // failed
  equipementProblem = 100, equipementProblemNew,
  notCompatible, notCompatibleNew,
  noChargingEquipement, noChargingEquipementNew,

  // other
  notFound = 200,
  dupplicate,
  positive,
  negative,
}

export interface CKRecordUpsert {
  recordName?: string;
  recordChangeTag?: string;
  deleted?: boolean
  created?: CKTimestamp;
  modified?: CKTimestamp;
}

export interface CKCheckInRecord extends CKRecordUpsert {
  fields: {
    chargepoint: CKRef;
    comment?: CKField<string>;
    location: CKField<CKLocation>;
    reason: CKField<CKCheckInReason>;
    plug?: CKField<string>;
    timestamp: CKField<Date>;
    modified: CKField<Date>;
    source?: CKField<ChargeEventSource>;
  };
}

export interface CKUserRecord extends CKRecord {
  fields: {
    nickname?: CKField<string>;
  }
}

export interface CKChargePointRecord extends CKRecordUpsert {
  fields: {
    chargePointHash: CKField<number>;
    location: CKField<CKLocation>;
    name: CKField<string>;
    reason: CKField<CKCheckInReason>;
    reasonDescription?: CKField<string>;
    timestamp: CKField<Date>;
    url: CKField<string>;
  };
}

class CKField<T> {
  value: T | number;
  constructor(value: T) {
    // noinspection SuspiciousInstanceOfGuard
    if (value instanceof Date) {
      this.value = value.getTime();
    } else {
      this.value = value;
    }
  }
}

export class ChargepointRef implements CKRef {
  value: {
    recordName: string;
    action?: string;
  };
  type: string;

  constructor(recordName: string) {
    this.value = {
      recordName: recordName,
      action: 'DELETE_SELF',
    };
    this.type = 'REFERENCE';
  }
}

export enum EVPlugFinderRegistry {
  // noinspection JSUnusedGlobalSymbols
  goingElectric = 0,
  openChargeMap = 1,
}

export class ChargepointInfo {

  public registry: EVPlugFinderRegistry;
  public id: number;

  constructor(ref: ChargepointRef) {
    const match = ref.value.recordName.match(/^chargepoint-(\d+)-(\d+)$/);
    if (!match || match.length !== 3) {
      throw new Error(`chargepoint identifier "${ref.value.recordName}" does not match expected format`)
    }
    this.registry = parseFloat(match[1]) as EVPlugFinderRegistry;
    this.id = parseFloat(match[2]);
  }
}

export class CKCheckInFromLadelog implements CKCheckInRecord {
  fields: {
    chargepoint: CKRef;
    comment?: CKField<string>;
    location: CKField<CKLocation>;
    reason: CKField<CKCheckInReason>;
    plug?: CKField<string>;
    timestamp: CKField<Date>;
    modified: CKField<Date>;
    source?: CKField<ChargeEventSource>;
  };
  recordType?: string;
  recordName: string;
  recordChangeTag?: string;
  deleted?: boolean;
  created?: CKTimestamp;
  modified?: CKTimestamp;

  constructor(ladelog: Ladelog, chargelocation: Chargelocation) {
    this.recordType = 'CheckIns';
    this.recordName = `chargev-db-${ladelog.id}`;
    this.fields = {
      source: new CKField(ChargeEventSource.goingElectric),
      chargepoint: new ChargepointRef(ladelog.chargepoint),
      timestamp: new CKField(ladelog.modified),
      modified: new CKField(ladelog.updatedAt),
      comment: new CKField(entities.decode(ladelog.comment)),
      reason: new CKField(ladelog.isFault ? CKCheckInReason.equipementProblem : CKCheckInReason.ok),
      location: new CKField(<CKLocation>{
        latitude: chargelocation.coordinates.lat,
        longitude: chargelocation.coordinates.lng,
      }),
    };

  }

  toString() {
    return `CheckIn [reason: ${this.fields.reason.value}, timestamp: ${new Date(this.fields.timestamp.value as number)}]`;
  }
}

export class GEChargepoint implements CKChargePointRecord {

  /**
   * Reason Code Description
   *
   * @param {CKCheckInReason} reason code
   * @returns {string} (non localized) description
   */
  private static getCheckInReasonDescription(reason: CKCheckInReason): string {
    const reasonCode = CKCheckInReason[reason];

    // reasonCode is e.g. "ok" or "recovery"
    if (reasonCode) {
      const description = goingElectricStrings.reasonDescription[reasonCode];
      if (description) {
        return description;
      }
    }

    return format(goingElectricStrings.reasonDescription.default, reason);
  }

  fields: {
    chargePointHash: CKField<number>;
    location: CKField<CKLocation>;
    name: CKField<string>;
    reason: CKField<CKCheckInReason>;
    reasonDescription?: CKField<string>;
    timestamp: CKField<Date>;
    url: CKField<string>;
  };
  recordType: string;
  recordName: string;
  recordChangeTag?: string;

  constructor(chargelocation: Chargelocation, checkIn: CKCheckInRecord, lastCheckIn?: CKCheckInRecord) {
    this.recordType = 'ChargePoints';
    this.recordName = (new ChargepointRef(checkIn.fields.chargepoint.value.recordName)).value.recordName;

    this.fields = {
      chargePointHash: new CKField(chargelocation.ge_id),
      location: new CKField(<CKLocation>{
        latitude: chargelocation.coordinates.lat,
        longitude: chargelocation.coordinates.lng,
      }),
      timestamp: checkIn.fields.timestamp,
      name: new CKField(entities.decode(chargelocation.name)),
      url: new CKField('http:' + chargelocation.url),
      reason: new CKField(checkIn.fields.reason.value),
      reasonDescription: new CKField(GEChargepoint.getCheckInReasonDescription(checkIn.fields.reason.value)),
    };

    // Recovery/initial fault handling
    // We want to increment the reasonCode if
    // a) this is the first checkin and this checkin is negative OR
    // b) we do have an older checkin and the new state differs from the old one (we have a transition).
    // c) additionally we don't want to increment the reasonCode if the checkIn is older than 3 days
    if (!lastCheckIn && this.fields.reason.value === CKCheckInReason.equipementProblem ||
        lastCheckIn && lastCheckIn.fields.reason.value !== checkIn.fields.reason.value
    ) {
      const now = (new Date()).getTime();
      if (this.fields.timestamp.value >= (now - 3 * 24 * 3600 * 1000)) { // not older than 3 days
        this.fields.reason.value++;
      }
    }

  }

  toString() {
    return `${this.recordName} "${this.fields.name.value}" [reason: ${this.fields.reason.value}]`;
  }
}
