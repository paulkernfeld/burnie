var assert = require('assert')
var EventEmitter = require('events')

var bitcoin = require('bitcoinjs-lib')
var CacheLiveStream = require('cache-live-stream')
var debug = require('debug')('burnie')
var inherits = require('inherits')
var mapStream = require('map-stream')
var ReadWriteLock = require('rwlock')
var through2 = require('through2')

var address = bitcoin.address
var script = bitcoin.script
var Transaction = bitcoin.Transaction
var Block = bitcoin.Block

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

  this.burnsStream = through2.obj(function (block, enc, cb) {
    var through2Self = this

    var blockSummary = {
      height: block.height,
      header: block.header.toHex()
    }
    block.transactions.forEach(function (tx) {
      var burns = []
      debug('checking tx', tx.getId(), 'height', block.height)
      tx.outs.forEach(function (output, o) {
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
          tx: tx.toHex(),
          satoshis: output.value.toNumber()
        })
      })
      through2Self.push({
        block: blockSummary,
        burns: burns
      })
    })
    through2Self.push({
      block: blockSummary
    })

    cb()
  })

  this.stream = mapStream(this.burnsToResult.bind(this))

  self.blockStream = self.peers.createBlockStream({ filtered: self.filtered })
  self.blockStream.pipe(self.burnsStream)

  self.chain.on('block', function (block) {
    if (block.height % 1000 === 0) {
      debug('headers at', block.height)
    }
    self.emit('headers', block)
  })

  // This makes sure we don't start the chain stream before it's ready
  var chainLock = new ReadWriteLock()

  chainLock.writeLock(function (release) {
    // TODO: get webcoin API to handle this for us
    self.peers.once('peer', function (peer) {
      if (self.chain.tip.height >= opts.from) {
        release()
      } else {
        var onSync = function (tip) {
          if (tip.height >= opts.from) {
            self.chain.removeListener('block', onSync)
            release()
          }
        }
        self.chain.on('block', onSync)
      }
    })
  })

  var makeStream = function (value, cb) {
    chainLock.writeLock(function (release) {
      release()

      var from
      if (value) {
        // Start on the block after the most recent cached one
        // TODO we could miss transactions like this
        from = value.block.height
      } else {
        from = self.from
      }

      debug('burnie will start txs at height', from)
      self.chain.getBlockAtHeight(from, function (err, startBlock) {
        if (err) {
          console.log('error looking up block at height', from)
          return self.emit('error', err)
        }
        debug('burnie starting txs...')
        self.emit('headers', startBlock)

        var readStream = self.chain.createReadStream({ from: startBlock.header.getHash(), inclusive: false })
        readStream.pipe(self.blockStream)
        readStream.on('data', function (block) {
          if (block.height % 1000 === 0) {
            debug('txs at', block.height)
          }
          self.emit('txs', block)
        })
        cb(null, self.burnsStream)
      })
    })
  }

  self.cache = CacheLiveStream(this.db, makeStream)
  self.cache.readable.pipe(this.stream)

  bubbleError(this.peers, this, 'peers')
  bubbleError(self.stream, self, 'stream')
  bubbleError(self.burnsStream, self, 'burnsStream')
  bubbleError(self.blockStream, self, 'blockStream')
  bubbleError(self.cache.readable, self, 'cache.readable')
}
inherits(Burnie, EventEmitter)

Burnie.prototype.burnsToResult = function (burnInfo, cb) {
  var burns = burnInfo.burns

  if (!burns) {
    // This was just a checkpointing object w/ no TX data
    cb()
  } else if (burns.length === 0) {
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
        transaction: Transaction.fromHex(burn.tx),
        block: {
          height: burnInfo.block.height,
          header: Block.fromHex(burnInfo.block.header)
        }
      },
      satoshis: burn.satoshis
    })
  }
}

// Implement the Filterable interface for the bitcoin-filter package.
Burnie.prototype.filterElements = function () {
  return [ this.pubkeyHash ]
}

module.exports = Burnie
