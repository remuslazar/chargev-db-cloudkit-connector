import request = require('request-promise');
import {Chargelocation} from './api.interface';
import hasher = require('node-object-hash');

export interface ChargelocationsResponse {
  status: string;
  startkey?: number;
  chargelocations: Chargelocation[];
}

export interface GoingElectricParams {
  // key: string;
  lat?: number;
  lng?: number;
  radius?: number;

  sw_lat?: number;
  sw_lng?: number;
  ne_lat?: number;
  ne_lng?: number;

  plugs?: string[];
  countries?: string[];
  min_power?: number;
  freecharging?: boolean;
  freeparking?: boolean;
  open_twentyfourseven?: boolean;
  open_now?: boolean;
  open_day?: number;
  open_time?: number;

  verified?: boolean;
  exclude_faults?: boolean;
  orderby?: 'distance' | 'power';

  barrierfree?: boolean;
  networks?: number[];
  chargecards?: number[];

  startkey?: number;

  clustering?: boolean;
  zoom?: number; // 0..21
  cluster_distance?: number;

  ge_id?: string; // up to 10 ge_id, comma separated
  result_details?: 'minimal';
}

export interface Chargecard {
  card_id: number;
  name: string;
  url: string;
}

const GE_API_URL = 'https://api.goingelectric.de/chargepoints/';

/** if set the logic will use the UPSTREAM_API_AVG_DELAY_MS constant to wait this value on average */
const USE_RANDOM_DELAY = false;
/** number of milliseconds to wait between upstream API requests */
const UPSTREAM_API_DELAY_MS = 150;

// use 150ms delay between requests => rate is 6.7 requests per second

const timeout = (ms: number) => new Promise(res => setTimeout(res, ms));

const delayAfterRequest = async (delay: number) => {
  await timeout(USE_RANDOM_DELAY ? Math.random() * delay * 2.0 : delay);
};

export class GoingElectricFetcher {

  private static addHashToChargelocation(chargelocation: Chargelocation) {
    chargelocation._hashValue = hasher().hash(chargelocation);
  }

  private static addHashToChargelocationsResponse(input: ChargelocationsResponse) {
    input.chargelocations.forEach(GoingElectricFetcher.addHashToChargelocation);
  }

  private static cleanupChargelocationsResponse(input: ChargelocationsResponse) {
    input.chargelocations.forEach(chargelocation => {
      if ((chargelocation.fault_report as any) === false) { chargelocation.fault_report = undefined; }
      if ((chargelocation.network as any) === false) { chargelocation.network = undefined; }
      if (chargelocation.openinghours && (chargelocation.openinghours.description as any) === false) { chargelocation.openinghours.description = undefined; }
      if (chargelocation.cost && (chargelocation.cost.description_long as any) === false) { chargelocation.cost.description_long = undefined; }
      if (chargelocation.cost && (chargelocation.cost.description_short as any) === false) { chargelocation.cost.description_short= undefined; }
      if ((chargelocation.general_information as any) === false) { chargelocation.general_information = undefined; }
      if ((chargelocation.location_description as any) === false) { chargelocation.location_description = undefined; }
      if ((chargelocation.ladeweile as any) === false) { chargelocation.ladeweile = undefined; }
    });
  }

  protected apiURL: string;

  constructor(private apiKey: string, private useDelay = false, apiURL?: string) {
    this.apiURL = apiURL || GE_API_URL;
    console.log(`GoingElectricFetcher initialized with URL: ${this.apiURL}`);
  }

  async fetchChargepoints(ge_ids: number[]): Promise<Chargelocation[]> {
    const response = await this.apiRequest({
      ge_id: ge_ids.join(','),
    }) as ChargelocationsResponse;

    if (response.status !== "ok") {
      throw new Error(`Got response status: ${response.status}`);
    }

    GoingElectricFetcher.cleanupChargelocationsResponse(response);
    GoingElectricFetcher.addHashToChargelocationsResponse(response);
    return response.chargelocations as Chargelocation[];
  }

  // noinspection JSUnusedGlobalSymbols
  async fetchChargepointList(radius: number, startkey?: number): Promise<ChargelocationsResponse> {

    const response = await this.apiRequest({
      startkey: startkey,
      lat: 48,
      lng: 9,
      radius: radius,
    });

    GoingElectricFetcher.cleanupChargelocationsResponse(response);
    GoingElectricFetcher.addHashToChargelocationsResponse(response);
    return response;
  }

  // noinspection JSUnusedGlobalSymbols
  async fetchPlugList(): Promise<string[]> {
    const result =  await this.apiRequest({}, 'pluglist');
    return result.result;
  }

  // noinspection JSUnusedGlobalSymbols
  async fetchNetworklist(): Promise<string[]> {
    const result = await this.apiRequest({},'networklist');
    return result.result;
  }

  // noinspection JSUnusedGlobalSymbols
  async fetchPhotoURL(params: any): Promise<string> {
    params.key = this.apiKey;
    const response = await request({
      url: this.apiURL + 'photo/',
      qs: params,
      followRedirect: false,
      resolveWithFullResponse: true,
      simple: false,
    });
    console.log(response);
    if (response.statusCode === 302) {
      return response.headers['location'] as string;
    } else {
      throw new Error('cannot get URL for image');
    }
  }

  // noinspection JSUnusedGlobalSymbols
  async fetchChargecardList(): Promise<Chargecard[]> {
    const result = await this.apiRequest({}, 'chargecardlist');
    return result.result.map(($0: any) => $0 as Chargecard);
  }

  private lastRequestTimestamp?: number;
  public requestCount = 0;

  private async apiRequest(params: GoingElectricParams, endpoint=''): Promise<any> {
    let qs: any = params;
    qs['key'] = this.apiKey;

    const now = Date.now();
    if (this.useDelay && this.lastRequestTimestamp) {
      const elapsed = now - this.lastRequestTimestamp;
      if (elapsed < UPSTREAM_API_DELAY_MS) {
        const remaining = UPSTREAM_API_DELAY_MS - elapsed;
        await delayAfterRequest(remaining);
      }
    }

    this.lastRequestTimestamp = now;

    this.requestCount++;
    return await request({
      url: this.apiURL + (endpoint ? endpoint + '/' : ''),
      qs: qs,
      json: true, // Automatically parses the JSON string in the response
    })
  }

}
