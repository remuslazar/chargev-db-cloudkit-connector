#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import {CloudKitService} from "./cloudkit/cloudkit.service";

dotenv.config();
const argv = require('minimist')(process.argv.slice(2));

const main = async () => {
  try {
    if (argv['cloudkit']) {
      const service = new CloudKitService();
      const userInfo = await service.setup();

      if (!userInfo) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(`setup CloudKit failed`);
      }

      console.error(`CloudKit [${process.env.CLOUDKIT_ENV}] Login OK, userRecordName: ${userInfo.userRecordName}`);
    }

    process.exit()
  } catch(err) {
    console.error(err);
    process.exit(1)
  }
};

main().then(() => {

}, err => {
  console.error(err);
});
