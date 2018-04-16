import {CloudKitService} from "../cloudkit/cloudkit.service";
import {ChargevDBAPIService} from "../chargev-db/chargev-db";
import {allSourcesOtherThanChargEVSource, ChargeEventSource} from "../chargev-db/chargeevent.types";
import * as CloudKit from "../cloudkit/vendor/cloudkit";

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

  constructor(private options: CheckInsSyncManagerOptions) {
    const CHARGEV_DB_API_URL = process.env.CHARGEV_DB_API_URL;
    const CHARGEV_DB_API_JWT = process.env.CHARGEV_DB_API_JWT;

    if (!CHARGEV_DB_API_URL || !CHARGEV_DB_API_JWT) {
      throw new Error(`CHARGEV_DB_API_URL and/or CHARGEV_DB_API_JWT not configured`);
    }

    this.chargevService = new ChargevDBAPIService(CHARGEV_DB_API_URL, CHARGEV_DB_API_JWT);
    this.cloudKitService = new CloudKitService();
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
      this.purgeCheckInsInCloudKitOriginallySynchronizedFromUpstream();
    }

    const changeToken = await this.getChangeToken();

    if (changeToken) {
      console.log(`using change token: ${changeToken}`);
    }

    let count = 0;
    await this.chargevService.getAllEvents({changeToken: changeToken, limit: this.options.limit}, (events => {
      events
          // filter out own records
          .filter($0 => $0.source !== ChargeEventSource.cloudKit)
          .forEach(event => {
            console.log(`processing event: ${event}`);
            count++;
          });
    }));

    console.log(`Processed ${count} record(s).`);
  }

}
