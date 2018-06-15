#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import {ChargepointsManager} from "./cloudkit-utils/chargepoints-manager";
dotenv.config();
const argv = require('minimist')(process.argv.slice(2));

const main = async () => {
  try {

    const manager = new ChargepointsManager({
      dryRun: argv['dry-run'],
      limit: argv.limit ? parseFloat(argv.limit) : undefined,
      verbose: argv.verbose,
    });

    await manager.init();

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
