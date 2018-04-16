#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import {CheckInsSyncManager} from "./cloudkit-connector/checkins-sync-manager";

dotenv.config();
const argv = require('minimist')(process.argv.slice(2));

const main = async () => {
  try {

    const manager = new CheckInsSyncManager({
      dryRun: argv['dry-run'],
      limit: argv.limit ? parseFloat(argv.limit) : undefined,
      verbose: argv.verbose,
      init: argv.init,
    });

    await manager.init();

    if (argv['download']) {
      console.log(`# Download new events from chargEV DB and upload them to cloudkit`);
      await manager.fetchNewEventsFromChargEVDBAndUploadToCloudKit();
    }

    process.exit()
  } catch(err) {
    console.error(err.message);
    process.exit(1)
  }
};

main().then(() => {

}, err => {
  console.error(err);
});
