#!/usr/bin/env node

var Filter = require('bitcoin-filter')
var PeerGroup = require('bitcoin-net').PeerGroup
var utils = require('bitcoin-util')
var bitcoin = require('bitcoinjs-lib')
var Blockchain = require('blockchain-spv')
var reverse = require('buffer-reverse')
var memdb = require('memdb')
var sublevel = require('subleveldown')
var tape = require('tape')
var timers = require('timers')
var mainnetParams = require('webcoin-bitcoin')
var testnetParams = require('webcoin-bitcoin-testnet')
var Burnie = require('.')

var networks = bitcoin.networks

// This example shows Bitcoins that were burned to buy units of the Counterparty currency.
// For a bit more on Counterparty proof-of-burn, see here: http://counterparty.io/news/why-proof-of-burn/
//
// Note that this example can be run with the --testnet command line arg, which will make it look at the testnet.

// The first Counterparty burn was at block height 278319.
// Start downloading at height 278208 so we don't have to start at the beginning of time.
// Note that this does not actually look at block 278208.
var runTest = function (testnet) {
  tape('get counterparty burns', function (t) {
    t.timeoutAfter(30000)
    t.on('end', function () {
      timers.setImmediate(process.exit)
    })

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
    mainnetParams.blockchain.checkpoints = [checkpointMainnet]

    var checkpointTestnet = {
      'height': 153216,
      'header': {
        'version': 2,
        'prevHash': utils.toHash('000000000010a614c60457f8d2ae2bb826d037f52113252888fadda8ed773c9c'),
        'merkleRoot': utils.toHash('48aecdc48b82f1cbc66t.f825ef8ae87fc1c27ae9106675bc0c34d5b1d02dcf9'),
        'timestamp': 1386677918,
        'bits': 453357891,
        'nonce': 2494835766
      }
    }
    testnetParams.blockchain.checkpoints = [checkpointTestnet]

    var params = testnet ? testnetParams : mainnetParams
    var address = testnet ? 'mvCounterpartyXXXXXXXXXXXXXXW24Hef' : '1CounterpartyXXXXXXXXXXXXXXXUWLpVr'
    var from = testnet ? 153216 : 278208
    var network = testnet ? networks.testnet : networks.bitcoin

    // We need to pass in a PeerGroup
    var peers = new PeerGroup(params.net)

    var filter = new Filter(peers)

    var db = memdb()
    var chain = new Blockchain(params.blockchain, sublevel(db, 'chain'))

    var burnie = Burnie({
      address: address,
      from: from,
      peers: peers,
      chain: chain,
      network: network,
      db: sublevel(db, 'burnie', { valueEncoding: 'json' }),
      endDelay: 3600 * 3
    })
    filter.add(burnie)

    burnie.stream.once('data', function (burn) {
      t.same(
        reverse(burn.tx.transaction.getHash()).toString('hex'),
        '685623401c3f5e9d2eaaf0657a50454e56a270ee7630d409e98d3bc257560098'
      )
      t.same(burn.tx.transaction.ins.length, 1)
      for (var i in burn.tx.transaction.ins) {
        var input = burn.tx.transaction.ins[i]
        if (bitcoin.script.isPubKeyHashInput(input.script)) {
          var pubkeyHash = bitcoin.crypto.hash160(bitcoin.script.decompile(input.script)[1])
          t.same(bitcoin.address.toBase58Check(pubkeyHash, 0), '1Pcpxw6wJwXABhjCspe3CNf3gqSeh6eien')
        } else {
          t.fail()
        }
      }
      t.same(burn.satoshis, 50000)
      t.end()
    })

    peers.once('peer', function () {
      t.pass('saw a peer')
      var headerStream = peers.createHeaderStream()
      chain.createLocatorStream().pipe(headerStream)
      headerStream.pipe(chain.createWriteStream())
    })
    peers.connect()
  })
}

runTest(false)
