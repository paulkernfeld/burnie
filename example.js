#!/usr/bin/env node

var buffertools = require('buffertools')
var bitcoin = require('bitcoinjs-lib')
var PeerGroup = require('bitcoin-net').PeerGroup
var Blockchain = require('blockchain-spv')
var Filter = require('bitcoin-filter')
var utils = require('bitcoin-util')
var mainnetParams = require('webcoin-bitcoin')
var testnetParams = require('webcoin-bitcoin-testnet')
var levelup = require('levelup')
var sublevel = require('level-sublevel')
var Burnie = require('.')

// The first Counterparty burn was at block height 278319.
// Start downloading at height 278208 as an optimization
var checkpointMainnet = {
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
mainnetParams.blockchain.checkpoints = [ checkpointMainnet ]

var checkpointTestnet = {
  'height': 153216,
  'header': {
    'version': 2,
    'prevHash': utils.toHash('000000000010a614c60457f8d2ae2bb826d037f52113252888fadda8ed773c9c'),
    'merkleRoot': utils.toHash('48aecdc48b82f1cbc66dbf825ef8ae87fc1c27ae9106675bc0c34d5b1d02dcf9'),
    'timestamp': 1386677918,
    'bits': 453357891,
    'nonce': 2494835766
  }
}
testnetParams.blockchain.checkpoints = [ checkpointTestnet ]

var testnet = process.argv[2] === '--testnet'
var params = testnet ? testnetParams : mainnetParams
var address = testnet ? 'mvCounterpartyXXXXXXXXXXXXXXW24Hef' : '1CounterpartyXXXXXXXXXXXXXXXUWLpVr'
var from = testnet ? 155069 : 278318

// We need to pass in a PeerGroup
var peers = new PeerGroup(params.net)
peers.on('error', console.log)

var filter = new Filter(peers, { falsePositiveRate: 0.00001 })

var masterDb = sublevel(levelup('./example.db'))
var db = masterDb.sublevel(testnet ? 'testnet' : 'livenet')
var chain = new Blockchain(params.blockchain, db.sublevel('chain'))
chain.on('error', console.log)

var burnie = Burnie({
  address: address,
  from: from,
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
