import request = require('request-promise');
import {UriOptions} from "request";
import {RequestPromiseOptions} from "request-promise";
import {ChargeEvent, ChargeEventSource, CheckIn, CKCheckIn, Ladelog} from "./chargeevent.types";
import {CKTimestamp} from "../cloudkit/cloudkit.types";

export class ChargeEventRecord implements ChargeEvent {
  chargepoint: string;
  comment: string;
  nickname: string;
  source: ChargeEventSource;
  timestamp: Date;
  userID: string;

  constructor(json: any) {
    this.chargepoint = json.chargepoint;
    this.comment = json.comment;
    this.nickname = json.nickname;
    this.source = json.source;
    this.timestamp = new Date(json.timestamp);
    this.userID = json.userID;
  }

  /**
   * Creates a new appropriate ChargeEventRecord subclass instance from the JSON data
   * This logic uses the __t field to determine the ChargeEvent derived class to instantiate
   *
   * @param json
   */
  static from(json: any): ChargeEventRecord {
    switch(json.__t) {
      case 'CheckIn': return new CheckInRecord(json);
      case 'CKCheckIn': return new CKCheckInRecord(json);
      case 'Ladelog': return new LadelogRecord(json);
      default:
        throw new Error(`ChargeEvent of type: ${json.__t} not implemented yet.`);
    }
  }
}

export class CheckInRecord extends ChargeEventRecord implements CheckIn {
  reason: number;
  plug: string;
  constructor(json: any) {
    super(json);
    this.reason = json.reason;
    this.plug = json.plug;
  }
  public toString() {
    return `CheckIn [reason-code=${this.reason}] for ${this.chargepoint} timestamp ${this.timestamp}`;
  }
}

export class CKCheckInRecord extends CheckInRecord implements CKCheckIn {
  created: CKTimestamp;
  deleted: boolean;
  modified: CKTimestamp;
  recordChangeTag: string;
  recordName: string;

  constructor(json: any) {
    super(json);
    this.created = json.created;
    this.modified = json.modified;
    this.deleted = json.deleted;
    this.recordChangeTag = json.recordChangeTag;
    this.recordName = json.recordName;
  }
}
export class LadelogRecord extends ChargeEventRecord implements Ladelog {
  isFault: boolean;
  modified: Date;
  constructor(json: any) {
    super(json);
    this.isFault = json.isFault;
    this.modified = new Date(json.modified);
  }
  public toString() {
    return `GE Ladelog [isFault=${this.isFault}] for ${this.chargepoint} timestamp ${this.timestamp}`;
  }
}

export interface GetEventsResponse {
  success: boolean;
  totalCount: number;
  moreComing: boolean;
  startToken?: number;
  changeToken: string;
  events: ChargeEventRecord[];
}

export class ChargevDBAPIService {

  constructor(private url: string, private jwtToken: string) { }

  /**
   * Performs a single request and fetch a list of records
   *
   * @param {GetEventsResponse} oldResponse
   * @param {string} changeToken
   * @returns {Promise<GetEventsResponse>}
   */
  public async getEvents(oldResponse: GetEventsResponse|null, changeToken: string|null): Promise<GetEventsResponse> {

    const params = {
      'change-token': changeToken,
      'start-token': oldResponse ? oldResponse.startToken : undefined,
    };

    const response = await this.apiRequest('events', params) as GetEventsResponse;

    response.events = response.events.map(chargeEventData => {
      return ChargeEventRecord.from(chargeEventData)
    });

    return response;
  }

  /**
   * Performs multiple calls to fetch all records in batches
   *
   * @param {string} changeToken
   * @param cb Callback, called for each batch of records
   * @returns {Promise<null>}
   */
  public async getAllEvents(changeToken: string|null, cb: ((events: ChargeEventRecord[]) => void)): Promise<undefined> {
    let response = await this.getEvents(null, changeToken);
    cb(response.events);

    while (response.moreComing) {
      response = await this.getEvents(response, changeToken);
      cb(response.events);
    }

    return;
  }

  /**
   * Performs an API call
   *
   * @param {string} endpoint
   * @param params query Params
   * @param payload POST Payload
   * @param {request.UriOptions & requestPromise.RequestPromiseOptions} options
   *
   * @returns {Promise<any>}
   */
  protected async apiRequest(endpoint: string, params: any = {}, payload: any = null, options: UriOptions & RequestPromiseOptions = { uri: '' }): Promise<any> {

    if (payload !== null) {
      options.body = payload;
      options.method = 'POST';
    }

    options.uri = this.url + '/' + endpoint;
    options.json = true;
    options.qs = params;

    options.headers = {
      Authorization: 'Bearer ' + this.jwtToken,
    };

    return await request(options)
  }
}