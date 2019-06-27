/*
SmartHome Gateway Firmware v0.2 | 27/06/2019
Anushka Wijesundara | MIT licenced | IOTA MAM Gateway for IoT

*/

const express = require('express');
const app = express();
const path = require('path');

const Mam = require('./lib/mam.client.js');
const IOTA = require('iota.lib.js');
var cmd=require('node-cmd');
var nrc = require('node-run-cmd');
var download = require('download-file')
var crypto = require('crypto'),fs = require('fs');
const Path = require('path');
const Axios = require('axios');
const { promisify } = require("util");
const writeFile = promisify(fs.writeFile);
var mqtt = require('mqtt');

//MQTT configuration
var  client = mqtt.connect({
        host: '127.0.0.1',
        port: 1883,
        username: '',
        password: ''
    });

crypto.getHashes() 

// How to publish JSON array in MQTT
client.publish('IoT/Wakeup', JSON.stringify({ Smart_Home_Gateway:"Wokeup" }))

//Declare global variables
global.fw_bin_url; //Download URL from Tangle
global.fw_bin_local_link; //Downloaded local link
global.fw_bin_hash; // Hash value from Tangle
global.fw_bin_version; // Firmware Version from Tangle

// Declare IOTA Full nodes here;
//const iota = new IOTA({ provider: 'https://nodes.devnet.iota.org:443' });
//const iota = new IOTA({ provider: 'https://remote.iprocessing.tech:14267' });
//const iota = new IOTA({ provider: 'https://knobbys-node-3.ddns.net:14267' });
//const iota = new IOTA({ provider: 'http://mandelhost.de:14265' });
//const iota = new IOTA({ provider: 'https://knobbys-node-3.ddns.net:14267' });
//const iota = new IOTA({ provider: 'https://iota.anushkawijesundara.com:443' });
//const iota = new IOTA({ provider: 'https://nodes.thetangle.org:443' });
const iota = new IOTA({ provider: 'https://tangle.anushkawijesundara.com:443' });
//const iota = new IOTA({ provider: 'https://iota.bracken.xyz:14267' });
//const iota = new IOTA({ provider: 'https://dyn.tangle-nodes.com:443' });

const MODE = 'public'; // public, private or restricted
const SIDEKEY = 'mysecret'; // Enter only ASCII characters. Used only in restricted mode

var devices = require('./devices.list'); //Read devices MAC address

var sourceFile = require('./next.root'); //Read the next root of Tangle
console.log("Current Root --> "+sourceFile.nextroot);//Print the value for verification

let root = sourceFile.nextroot //Read the root from sourceFile
let key;

// Initialise MAM State
let mamState = Mam.init(iota);

// Set channel mode
if (MODE == 'restricted') {
    key = iota.utils.toTrytes(SIDEKEY);
    mamState = Mam.changeMode(mamState, MODE, key);
} else {
    mamState = Mam.changeMode(mamState, MODE);
}

//Download binaries
async function download_bin (fw_url) {  
  const url = fw_url
  const path = Path.resolve(__dirname, '/var/www/html/firmwares/', devices.light+'.bin')
  const writer = fs.createWriteStream(path)

  const response = await Axios({
    url,
    method: 'GET',
    responseType: 'stream'
  })

  response.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

//Verify downloaded binaries
async function bin_verification () {
  console.log("Begin verification")
  var hash = await fileHash('/var/www/html/firmwares/'+devices.light+'.bin'); 
  //console.log("SHA256 value calculated "+hash);
  if (hash=="Verified"){
  var version = await fileVersion(devices.light,fw_bin_version);
  }
  else{console.log("Version file creation failed due to Hash mismatch !")}

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

//Hash calculation
async function fileHash(filename, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    let shasum = crypto.createHash(algorithm);
    try {
      let s = fs.ReadStream(filename)
      s.on('data', function (data) {
        shasum.update(data)
      })
      // making digest
      s.on('end', function () {
        const hash = shasum.digest('hex')
	console.log("SHA256 value calculated "+hash);
	if (fw_bin_hash==hash){
	console.log("Verified !");
	return resolve("Verified");
	}
	else{
        return resolve("Not verified");
	}
      })
    } catch (error) {
      return reject('calc fail');
    }
  });
}

//Version file creation
async function fileVersion(device,version){
console.log("Begin version file creation !")
await writeFile("/var/www/html/firmwares/"+device+".version",version);
console.info("Version file created ! ");
var version_integer = parseInt(version, 10);
client.publish('IoT/Firmware_Update/in', JSON.stringify({'fw_version':version_integer,'fw_url':version})); // This should be added to async function
}

const executeDataRetrieval = async function(rootVal, keyVal) {
    let resp = await Mam.fetch(rootVal, MODE, keyVal, function(data)
	 {
        	let json = JSON.parse(iota.utils.fromTrytes(data));
		console.log(json);

		fw_bin_url=json.file_url;
		fw_bin_hash=json.file_hash;
		fw_bin_version=json.firmware_version;

  	});

    	executeDataRetrieval(resp.nextRoot, keyVal)
    		console.log("New Root --> "+resp.nextRoot);
    		if (root==resp.nextRoot){console.log("No update from Tangle")}
    		else {
    			fs.writeFile("next.root", 'module.exports.nextroot = "'+resp.nextRoot +'"', (err) => {
    				if (err) console.log(err);
       				console.log("next.root File updated");
    			});
    		}
	}

executeDataRetrieval(root, key).then(() => {
        download_bin(fw_bin_url).then(() => {console.log("Binaries downloaded !"); bin_verification().then(()=>{ process.exit();}) });
        })
