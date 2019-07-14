# MTProtoProxy
Fast and Simple NodeJS MTProto Proxy(Telegram Proxy) with the support of PROMOTION CHANNELS

## Table of Contents

- [Install](#install)
- [Introduction](#introduction)
- [Documentation](#documentation)
- [Sample Code](#sample-code)
- [Multi Core](#multi-core)
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
## Introduction

This module is not a tool only, it contains APIs which can be used to cusomize the Telegram MTProto proxy.
It can be used to log, limit access and create proxy farms that are very hard to filter.
It is designed to be as simple as possible and to understand and study the protocol.
This proxy containes only the secured protocol version. Please remeber that in order to use secured version of the protocol, 'dd' should be added to the secret on client side, otherwise this proxy rejects the client.

## Documentation

### Constructor

```js
const {MTProtoProxy} = require('mtprotoproxy');
let telegram=new MTProtoProxy({secrets,tag,httpServer,filter})
```
When createing a mtprotoproxy, you have to set the following options:

* `secrets`: An array of secrets that clients have to use to connect to the server. It is an array of 16 bytes length Buffer objects. (Buffers do not contain 'dd' for their first byte, although the clients have to add 'dd' to these secrets.)
* `tag`: The advertisement tag used to identify the sponser channel. Can be obtained from @mtproxybot which is an official bot from Telegram.

The following options are optional:

* `httpServer`: An instance of http.Server from NodeJS. It can be used to serve an http server on the MTProtoProxy port.
* `filter`: An async function, or a function returning a Promise. This function is called with the user address, port and can be used to limit access some of the users based on their IP address or the number of concurrent connections or their traffic quota. If it throw an error, the client will be rejected.

### Events

```js
MTProtoProxy.on('ready',function(){});
```
Emitted when the proxy has fetched all the options and ready for the clients to connect.

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
options is an object containing the following fields:

* `bytesRead`: total bytes uploaded by the client
* `bytesWritten`: total bytes downloaded by the client
* `id`: connections id, which was used previously in the `connection` event.
## Sample Code

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
secrets:[Buffer.from('dddddddddddddddddddddddddddddddd','hex')],
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

Proxy server with the support for login/logout and complete web reporter. 
```js
'use strict'

const {MTProtoProxy} = require('./mtprotoproxy2');
const http = require('http');
const net = require('net');


let totalBytesRead=0;
let totalBytesWritten=0;
let totalConnections=0
let ongoingConnections=0
let stats=[];
let allowedClients={};


let httpServer=http.createServer(function(req,res)
{
	let p=req.url.toLowerCase();
	let ip=req.socket.remoteAddress;
	if (p==='/log')
	{
		res.write(`<html><h1>Dear ${req.socket.remoteAddress}, Welcome; Here is the report:</h1>
			<head>
			<style>
			table, th, td {
			  border: 1px solid black;
			  border-collapse: collapse;
			}
			th, td {
			  padding: 5px;
			  text-align: left;    
			}
			</style>
			</head>`)
		res.end(`
			<h2>Statistics</h2>
			<div>totalBytesRead: ${totalBytesRead}</div>
			<div>totalBytesWritten: ${totalBytesWritten}</div>
			<div>totalConnections: ${totalConnections}</div>
			<div>ongoingConnections: ${ongoingConnections}</div>
			<h2>Log:</h2>
			<table style="width:100%">
			  <tr>
			    <th>Disconnected</th>
			    <th>Connection time</th>
			    <th>No</th>
			    <th>IP</th>
			    <th>PORT</th>
			    <th>Sent</th>
			    <th>Received</th>
			    <th>Error</th>
			    <th>Disconnetion time</th>
			  </tr>
			<tr>${
				stats.map(
					function(stat)
					{
						return '<td>'+Object.keys(stat).map(function(item)
						{
							if ((item==='ctime')||(item==='dtime'))
								return new Date(stat[item]).toLocaleString();
							if (item==='error')
							{
								if (!stat[item])
									return 'No error'
								return stat[item].stack;
							}
							return stat[item];
						}).join('</td><td>')
					}).join('</tr><tr>')+'</td>'
			}</tr></table></html>`);
		return
	}
	if (p==='/clients')
	{
		res.write('<html><h1>Dear '+req.socket.remoteAddress+', Welcome; Here are the clients:</h1>')
		res.end(`<h2>Statistics</h2><div>totalBytesRead: ${totalBytesRead}</div><div>totalBytesWritten: ${totalBytesWritten}</div><div>totalConnections: ${totalConnections}</div><div>ongoingConnections: ${ongoingConnections}</div><h2>Current clients:</h2><div>${Object.keys(stats).filter(function(index){return !stats[index].ended}).map(index=>stats[index].address).join('</div><div>')}</div></html>`);
		return
	}
	if (p==='/login')
	{
		allowedClients[ip]=+new Date();
		res.end(`<html><h1>Dear user ${ip}</h1><div>You logged in...</div></html>`);
		return
	}
	if(p==='/logout')
	{
		delete allowedClients[ip];
		res.end(`<html><h1>Dear user ${ip}</h1><div>You logged out...</div></html>`);
		return
	}
	res.end(`<html><h1>This website is under construction...</h1><div>Comeback later please.</div></html>`);
	return

});


let telegram=new MTProtoProxy(
	{
		secrets:[Buffer.from('dddddddddddddddddddddddddddddddd','hex')],
		tag:   Buffer.from('cae554f8cbafba5b343a2d4f72e2f8e4','hex'),
		httpServer,
		async filter(options)
		{
			if ((allowedClients[options.address])&&((+new Date()-allowedClients[options.address])<3*3600*1000))
			{
				allowedClients[options.address]=+new Date();
				return Promise.resolve()
			}
			else
			{
				delete allowedClients[options.address]
				return Promise.reject(new Error('Forbidden conuntry'));  //or simply throw error
			}
		}
	}
);
telegram.on('ready',function()
{
	telegram.on('connection',function(options)
	{
		console.log('New client:',options);
		ongoingConnections++;
		stats[options.id]=Object.assign({ended:false,ctime: +new Date()},options);
	});
	telegram.on('end',function(options)
	{
		console.log('Client left:',options);
		allowedClients[options.address]=+new Date();
		totalBytesRead+=options.bytesRead;
		totalBytesWritten+=options.bytesWritten;
		Object.assign(stats[options.id],options);
		stats[options.id].ended=true;
		stats[options.id].dtime=+new Date();
		totalConnections++;
		ongoingConnections--;
	})
	let proxy=net.createServer(telegram.proxy);
	proxy.on('error',function(err){console.log(err)})
	proxy.listen(8080,'0.0.0.0');
})
```

## Multi Core

NodeJS runs on one core. If you want to take the advantage of clustering on multiple processes, you have to fork the process and implement all the messaging between Mater and Workers. The following code is a sample of implementation for the support of clustering.

```js
'use strict'
const cluster = require('cluster');
const numCPUs = 4;//require('os').cpus().length;
const {MTProtoProxy} = require('./mtprotoproxy2');
const http = require('http');
const net = require('net');

console.log('Started');

if (cluster.isMaster) {
	let totalBytesRead=0;
	let totalBytesWritten=0;
	let totalConnections=0
	let ongoingConnections=0
	let stats={};
	function fetch(workerId,options)
	{
		cluster.workers[workerId].send(Object.assign(
			{totalBytesRead,totalBytesWritten,totalConnections,ongoingConnections,stats}
			,options));
	}
	function onConnection(core,options)
	{
		console.log('New client:',options,'on core ',core);
		ongoingConnections++;
		stats[options.id+':'+core]=options.address;
	};
	function onEnd(core,options)
	{
		console.log('Client left:',options,'on core ',core);
		totalBytesRead+=options.bytesRead;
		totalBytesWritten+=options.bytesWritten;
		delete stats[options.id+':'+core];
		totalConnections++;
		ongoingConnections--;
	};
	
	console.log(`Master ${process.pid} is running`);

	for (let i = 0; i < numCPUs; i++) 
	{
		cluster.fork();
	}

	cluster.on('exit', function(worker, code, signal) 
	{
		console.log(`worker ${worker.process.pid} died`);
	});

	for (const id in cluster.workers) 
	{
		(function(id)
		{
			cluster.workers[id].on('message', function(message)
				{
					let {eventName}=message;
					delete message.eventName;
					if (eventName==='end')
					{
						onEnd(id,message);
						return
					}
					if (eventName==='connection')
					{
						onConnection(id,message);
						return
					}
					if (eventName==='fetch')
					{
						fetch(id,message);
						return
					}
				});
		})(id);
	}
}
else
{
	console.log('Slave is running')
	let rid=0;
	let queue={};
	process.on('message',function(options)
	{
		let cb;
		let rid=options.rid;
		delete options[rid];
		if (cb=queue[rid])
		{
			cb(options);
		}
	})

	function fetch()
	{
		let id=rid;
		rid++;
		process.send({eventName:'fetch',rid:id});
		return new Promise(function(accept,reject)
		{
			queue[id]=accept;
			setTimeout(reject,1000,new Error('No reply from Master'));
		}).then(function(ret){delete queue[id];return ret},function(){delete queue[id];return ret})
	}

	let httpServer=http.createServer(async function(req,res)
	{
		let {totalBytesRead,totalBytesWritten,totalConnections,ongoingConnections,stats}=await fetch();
		let p=req.url.toLowerCase();
		let ip=req.socket.remoteAddress;
		if (p==='/clients')
		{
			res.write('<html><h1>Dear '+req.socket.remoteAddress+', Welcome; Here are the clients:</h1>')
			res.end(`<h2>Statistics</h2><div>totalBytesRead: ${totalBytesRead}</div><div>totalBytesWritten: ${totalBytesWritten}</div><div>totalConnections: ${totalConnections}</div><div>ongoingConnections: ${ongoingConnections}</div><h2>Current clients:</h2><div>${Object.keys(stats).map(index=>index+':'+stats[index]).join('</div><div>')}</div></html>`);
			return
		}
		res.end(`<html><h1>This website is under construction...</h1><div>Comeback later please.</div></html>`);
		return

	});


	let telegram=new MTProtoProxy(
		{
			secrets:[Buffer.from('dddddddddddddddddddddddddddddddd','hex')],
			tag:   Buffer.from('cae554f8cbafba5b343a2d4f72e2f8e4','hex'),
			httpServer,
			async filter(){}
		}
	);
	telegram.on('ready',function()
	{
		telegram.on('connection',function(options)
		{
			process.send(Object.assign({eventName:'connection'},options));
		});
		telegram.on('end',function(options)
		{
			process.send(Object.assign({eventName:'end'},options));
		})
		let proxy=net.createServer(telegram.proxy);
		proxy.on('error',function(err){console.log(err)})
		proxy.listen(8080,'0.0.0.0');
	})
}
```
