import {CloudKitService} from "../cloudkit/cloudkit.service";
import {GoingElectricFetcher} from "../GE/GoingElectricFetcher";
import {OCMService} from "../OCM/ocm.service";
import {FilterLike, QueryFilterComparator, QueryResponse, RecordReceived} from "tsl-apple-cloudkit";

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

  private async processChargepoints(handler: (chargepoint: any) => void) {

    let soFar = 0;

    async function processResponse(response: QueryResponse) {
      soFar += response.records.length;
      for (let index=0; index < response.records.length; index++) {
        await handler(response.records[index]);
      }
    }

    // older then 7 days
    const timestamp = new Date().getTime() - 7 * 24 * 3600 * 1000;

    const filter: FilterLike[] = [];

    // filter.push({
    //   fieldName: 'referencesUpdatedAt',
    //   comparator: QueryFilterComparator.LESS_THAN,
    //   fieldValue: <any>{value: timestamp},
    // });

    // filter.push({
    //   fieldName: 'referencesUpdatedAt',
    //   comparator: QueryFilterComparator.LESS_THAN,
    //   fieldValue: <any>{value: 1},
    // });

    let response = await this.cloudKitService.getPublicDatabase().performQuery(
        { recordType: 'Chargepoints', filterBy: filter },
        {resultsLimit: this.options.limit});
    if (response.hasErrors) {
      throw new Error(response.errors[0].toString());
    }

    await processResponse(response);

    while (response.moreComing && (!this.options.limit || soFar < this.options.limit)) {
      response = await this.cloudKitService.getPublicDatabase().performQuery(response);
      await processResponse(response);
    }

  }

  /**
   * Loop through all Chargepoints records in CloudKit and populate the references field accordingly
   *
   * @returns {Promise<void>}
   */
  async populateReferencesField() {

    const updatedChargepoints: any[] = [];

    await this.processChargepoints(async (chargepoint: any) => {
      console.log(`[${chargepoint.recordName}] Chargepoint: ${chargepoint.fields.name.value} [modified: ${new Date(chargepoint.modified.timestamp)}]`);

      // const references = chargepoint.fields.references ? chargepoint.fields.references.value : [];

      const references: string[] = [];
      references.push(chargepoint.recordName);

      // try to match an existing OCM chargepoint

      if (chargepoint.recordName.match(/^chargepoint-0/)) {
        // GoingElectric Chargepoint originally
        const ocmChargepoints: any[] = await this.ocmService.getList({
          longitude: chargepoint.fields.location.value.longitude,
          latitude: chargepoint.fields.location.value.latitude,
          distanceunit: 'KM',
          distance: 0.025, // near-by 25m
        });
        if (ocmChargepoints.length === 0) {
          console.log(`OCM: no match`);
        } else {
          ocmChargepoints.forEach(ocmChargepoint => {
            references.push(`chargepoint-1-${ocmChargepoint.id}`);
            console.log(`OCM: found chargepoint ${ocmChargepoint.operatorsReference}`);
          });
        }
      }
      else if (chargepoint.recordName.match(/^chargepoint-1/)) {
        // OCM Chargepoint originally

      }

      if (!this.options.dryRun) {
        chargepoint.fields['references'] = { value: references };
        updatedChargepoints.push(chargepoint);
      }

    });

    // persist changes
    if (updatedChargepoints.length > 0) {
      if (!this.options.dryRun) {
        await this.cloudKitService.saveRecords(updatedChargepoints);
      }
    }

  }

}
