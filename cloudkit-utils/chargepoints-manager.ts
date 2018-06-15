import {CloudKitService} from "../cloudkit/cloudkit.service";
import {GoingElectricFetcher} from "../GE/GoingElectricFetcher";
import {OCMService} from "../OCM/ocm.service";

export interface ChargepointsManagerOptions {
  dryRun: boolean;
  limit?: number;
  verbose: boolean;
}

export class ChargepointsManager {

  protected goingElectricFetcher: GoingElectricFetcher;
  protected cloudKitService: CloudKitService;
  protected ocmService: OCMService;

  constructor(private options: ChargepointsManagerOptions) {
    this.cloudKitService = new CloudKitService();
    this.ocmService = new OCMService();

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

    if (this.options.verbose) {
      console.error(`CloudKit [${process.env.CLOUDKIT_ENV}] Login OK, userRecordName: ${userInfo.userRecordName}`);
    }

  }

}
