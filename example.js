#!/usr/bin/env node

var Networks = require('bitcore-lib').Networks
var BlockHeader = require('bitcore-lib').BlockHeader
var Node = require('webcoin').Node
var Burnie = require('.')
var utils = require('webcoin').utils

// The first Counterparty burn was at block height 278319.
// Start downloading at height 278000 as an optimization
var checkpoint = {
  height: 278000,
  header: new BlockHeader({
    version: 2,
    prevHash: utils.toHash('000000000000000213eb4a93c7843e27a0923b18e89940038cf3f30ec2ec01fa'),
    merkleRoot: utils.toHash('7a48d491051d1b82b23e77fd51551b52d1cd48cfa4d9abe8271078f7ffaf00d7'),
    time: 1388536591,
    bits: 419668748,
    nonce: 3276557835
  })
}
console.log('checkpoint hash', checkpoint.header.hash)

// TODO: gross
var constants = require('webcoin').constants
constants.checkpoints.livenet = checkpoint

// We need to pass in a node
var node = new Node({
  network: Networks.livenet,
  path: 'data',
  acceptWeb: true
})
node.on('error', process.exit)

// The hex form of the address 1CounterpartyXXXXXXXXXXXXXXXUWLpVr.
var burnie = Burnie({
  pubkeyHash: Buffer('818895f3dc2c178629d3d2d8fa3ec4a3f8179821', 'hex'),
  from: checkpoint.height + 1,
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
