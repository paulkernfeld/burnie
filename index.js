var mapStream = require('map-stream')
var assert = require('assert')
var debug = require('debug')('burnie')

function Burnie (opts) {
  if (!(this instanceof Burnie)) return new Burnie(opts)

  assert(typeof opts.from !== 'undefined')
  assert(Buffer.isBuffer(opts.pubkeyHash))

  debug('new burnie', opts.pubkeyHash.toString('hex'), opts.from)

  var self = this

  this.node = opts.node
  this.pubkeyHash = opts.pubkeyHash

  this.node.filter.insert(opts.pubkeyHash)

  this.node.on('error', function (err) {
    // TODO handle this better
    throw err
  })

  this.stream = mapStream(function (tx, callback) {
    debug('checking tx', tx.transaction.hash)
    var outputs = []
    tx.transaction.outputs.forEach(function (output, o) {
      // Ignore outputs that aren't pay-to-pubkey-hash
      if (!output.script.isPublicKeyHashOut()) {
        debug('ignoring non-pay-to-pubkey-hash output', o)
        return
      }

      // Ignore outputs to the wrong address
      var payToHash = output.script.getAddressInfo().hashBuffer
      if (!payToHash.equals(self.pubkeyHash)) {
        debug('ignoring output w/ payment to', o, payToHash)
        return
      }

      debug('valid output found', o)
      outputs.push({
        tx: tx,
        satoshis: output.satoshis,
        blockHeight: tx.block.height,
        time: tx.block.header.time
      })
    })

    if (outputs.length === 0) {
      debug('no valid outputs, ignoring')
      callback()
    } else if (outputs.length > 1) {
      debug('multiple valid outputs, ignoring')
      callback()
    } else {
      assert.equal(outputs.length, 1)
      callback(null, outputs[0])
    }
  })

  var start = function() {
    debug('burnie starting...')
    self.node.createTransactionStream({ from: opts.from }).pipe(self.stream)
  }

  self.node.peers.once('peer', function (peer) {
    if (self.node.chain.tip.height >= opts.from) {
      start()
    } else {
      var onSync = function (tip) {
        if (tip.height >= opts.from) {
          self.node.chain.removeListener('sync', onSync)
          start()
        }
      }
      self.node.chain.on('sync', onSync)
    }
  })
  self.node.chain.on('sync', function(tip) {
    debug('headers at', tip.height)
  })
}

module.exports = Burnie
