#!/usr/bin/env node

var buffertools = require('buffertools')
var bitcoin = require('bitcoinjs-lib')
var PeerGroup = require('bitcoin-net').PeerGroup
var Blockchain = require('blockchain-spv')
var Filter = require('bitcoin-filter')
var utils = require('bitcoin-util')
var params = require('webcoin-bitcoin')
var levelup = require('levelup')
var memdown = require('memdown')
var Burnie = require('.')

// The first Counterparty burn was at block height 278319.
// Start downloading at height 278208 as an optimization
var checkpoint = {
  height: 278208, // we use a multiple of 2016, so that we can calculate future
  // difficulties without needing to check any blocks before this one

  header: {
    version: 2,
    prevHash: utils.toHash('0000000000000000a979bc50075e7cdf0da5274f7314910b2d798b1aeaf6543f'),
    merkleRoot: utils.toHash('e028d69864df2ca00848a65269b3df3e1b3c867b0b4482769462ea38dc487732'),
    timestamp: 1388624318,
    bits: 419628831,
    nonce: 3386334543
  }
}
params.blockchain.checkpoints = [ checkpoint ]

// We need to pass in a PeerGroup
var peers = new PeerGroup(params.net)
peers.on('error', console.log)

var filter = new Filter(peers, { falsePositiveRate: 0.00001 })

var db = levelup('chain', { db: memdown })
var chain = new Blockchain(params.blockchain, db)
chain.on('error', console.log)

var burnie = Burnie({
  address: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr',
  from: 278300,
  peers: peers,
  chain: chain
})
filter.add(burnie)

burnie.stream.on('data', function (burn) {
  console.log('txid', buffertools.reverse(burn.tx.transaction.getHash()).toString('hex'))
  for (var i in burn.tx.transaction.ins) {
    var input = burn.tx.transaction.ins[i]
    if (bitcoin.script.isPubKeyHashInput(input.script)) {
      var pubkeyHash = bitcoin.crypto.hash160(bitcoin.script.decompile(input.script)[1])
      console.log('input address', bitcoin.address.toBase58Check(pubkeyHash, 0))
    }
  }
  console.log('block height', burn.blockHeight)
  console.log('block time', new Date(burn.time * 1000))
  console.log('satoshis', burn.satoshis.toString(), '\n')
})

peers.once('peer', function () {
  chain.getLocator(function (err, locator) {
    if (err) throw err
    peers.createHeaderStream({ locator: locator }).pipe(chain.createWriteStream())
  })
})
peers.connect()
