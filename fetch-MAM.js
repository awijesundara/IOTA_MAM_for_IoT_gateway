/*
 * Standalone utility: publish a test packet to a MAM channel, then fetch it
 * back and print the decoded payload. Useful for verifying connectivity to
 * the configured IOTA node and the MAM channel state in next.root.
 */

const fs = require('fs');

const IOTA = require('iota.lib.js');
const Mam = require('@iota/mam');

const IOTA_NODE = 'https://tangle.anushkawijesundara.com';

const iota = new IOTA({ provider: IOTA_NODE });
const sourceFile = require('./next.root');

const root = sourceFile.nextroot;
console.log(root);

let mamState = Mam.init(iota);

/** Publishes a JSON-serializable packet to the MAM channel and returns its root. */
async function publish(packet) {
  const trytes = iota.utils.toTrytes(JSON.stringify(packet));
  const message = Mam.create(mamState, trytes);
  mamState = message.state;
  await Mam.attach(message.payload, message.address);
  return message.root;
}

/** Decodes and logs a MAM message payload. */
function logData(data) {
  console.log(JSON.parse(iota.utils.fromTrytes(data)));
}

async function execute() {
  const response = await Mam.fetch(root, 'public', null, logData);
  console.log(response.nextRoot);

  fs.writeFile(
    'next.root-fetch',
    `module.exports.nextroot = "${response.nextRoot}"`,
    (err) => {
      if (err) console.log(err);
      console.log('Successfully Written to File.');
    }
  );
}

module.exports = { publish };

execute();
