Burnie is an SPV Bitcoin burn verification library built on webcoin.

[![Build Status](https://travis-ci.org/paulkernfeld/burnie.svg)](https://travis-ci.org/paulkernfeld/burnie) [![npm](https://img.shields.io/npm/dt/burnie.svg)](https://www.npmjs.com/package/burnie)

Overview
--------
Burnie allows you to easily verify that Bitcoins have been "[burned](http://bitcoin.stackexchange.com/questions/24187/what-is-proof-of-burn)," i.e. sent to an unspendable address so that they are destroyed. Proof-of-burn has been used as a mining technique for alternative cryptocurrencies, and it has also been proposed as a DNS registration technique.

Burnie is based on [webcoin](https://github.com/mappum/webcoin). This gives it two important advantages over other ways of verifying proof-of-burn:

* It should be possible to run a full client in the browser (not yet tested).
* Since webcoin uses [simplified payment verification](https://en.bitcoin.it/wiki/Thin_Client_Security), it starts up fast and uses minimal bandwidth.

API Documentation/Example
-------------------------
See `test.js`.
