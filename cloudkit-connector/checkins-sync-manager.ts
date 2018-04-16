import {CloudKitService} from "../cloudkit/cloudkit.service";
import {ChargevDBAPIService} from "../chargev-db/chargev-db";
import {ChargeEventSource} from "../chargev-db/chargeevent.types";

export interface CheckInsSyncManagerOptions {
  dryRun: boolean;
  limit?: number;
  verbose: boolean;
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

  async fetchNewEventsFromChargEVDBAndUploadToCloudKit() {
    let count = 0;
    await this.chargevService.getAllEvents(null, (events => {
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
