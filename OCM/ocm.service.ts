import request = require('request-promise');

const baseURL = 'https://api.openchargemap.io/v2';

export interface OCMOptions {
  maxresults?: number;
  countrycode?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  distanceunit?: string;
  operatorid?: number[];
  connectiontypeid?: number[];
  countryid?: number[];
  levelid?: number[];
  minpowerkw?: number;
  usagetypeid?: number[];
  statustypeid?: number[];
  dataproviderid?: number[];
  modifiedsince?: Date;
  opendata?: boolean;
  includecomments?: boolean;
  verbose?: boolean;
  compact?: boolean;
  output?: OCMFormatOption;
  camelcase?: boolean;
}

enum OCMFormatOption {
  // noinspection JSUnusedGlobalSymbols
  json = 'json',
  xml = 'xml',
  kml = 'kml',
}

class OCMBaseOptions implements OCMOptions {
  output?: OCMFormatOption = OCMFormatOption.json;
  camelcase?: boolean = true;
  compact?: boolean = true;
}

export class OCMService {

  defaultOptions: OCMOptions;

  constructor(defaultOptions: any = {}) {
    const baseOptions = new OCMBaseOptions();
    this.defaultOptions = { ...baseOptions, ...defaultOptions }
  }

  async getList(options?: OCMOptions): Promise<any> {
    const response = await request.get({
      url: baseURL + '/poi',
      qs: { ...this.defaultOptions, ...options}
    });
    return JSON.parse(response);
  }

}
