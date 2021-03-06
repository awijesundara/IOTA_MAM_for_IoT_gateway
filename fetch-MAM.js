const express = require('express');
const app = express();
const path = require('path');

var Mam = require('./lib/mam.node.js')
var IOTA = require('iota.lib.js')
var iota = new IOTA({ provider: `https://tangle.anushkawijesundara.com` })

var cmd=require('node-cmd');
var nrc = require('node-run-cmd');
var download = require('download-file')
var crypto = require('crypto'),fs = require('fs')
crypto.getHashes() 

var sourceFile = require('./next.root');
console.log(sourceFile.nextroot);

// Init State
//let root = fs.readFileSync('next.root', 'utf8')
let root = sourceFile.nextroot
//console.log(root)
//console.log(newwRoot)
// Initialise MAM State
var mamState = Mam.init(iota)

// Publish to tangle
const publish = async packet => {
  var trytes = iota.utils.toTrytes(JSON.stringify(packet))
  var message = Mam.create(mamState, trytes)
  mamState = message.state
  await Mam.attach(message.payload, message.address)
  return message.root
}

// Callback used to pass data out of the fetch
const logData = data => console.log(JSON.parse(iota.utils.fromTrytes(data)))

const execute = async () => {
  var resp = await Mam.fetch(root, 'public', null, logData)
  console.log(resp.nextRoot)
  fs.writeFile("next.root-fetch", 'module.exports.nextroot = "'+resp.nextRoot +'"', (err) => {
  if (err) console.log(err);
  console.log("Successfully Written to File.");
});
}

execute()
