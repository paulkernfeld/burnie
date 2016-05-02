var assert = require('assert')
var EventEmitter = require('events')
var address = require('bitcoinjs-lib').address
var script = require('bitcoinjs-lib').script
var inherits = require('inherits')
var mapStream = require('map-stream')
var debug = require('debug')('burnie')

function Burnie (opts) {
  if (!(this instanceof Burnie)) return new Burnie(opts)

  assert(typeof opts.peers !== 'undefined')
  assert(typeof opts.chain !== 'undefined')
  assert(typeof opts.from === 'number')
  assert(typeof opts.address === 'string')
  assert(typeof opts.network !== 'undefined')

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

  this.peers.on('error', function (err) {
    self.emit('error', err)
  })

  //this.db.createValueStream().pipe(process.stdout)

  this.burnsStream = mapStream(this.txToBurns.bind(this))
  this.stream = mapStream(this.burnsToResult.bind(this))
  this.burnsStream.pipe(this.stream)

  self.txStream = self.peers.createTransactionStream({ filtered: self.filtered })
  self.txStream.pipe(self.burnsStream)

  self.stream.on('error', console.log)
  self.burnsStream.on('error', console.log)
  self.txStream.on('error', console.log)

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
  debug('burnie starting headers...')
  this.chain.getBlockAtHeight(this.from, function (err, block) {
    debug('burnie starting blocks...')
    if (err) return self.emit('error', err)
    self.chain.createReadStream({ from: block.header.getHash() }).pipe(self.txStream)
  })
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
      tx: tx,
      satoshis: output.value
    })
  })

  cb(null, {
    height: tx.block.height,
    results: burns
  })
}

Burnie.prototype.burnsToResult = function (tx, cb) {
  var results = tx.results
  if (results.length === 0) {
    debug('no valid outputs, ignoring')
    cb()
  } else if (results.length > 1) {
    debug('multiple valid outputs, ignoring')
    cb()
  } else {
    assert.equal(results.length, 1)
    cb(null, results[0])
  }
}


// This provides an API for the bitcoin-filter package
Burnie.prototype.filterElements = function () {
  return [ this.pubkeyHash ]
}

module.exports = Burnie
