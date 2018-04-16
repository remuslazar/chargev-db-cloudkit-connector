import request = require('request-promise');
import {UriOptions} from "request";
import {RequestPromiseOptions} from "request-promise";
import {ChargeEvent, ChargeEventSource, CheckIn, CloudKitCheckIn, Ladelog} from "./chargeevent.types";
import {CKTimestamp} from "../cloudkit/cloudkit.types";
import {StatusCodeError} from "request-promise/errors";

export class ChargeEventRecord implements ChargeEvent {
  id: string;
  updatedAt: Date;
  chargepoint: string;
  comment: string;
  nickname: string;
  source: ChargeEventSource;
  timestamp: Date;
  userID: string;

  constructor(json: any) {
    this.id = json.id;
    this.updatedAt = new Date(json.updatedAt);
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
      case 'CKCheckIn': return new CloudKitCheckInRecord(json);
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

export class CloudKitCheckInRecord extends CheckInRecord implements CloudKitCheckIn {
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

export interface GetEventsParams {
  limit?: number;
  startToken?: number|null;
  changeToken?: string|null;
  changedSince?: Date;
}

export interface PostEventsPayload {
  recordsToSave?: ChargeEvent[],
  recordIDsToDelete?: string[],
}

export interface PostEventsResponse {
  savedRecords: ChargeEventRecord[],
  deletedRecordCount: number,
}

export interface DeleteEventsResponse {
  deletedRecordCount: Number,
}

export class ChargevDBAPIService {

  constructor(private url: string, private jwtToken: string) { }

  /**
   * Performs a single request and fetch a list of records
   *
   * @param {GetEventsResponse} oldResponse
   * @param params
   * @returns {Promise<GetEventsResponse>}
   */
  public async getEvents(oldResponse: GetEventsResponse|null, params: GetEventsParams): Promise<GetEventsResponse> {

    const queryParams = {
      limit: params.limit,
      'change-token': params.changeToken,
      'start-token': oldResponse ? oldResponse.startToken : params.startToken,
      'changed-since': params.changedSince,
    };

    const response = await this.apiRequest('events', queryParams) as GetEventsResponse;

    response.events = response.events.map(chargeEventData => {
      return ChargeEventRecord.from(chargeEventData)
    });

    return response;
  }

  /**
   * Performs multiple calls to fetch all records in batches
   *
   * @param params
   * @param cb Callback, called for each batch of records
   * @returns {Promise<null>}
   */
  public async getAllEvents(params: GetEventsParams, cb: ((events: ChargeEventRecord[]) => Promise<void>)): Promise<undefined> {
    let response = await this.getEvents(null, params);
    await cb(response.events);

    let alreadyProcessedCount = response.events.length;

    while (response.moreComing && (!params.limit || alreadyProcessedCount < params.limit)) {
      response = await this.getEvents(response, params);
      alreadyProcessedCount += response.events.length;
      await cb(response.events);
    }

    return;
  }

  public async getLatest(): Promise<ChargeEventRecord|null> {
    try {
      const response = await this.apiRequest('events/latest');
      return ChargeEventRecord.from(response);
    } catch (err) {
      if (err instanceof StatusCodeError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  public async deleteAll(): Promise<DeleteEventsResponse> {
    const response = await this.apiRequest('events', {}, null, 'DELETE');
    return response as DeleteEventsResponse;
  }

  public async post(payload: PostEventsPayload): Promise<PostEventsResponse> {
    const response = await this.apiRequest('events', {}, payload) as PostEventsResponse;
    response.savedRecords = response.savedRecords.map($0 => ChargeEventRecord.from($0));
    return response;
  }

  /**
   * Performs an API call
   *
   * @param {string} endpoint
   * @param params query Params
   * @param payload POST Payload
   * @param method
   *
   * @returns {Promise<any>}
   */
  protected async apiRequest(endpoint: string, params: any = {}, payload: any = null, method: string = 'GET'): Promise<any> {

    const options: UriOptions & RequestPromiseOptions = {
      uri: this.url + '/' + endpoint,
      json: true,
      qs: params,
      method: method,
    };

    if (payload !== null) {
      options.body = payload;
      options.method = 'POST';
    }

    options.headers = {
      Authorization: 'Bearer ' + this.jwtToken,
    };

    return await request(options)
  }
}