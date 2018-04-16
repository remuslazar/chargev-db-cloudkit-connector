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

    if (argv['upload']) {
      console.log(`# Fetch new events from chargEV CloudKit Backend and upload them to ChargEV DB`);
      await manager.fetchNewCheckInsFromCloudKitAndUploadThemToChargEVDB();
    }

    await manager.printStats();

  } catch(err) {
    console.error(`ERROR: ${err.message}`);

    if (argv.verbose) {
      console.error(err);
    }

    process.exit(1)
  }
};

main().then(() => {
  process.exit()
}, err => {
  console.error(err);
});
