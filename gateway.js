/*
 * SmartHome Gateway Firmware v0.3
 * Anushka Wijesundara | MIT licensed | IOTA MAM Gateway for IoT
 *
 * Watches an IOTA MAM channel for firmware-update announcements, downloads
 * the referenced binary, verifies its SHA-256 hash, and republishes the
 * new firmware version over MQTT so devices on the network can update.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const Axios = require('axios');
const IOTA = require('iota.lib.js');
const Mam = require('@iota/mam');
const mqtt = require('mqtt');

const writeFile = promisify(fs.writeFile);

const devices = require('./devices.list'); // Device MAC address(es)
const sourceFile = require('./next.root'); // Last known MAM channel root

// --- Configuration -------------------------------------------------------

// IOTA full node used to read/write the MAM channel.
const IOTA_NODE = 'https://tangle.anushkawijesundara.com:443';

const MAM_MODE = 'public'; // public, private or restricted
const MAM_SIDEKEY = 'mysecret'; // ASCII only; used only in restricted mode

const FIRMWARE_DIR = '/var/www/html/firmwares/';

const MQTT_OPTIONS = {
  host: '127.0.0.1',
  port: 1883,
  username: '',
  password: '',
};

// --- State -----------------------------------------------------------------

const iota = new IOTA({ provider: IOTA_NODE });
const mqttClient = mqtt.connect(MQTT_OPTIONS);

// Firmware metadata populated once a MAM message has been read from the Tangle.
let firmware = {
  url: undefined,
  hash: undefined,
  version: undefined,
};

let mamState = Mam.init(iota);
if (MAM_MODE === 'restricted') {
  const sideKey = iota.utils.toTrytes(MAM_SIDEKEY);
  mamState = Mam.changeMode(mamState, MAM_MODE, sideKey);
} else {
  mamState = Mam.changeMode(mamState, MAM_MODE);
}

const root = sourceFile.nextroot;
const channelKey = null;
console.log(`Current Root --> ${root}`);

mqttClient.publish('IoT/Wakeup', JSON.stringify({ Smart_Home_Gateway: 'Wokeup' }));

// --- Firmware download & verification ---------------------------------------

/** Downloads the firmware binary referenced by the latest MAM message. */
async function downloadFirmware(firmwareUrl) {
  const destination = path.resolve(FIRMWARE_DIR, `${devices.light}.bin`);
  const writer = fs.createWriteStream(destination);

  const response = await Axios({
    url: firmwareUrl,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/** Computes the SHA-256 hash of a file and resolves 'Verified' / 'Not verified'. */
async function fileHash(filename, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const shasum = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filename);

    stream.on('error', () => reject(new Error('calc fail')));
    stream.on('data', (chunk) => shasum.update(chunk));
    stream.on('end', () => {
      const hash = shasum.digest('hex');
      console.log(`SHA256 value calculated ${hash}`);
      if (firmware.hash === hash) {
        console.log('Verified !');
        resolve('Verified');
      } else {
        resolve('Not verified');
      }
    });
  });
}

/** Writes the firmware version file and announces the update over MQTT. */
async function writeVersionFile(device, version) {
  console.log('Begin version file creation !');
  await writeFile(path.join(FIRMWARE_DIR, `${device}.version`), version);
  console.info('Version file created ! ');

  const versionInteger = parseInt(version, 10);
  mqttClient.publish(
    'IoT/Firmware_Update/in',
    JSON.stringify({ fw_version: versionInteger, fw_url: version })
  );
}

/** Verifies the downloaded firmware binary and, if valid, records its version. */
async function verifyFirmware() {
  console.log('Begin verification');
  const result = await fileHash(path.join(FIRMWARE_DIR, `${devices.light}.bin`));
  if (result === 'Verified') {
    await writeVersionFile(devices.light, firmware.version);
  } else {
    console.log('Version file creation failed due to Hash mismatch !');
  }
}

// --- MAM channel polling ----------------------------------------------------

/**
 * Reads the next MAM message from `rootValue`, stores the firmware metadata
 * it announces, persists the new channel root, and keeps following the
 * channel forward.
 */
async function pollMamChannel(rootValue, keyValue) {
  const response = await Mam.fetch(rootValue, MAM_MODE, keyValue, (data) => {
    const message = JSON.parse(iota.utils.fromTrytes(data));
    console.log(message);

    firmware = {
      url: message.file_url,
      hash: message.file_hash,
      version: message.firmware_version,
    };
  });

  pollMamChannel(response.nextRoot, keyValue);

  console.log(`New Root --> ${response.nextRoot}`);
  if (root === response.nextRoot) {
    console.log('No update from Tangle');
  } else {
    fs.writeFile(
      'next.root',
      `module.exports.nextroot = "${response.nextRoot}"`,
      (err) => {
        if (err) console.log(err);
        console.log('next.root File updated');
      }
    );
  }
}

pollMamChannel(root, channelKey).then(() => {
  downloadFirmware(firmware.url).then(() => {
    console.log('Binaries downloaded !');
    verifyFirmware().then(() => process.exit());
  });
});
