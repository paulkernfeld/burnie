#!/usr/bin/env node

var Networks = require('bitcore-lib').Networks
var Node = require('webcoin').Node
var Burnie = require('./index')

// We need to pass in a node
var node = new Node({
  network: Networks.livenet,
  path: 'data',
  acceptWeb: true
})
node.on('error', process.exit)

// The hex form of the address 1CounterpartyXXXXXXXXXXXXXXXUWLpVr.
// The first Counterparty burn was in block 278622.
var burnie = Burnie({
  pubkeyHash: Buffer('818895f3dc2c178629d3d2d8fa3ec4a3f8179821', 'hex'),
  from: 278621,
  node: node
})

burnie.stream.on('data', function (burn) {
  if (burn.inputPubkeyHash) {
    console.log('Input pubkey hash', burn.inputPubkeyHash.toString('hex'))
  } else {
    console.log('Unrecognized inputs')
  }
  console.log('block height', burn.blockHeight)
  console.log('block time', new Date(burn.time * 1000))
  console.log('satoshis', burn.satoshis, '\n')
})

node.start()
