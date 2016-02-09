var mapStream = require('map-stream')
var assert = require('assert')
var debug = require('debug')('burnie')

function Burnie (opts) {
  if (!(this instanceof Burnie)) return new Burnie(opts)

  assert(typeof opts.from !== 'undefined')
  assert(Buffer.isBuffer(opts.pubkeyHash))

  var self = this

  this.node = opts.node
  this.pubkeyHash = opts.pubkeyHash

  this.node.filter.insert(opts.pubkeyHash)

  this.node.on('error', function (err) {
    // TODO handle this better
    throw err
  })

  this.stream = mapStream(function (tx, callback) {
    for (var o in tx.transaction.outputs) {
      // Ignore outputs that aren't pay-to-pubkey-hash
      var output = tx.transaction.outputs[o]
      if (!output.script.isPublicKeyHashOut()) continue

      // Ignore outputs to the wrong address
      var outp = output.script.getAddressInfo().hashBuffer
      if (outp.equals(self.pubkeyHash)) continue

      // In this case, an output was valid
      var inputPubkeyHash = null
      if (tx.transaction.inputs.length === 1) {
        if (tx.transaction.inputs[0].script.isPublicKeyHashIn()) {
          inputPubkeyHash = tx.transaction.inputs[0].script.getAddressInfo().hashBuffer
        }
      }
      callback(null, {
        tx: tx,
        satoshis: output.satoshis,
        blockHeight: tx.block.height,
        time: tx.block.header.time,
        inputPubkeyHash: inputPubkeyHash
      })
      return
    }

    // No output was paid to our address, filter this tx out
    callback()
  })

  var start = function() {
    debug('Burnie starting...')
    var transactionStream = self.node.createTransactionStream({ from: opts.from })
    transactionStream.blocks.on('data', function(block) {
      if (block.height % 100 === 0) debug('tx stream at', block.height)
    })
    transactionStream.pipe(self.stream)
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
