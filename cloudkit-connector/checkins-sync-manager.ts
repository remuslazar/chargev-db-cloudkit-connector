import {CloudKitService} from "../cloudkit/cloudkit.service";
import {
  ChargeEventRecord,
  ChargevDBAPIService,
  CheckInRecord,
  LadelogRecord
} from "../chargev-db/chargev-db";
import {allSourcesOtherThanChargEVSource, ChargeEventSource} from "../chargev-db/chargeevent.types";
import * as CloudKit from "../cloudkit/vendor/cloudkit";
import {
  ChargepointInfo,
  ChargepointRef,
  CKChargePointRecord, CKCheckInFromLadelog,
  CKCheckInReason, CKCheckInRecord,
  EVPlugFinderRegistry, GEChargepoint
} from "./evplugfinder.model";
import {Chargelocation} from "../GE/api.interface";
import {GoingElectricFetcher} from "../GE/GoingElectricFetcher";

export interface CheckInsSyncManagerOptions {
  dryRun: boolean;
  limit?: number;
  verbose: boolean;
  /** instead of doing a delta-download or delta-upload, purge existing records and process everything from scratch */
  init: boolean;
}

export class CheckInsSyncManager {

  protected chargevService: ChargevDBAPIService;
  protected cloudKitService: CloudKitService;
  protected goingElectricFetcher: GoingElectricFetcher;

  constructor(private options: CheckInsSyncManagerOptions) {
    const CHARGEV_DB_API_URL = process.env.CHARGEV_DB_API_URL;
    const CHARGEV_DB_API_JWT = process.env.CHARGEV_DB_API_JWT;

    if (!CHARGEV_DB_API_URL || !CHARGEV_DB_API_JWT) {
      throw new Error(`CHARGEV_DB_API_URL and/or CHARGEV_DB_API_JWT not configured`);
    }

    this.chargevService = new ChargevDBAPIService(CHARGEV_DB_API_URL, CHARGEV_DB_API_JWT);
    this.cloudKitService = new CloudKitService();

    if (!process.env.GE_API_KEY) {
      throw new Error(`GE API Key not configured`);
    }

    this.goingElectricFetcher = new GoingElectricFetcher(<string>process.env.GE_API_KEY, true, process.env.GE_API_URL);
  }

  async init() {
    const userInfo = await this.cloudKitService.setup();

    if (!userInfo) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error(`setup CloudKit failed`);
    }

