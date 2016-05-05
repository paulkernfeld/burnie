var assert = require('assert')
var EventEmitter = require('events')
var address = require('bitcoinjs-lib').address
var script = require('bitcoinjs-lib').script
var Transaction = require('bitcoinjs-lib').Transaction
var Block = require('bitcoinjs-lib').Block
var inherits = require('inherits')
var mapStream = require('map-stream')
var debug = require('debug')('burnie')
var CacheLiveStream = require('cache-live-stream')

var bubbleError = function (from, to, name) {
  from.on('error', function (err) {
    console.log('error:', name)
    to.emit('error', err)
  })
}

function Burnie (opts) {
  if (!(this instanceof Burnie)) return new Burnie(opts)

  assert(typeof opts.peers !== 'undefined')
  assert(typeof opts.chain !== 'undefined')
  assert(typeof opts.from === 'number')
  assert(typeof opts.address === 'string')
  assert(typeof opts.network !== 'undefined')
  assert(typeof opts.db !== 'undefined')

  EventEmitter.call(this)

  debug('new burnie', opts.address, opts.from)

  var self = this

  this.peers = opts.peers
  this.chain = opts.chain
  this.from = opts.from
  this.address = opts.address
  this.pubkeyHash = address.fromBase58Check(this.address).hash
  this.filtered = opts.filtered != null ? opts.filtered : true
  this.network = opts.network
  this.db = opts.db

  this.burnsStream = mapStream(this.txToBurns.bind(this))
  this.stream = mapStream(this.burnsToResult.bind(this))

  self.txStream = self.peers.createTransactionStream({ filtered: self.filtered })
  self.txStream.pipe(self.burnsStream)

  bubbleError(this.peers, this, 'peers')
  bubbleError(self.stream, self, 'stream')
  bubbleError(self.burnsStream, self, 'burnsStream')
  bubbleError(self.txStream, self, 'txStream')

  self.chain.on('block', function (block) {
    if (block.height % 1000 === 0) {
      debug('headers at', block.height)
    }
  })

  // TODO: get webcoin API to handle this for us
  self.peers.once('peer', function (peer) {
    if (self.chain.tip.height >= opts.from) {
      self.start()
    } else {
      var onSync = function (tip) {
        if (tip.height >= opts.from) {
          self.chain.removeListener('block', onSync)
          self.start()
        }
      }
      self.chain.on('block', onSync)
    }
  })
}
inherits(Burnie, EventEmitter)

Burnie.prototype.start = function () {
  var self = this

  var makeStream = function (value, cb) {
    var from
    if (value) {
      // Start on the block after the most recent cached one
      // TODO we could miss transactions like this
      from = value.height + 1
    } else {
      from = self.from
    }

    debug('burnie starting headers at height', from)
    self.chain.getBlockAtHeight(from, function (err, startBlock) {
      if (err) {
        console.log('error looking up block at height', from)
        return self.emit('error', err)
      }
      debug('burnie starting blocks...')

      var readStream = self.chain.createReadStream({ from: startBlock.header.getHash() })
      readStream.pipe(self.txStream)
      readStream.on('data', function (block) {
        if (block.height % 1000 === 0) {
          debug('txs at', block.height)
        }
      })
      cb(null, self.burnsStream)
    })
  }

  this.cache = CacheLiveStream(this.db, makeStream)
  this.cache.readable.pipe(this.stream)

  bubbleError(self.cache.readable, self, 'cache.readable')
}

Burnie.prototype.txToBurns = function (tx, cb) {
  debug('checking tx', tx.transaction.getId())
  var burns = []
  var self = this

  tx.transaction.outs.forEach(function (output, o) {
    // Ignore outputs that aren't pay-to-pubkey-hash
    if (!script.isPubKeyHashOutput(output.script)) {
      debug('ignoring non-pay-to-pubkey-hash output', o)
      return
    }

    // Ignore outputs to the wrong address
    var payToAddress = address.fromOutputScript(output.script, self.network)
    if (payToAddress !== self.address) {
      debug('ignoring output w/ payment to', o, payToAddress)
      return
    }

    debug('valid output found', o)
    burns.push({
      tx: {
        transaction: tx.transaction.toHex(),
        block: {
          height: tx.block.height,
          header: tx.block.header.toHex()
        }
      },
      satoshis: output.value.toNumber()
    })
  })

  cb(null, {
    height: tx.block.height,
    burns: burns
  })
}

Burnie.prototype.burnsToResult = function (burnInfo, cb) {
  var burns = burnInfo.burns
  if (burns.length === 0) {
    debug('no valid outputs, ignoring')
    cb()
  } else if (burns.length > 1) {
    debug('multiple valid outputs, ignoring')
    cb()
  } else {
    assert.equal(burns.length, 1)

    var burn = burns[0]
    cb(null, {
      tx: {
        transaction: Transaction.fromHex(burn.tx.transaction),
        block: {
          height: burn.tx.block.height,
          header: Block.fromHex(burn.tx.block.header)
        }
      },
      satoshis: burn.satoshis
    })
  }
}

// This provides an API for the bitcoin-filter package
Burnie.prototype.filterElements = function () {
  return [ this.pubkeyHash ]
}

module.exports = Burnie
