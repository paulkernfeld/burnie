Burnie is an SPV Bitcoin burn verification library built on webcoin.

Overview
--------
Burnie allows you to easily verify that Bitcoins have been "[burned](http://bitcoin.stackexchange.com/questions/24187/what-is-proof-of-burn)," i.e. sent to an unspendable address so that they are destroyed. Proof-of-burn has been used as a mining technique for alternative cryptocurrencies, and it has also been proposed as a DNS registration technique.

Burnie is based on [webcoin](https://github.com/mappum/webcoin). This gives it two important advantages over other ways of verifying proof-of-burn:

* It should be possible to run a full client in the browser (not yet tested).
* Since webcoin uses [simplified payment verification](https://en.bitcoin.it/wiki/Thin_Client_Security), it starts up fast and uses minimal bandwidth.

API Documentation
-----------------
See `example.js`.

Example
-------
During the creation of the Counterparty currency, there was a one-month burn period (January 2014) where users could send bitcoins to the unspendable address `1CounterpartyXXXXXXXXXXXXXXXUWLpVr` in order to purchase units of Counterparty (read more [here](http://counterparty.io/news/why-proof-of-burn/)). This demo code prints out information about everyone who burned Bitcoins to that address. See `example.js` for a more verbose version of this.

This script should take only a few minutes to start up. If you want to see more of what's going on behind the scenes, set the `DEBUG` env var to `*`.

```javascript
var Networks = require('bitcore-lib').Networks
var Node = require('webcoin').Node
var Burnie = require('burnie')

// Start downloading at the beginning of time. By default webcoin will use
// a checkpoint which might not work for our purposes.
// This is a gross hack.
require('webcoin').constants.checkpoints = {}

// We need to pass in a node
var node = new Node({
  network: Networks.livenet,
  path: 'data',
  acceptWeb: true
})

// This is the hex form of the address 1CounterpartyXXXXXXXXXXXXXXXUWLpVr.
var pubkeyHash = Buffer('818895f3dc2c178629d3d2d8fa3ec4a3f8179821', 'hex')

// The first Counterparty burn was in block 278622.
var burnie = Burnie({
  pubkeyHash: pubkeyHash,
  from: 278621,
  node: node
})

burnie.stream.on('data', function (burn) {
  console.log('burn detected', burn)
})

node.start()
```
