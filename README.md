# MTProtoProxy
Fast and Simple NodeJS MTProto Proxy(Telegram Proxy) with the support of PROMOTION CHANNELS

## Table of Contents

- [Install](#install)
- [Introduction](#introduction)
- [Documentation](#documentation)
- [Sample Code](#samplecode)
- [Todo](#todo)

## Install

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/).

Before installing, [download and install Node.js](https://nodejs.org/en/download/).
Node.js 8.0 or higher is required.

Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```sh
$ npm install mtprotoproxy
```
## introduction

This module not a tool only, it contains APIs which can be used to cusomize the Telegram MTProto proxy.
It can be used to log, limit access and create proxy farms that are very hard to filter.
It is designed to be as simple as possible, to understand and study the protocol.
This proxy does not initial proxy protocol. It containes only the secured protocol. Please remeber that in order to use secured version of the protocol, 'dd' should be added to the secret on client side, otherwise this proxy rejects the client.

## documentation

### constructor

const {MTProtoProxy} = require('mtprotoproxy');
let telegram=new MTProtoProxy({secret,tag,httpServer,filter})

When createing a mtprotoproxy, have to set the following options:

* `secret`: The secret that clients use to connect to the server. It is a 16 bytes length Buffer object. (IT DOES NOT CONTAIN 'dd' FOR ITS FIRST BYTE, the clients have to add 'dd' to this secret.)
* `tag`: The advertisement tag used to identify the sponser channel. Can be obtained from @mtproxybot which is an official bot from Telegram.

The following options are optional:

* `httpServer`: An instance of http.Server from NodeJS. It can be used to serve an http server on the same port of MTProtoProxy port.
* `filter`: An async function, or a function returning a Promise. This function is called with the user addredd, port and can be used to limit access of some users based on their IP address or number of concurrent connections or their traffic quota. If it throw an error, the client will be rejected.

### Event

```js
MTProtoProxy.on('ready',function(){});
```
Emitted when the proxy is ready to emit events.

```js
MTProtoProxy.on('connection',function(options){});
```

Emitted when a new client, tries to connect to the proxy.
options is an object containing the following fields:

* `address`: The IP address of the client
* `port`: The local port of the client
* `id`: connections id, an Integer number starting from zero, increamenting by one, which is used to label the connection.

```js
MTProtoProxy.on('end',function(options){});
```
Emitted when ever the user, leaves the proxy server or when an error occures.

## samplecode

```js
'use strict'

const {MTProtoProxy} = require('./mtprotoproxy');
const http = require('http');
const net = require('net');


let totalBytesRead=0;
let totalBytesWritten=0;
let totalConnections=0
let ongoingConnections=0
let stats=[];

let httpServer=http.createServer(function(req,res)
{
	res.write('<html><h1>Dear '+req.socket.remoteAddress+', Welcome; Here is the report:</h1>')
	res.end(`<h2>Statistics</h2><div>totalBytesRead: ${totalBytesRead}</div><div>totalBytesWritten: ${totalBytesWritten}</div><div>totalConnections: ${totalConnections}</div><div>ongoingConnections: ${ongoingConnections}</div><h2>Current clients:</h2><div>${Object.keys(stats).map(index=>stats[index]).join('</div><div>')}</div></html>`);
});


let telegram=new MTProtoProxy({
secret2:Buffer.from('dddddddddddddddddddddddddddddddd','hex'),
tag:Buffer.from('cae554f8cbafba5b343a2d4f72e2f8e4','hex'),
httpServer,
async filter(options)
{
	if (options.address==='8.8.8.8')
		return Promise.reject(new Error('Forbidden conuntry'));  //or simply throw error
}
});
telegram.on('ready',function()
{
	telegram.on('connection',function(options)
	{
		console.log('New client:',options);
		ongoingConnections++;
		stats[options.id]=options.address;
	});
	telegram.on('end',function(options)
	{
		console.log('Client left:',options);
		totalBytesRead+=options.bytesRead;
		totalBytesWritten+=options.bytesWritten;
		delete stats[options.id];
		totalConnections++;
		ongoingConnections--;
	})
	let proxy=net.createServer(telegram.proxy);
	proxy.on('error',function(err){console.log(err)})
	proxy.listen(2600,'0.0.0.0');
})
```
