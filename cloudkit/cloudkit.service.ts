import {cloudkitContainerConfig} from "./cloudkit.config";
import * as CloudKit from "./vendor/cloudkit";
import {CKRecordUpsert} from "./cloudkit.types";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export class CloudKitService {

  private container: any;
  private database: any;

  // currently logged in user (server-to-server)
  public userRecordName: string|null = null;

  async setup() {
    const fetch = require('node-fetch');

    //CloudKit configuration
    CloudKit.configure({
      services: {
        fetch: fetch,
        // logger: console,
      },
      containers: [ cloudkitContainerConfig ]
    });

    this.container = CloudKit.getDefaultContainer();
    this.database = this.container.publicCloudDatabase; // We'll only make calls to the public database.

    const userInfo = await this.container.setUpAuth();
    this.userRecordName = userInfo.userRecordName;
    return userInfo;
  };

  async saveRecords(records: CKRecordUpsert[]) {
    return this.database.saveRecords(records);
  };

  // noinspection JSUnusedGlobalSymbols
  async find(query: any, options: any, cb: any) {
    const limit = options.resultsLimit;
    let response = await this.database.performQuery(query, options);
    let totalCount = response.records.length;
    await cb(response.records);
    while (response.moreComing) {
      if (limit && totalCount >= limit) {
        break;
      }
      response = await this.database.performQuery(response);
      totalCount += response.records.length;
      await cb(response.records);
    }
  };

  // noinspection JSUnusedGlobalSymbols
  async get(recordNames: any[], options: any, cb: any) {
    try {
      let response = await this.database.fetchRecords(
          recordNames, options);
      await cb(response.records);
    } catch (error) {
      if (error.ckErrorCode === 'BAD_REQUEST' && recordNames.length >= 2) {
        // BadRequestException: array 'records' length is greater than max size
        const howMany = recordNames.length / 2;
        // split the records array in half and recurse
        const remaining = recordNames.splice(0, howMany);
        await this.get(recordNames, options, cb);
        await this.get(remaining, options, cb);
      } else {
        throw error;
      }
    }
  };

  // noinspection JSUnusedGlobalSymbols
  async delete(recordNames: any[]) {
    try {
      await this.database.deleteRecords(recordNames);
    } catch(error) {
      if (error.ckErrorCode === 'BAD_REQUEST' && recordNames.length >= 2) {
        // BadRequestException: array 'records' length is greater than max size
        const howMany = recordNames.length / 2;
        // split the records array in half and recurse
        const remaining = recordNames.splice(0, howMany);
        await this.delete(recordNames);
        await this.delete(remaining);
      } else {
        throw error;
      }
    }
  }
}