    console.error(`CloudKit [${process.env.CLOUDKIT_ENV}] Login OK, userRecordName: ${userInfo.userRecordName}`);
  }

  /**
   * Purge all existing records in CloudKit which originally were synchronized from upstream (chargEV DB)
   *
   * Useful for debugging or maintenance.
   *
   * @returns {Promise<void>}
   */
  protected async purgeCheckInsInCloudKitOriginallySynchronizedFromUpstream() {
    await this.cloudKitService.find({
      recordType: 'CheckIns',
      filterBy: [
        {
          systemFieldName: 'createdUserRecordName',
          comparator: CloudKit.QueryFilterComparator.EQUALS,
          fieldValue: {
            value: {
              recordName: this.cloudKitService.userRecordName,
            }
          }
        },
        {
          fieldName: "source",
          comparator: CloudKit.QueryFilterComparator.IN,
          fieldValue: {value: allSourcesOtherThanChargEVSource},
        }
      ],
    }, {desiredKeys: ['recordName']}, async (records: any[]) => {
      if (records.length > 0) {
        await this.cloudKitService.delete(records.map($0 => $0.recordName));
        console.log(`${records.length} record(s) deleted`);
      }
    });
  }

  private async getChargePointDetails(chargepointInfo: ChargepointInfo): Promise<Chargelocation> {

    if (chargepointInfo.registry !== EVPlugFinderRegistry.goingElectric) {
      throw new Error(`currently we support only the GoingElectric registry`);
    }

    const chargepoints = await this.goingElectricFetcher.fetchChargepoints([chargepointInfo.id]);
    if (!chargepoints || chargepoints.length === 0) {
      throw new Error(`could not fetch chargepoint details for going electric chargepoing with ge_id: ${chargepointInfo.id}`);
    }
    return chargepoints[0];
  }


  protected async createCheckInForChargeEvent(chargeEvent: ChargeEventRecord) {
    const chargepointRef = new ChargepointRef(chargeEvent.chargepoint);
    const chargepointInfo = new ChargepointInfo(chargepointRef);

    try {

      let ckCheckInToInsert: CKCheckInRecord;
      let ckChargePointToUpsert: CKChargePointRecord;

      const chargepointDetails: Chargelocation = await this.getChargePointDetails(chargepointInfo);
      const lastCheckIn = await this.cloudKitService.getLastCheckIn(chargepointRef);

      if (chargeEvent instanceof LadelogRecord) {
        ckCheckInToInsert = new CKCheckInFromLadelog(chargeEvent, chargepointDetails);
        ckChargePointToUpsert = new GEChargepoint(chargepointDetails, ckCheckInToInsert, lastCheckIn);
      } else if (chargeEvent instanceof CheckInRecord) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(`ChargeEvent of type 'CheckIn' not implemented yet.`);
      } else {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(`ChargeEvent of type '${chargeEvent.constructor.name}' not implemented yet.`);
      }

      // check if the lastCheckin is newer than the CheckIn we want to insert
      if (lastCheckIn && lastCheckIn.fields.timestamp && lastCheckIn.fields.timestamp.value >= ckCheckInToInsert.fields.timestamp.value) {
        console.log(`Last CheckIn for ${chargepointRef.value.recordName} is newer than the CheckIn we want to insert. Skipping..`);
        return;
      }

      // noinspection SuspiciousInstanceOfGuard
      if (chargeEvent instanceof LadelogRecord) {
        // Check if the last CheckIn is already positive and the new checkin we want to insert as well,
        // then do NOT insert the new checkIn to avoid multiple redundant entries.
        if (lastCheckIn && lastCheckIn.fields.source &&
            lastCheckIn.fields.source.value === ChargeEventSource.goingElectric &&
            lastCheckIn.fields.reason.value === CKCheckInReason.ok &&
            ckCheckInToInsert.fields.reason.value === CKCheckInReason.ok
        ) {
          console.log(`Warning: Last (GE) CheckIn for ${chargepointRef.value.recordName} is positive, NOT creating another positive CheckIn in this case.`);
          return;
        }
      }

      const existingCKChargePoint = await this.cloudKitService.getChargePoint(chargepointRef);

      if (existingCKChargePoint) {
        ckChargePointToUpsert.recordChangeTag = existingCKChargePoint.recordChangeTag;
      }

      if (this.options.dryRun) {
        console.log(`[DRY-RUN] will insert ${ckCheckInToInsert} for ${ckChargePointToUpsert}.`);
        return;
      }

      const result = await this.cloudKitService.saveRecords([ckCheckInToInsert, ckChargePointToUpsert]);

      if (this.options.verbose) {
        console.log(result.records);
      }

      console.log(`New ${ckCheckInToInsert} for ${ckChargePointToUpsert} created.`);

    } catch (err) {
      console.log(`ERROR: ${err.message}. CheckIn skipped.`)
    }
  }

  /**
   * This method will fetch the last change token saved in CloudKit. We will use this
   * changeToken to perform delta downloads from chargEV DB.
   *
   * @returns {Promise<void>}
   */
  protected async getChangeToken(): Promise<string|null> {
    let timestampOfLastInsertedRecord =
        await this.cloudKitService.getLastTimestampOfSynchronizedRecord(allSourcesOtherThanChargEVSource);

    if (this.options.verbose) {
      if (timestampOfLastInsertedRecord) {
        console.log(`Newest timestamp of synchronized CheckIn from local database in CloudKit: ${timestampOfLastInsertedRecord.toISOString()}`);
      }
    }

    return timestampOfLastInsertedRecord ? timestampOfLastInsertedRecord.valueOf().toString() : null;
  }

  async fetchNewEventsFromChargEVDBAndUploadToCloudKit() {

    if (this.options.init && !this.options.dryRun) {
      await this.purgeCheckInsInCloudKitOriginallySynchronizedFromUpstream();
    }

    const changeToken = this.options.dryRun ? null : await this.getChangeToken();

    if (changeToken) {
      console.log(`using change token: ${changeToken}`);
    }

    let count = 0;
    await this.chargevService.getAllEvents({changeToken: changeToken, limit: this.options.limit}, (async(events) => {
      const filteredEvents = events.filter($0 => $0.source !== ChargeEventSource.cloudKit);

      for (const event of filteredEvents) {
        // if (this.options.dryRun) {
        //   console.log(`[DRY RUN]: will process event: ${event}`);
        // } else {
        await this.createCheckInForChargeEvent(event);
        // }
        count++;
      }
    }));

    console.log(`Processed ${count} record(s).`);
  }

  public async printStats() {
    console.log(`Statistics: Total GoingElectric API calls: ${this.goingElectricFetcher.requestCount}`);
  }

}
