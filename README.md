# MTProtoProxy
Fast and Simple NodeJS MTProto Proxy(Telegram Proxy) with the support of PROMOTION CHANNELS, Secured Connection and Fake TLS.

## Table of Contents
- [Fast setup](#fast-setup)
- [Install](#install)
- [Introduction](#introduction)
- [Documentation](#documentation)
- [Sample Code](#sample-code)
- [Multi Core](#multi-core)
- [Todo](#todo)

## Fast setup

If you do not want to write any program, if you do not khow about NodeJS, if you have not installed nodejs, 
but you want to serve a proxy server, first run the following command in the bash:

```sh
wget -c https://raw.githubusercontent.com/MTProto/MTProtoProxy/master/fastsetup.sh
```
then edit ./fastsetup.sh by entering 
```sh
nano ./fastsetup.sh
```
Just edit the following lines with your desired options (sercrets are separated by space, each of which is 34 hexadecimal character and starts with eighter 'ee' or 'dd'. 'ee' means the proxy is fake TLS, remember when you publish fake TLS proxies, you have to add TLS to the secret, i. e. if your secret here is ee00000000000000000000000000000000 you have to publish it with ee00000000000000000000000000000000676f6f676c652e636f6d as secret where 676f6f676c652e636f6d is hexadecimal representation of 'google.com')
```sh
export adtag=cae554f8cbafba5b343a2d4f72e2f8e4
export port=5050
export secrets='dd00000000000000000000000000000000 ee00000000000000000000000000000000'
export num_cpus=4
```
Save the file, and run it by entering
```sh
bash ./fastsetup.sh
```
For the report, surf the address: http://YOURIP:PORT/clients

To stop the proxy, find the process id of your server by entering:

```sh
ps aux | grep node
```
and then kill the desired process using kill command.

Skip reading the rest of the document!!!! Your proxy is ready!!!

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
This proxy contains the secured protocol and Fake TLS version. Unsecured protocol is not supported. Please remeber that in order to use secured version of the protocol, secret should be started with 'dd' and for Fake TLS protocol, secret should be started with 'ee'.
## Documentation

### Constructor

```js
const {MTProtoProxy} = require('mtprotoproxy');
let telegram=new MTProtoProxy({secrets,httpServer,enter,leave,ready})
```
When creating a mtprotoproxy, you have to set the following options:

* `secrets`: An array of secrets that clients have to use to connect to the server. It is an array of 34 character length strings. (Strings should start eighter with 'dd' or 'ee'; when publishing proxies having their secret start with 'ee' you have to manually add SNI name to the end of the proxy. i. e. if your secret inside the program is ee00000000000000000000000000000000 you have to publish your secret as ee00000000000000000000000000000000676F6F676C652E636F6D which 676F6F676C652E636F6D is the hex decoded presentation of 'google.com' and is called SNI)
* `enter`: An async function, or a function returning a Promise. This function is called with the user address, port (user's local port), id, secretIndex (which is the index of the secret that client used to connect to proxy) and SNI (in the case of fake TLS proxies). 

	* `address`: The IP address of the client
	* `port`: The local port of the client
	* `id`: connections id, an Integer number starting from zero, increamenting by one, which is used to label the connection.
	* `secretIndex`: is the index of the secret that client used to connect to proxy
	* `SNI`: SNI in the case of fake TLS proxies,

This data can be used to limit the access of users based on their IP address or the number of concurrent connections or their traffic quota. If it throw an error, the client will be rejected. This function should return AD_TAG which is The advertisement tag used to identify the sponser channel. Can be obtained from @mtproxybot which is an official bot from Telegram. It means that based on the user's IP address, secret and SNI, this function can decide to change advertisement tag. Please note that the rapid change of AD_TAG for a specific user, will cause the telegram client not to show the advertisement.
* `leave`: A function that is called when ever the user leaves the proxy server or when an error occures.
options is an object containing the following fields:

	* `bytesRead`: total bytes uploaded by the client
	* `bytesWritten`: total bytes downloaded by the client
	* `id`: connections id, which was used previously in the `enter` async function.
	* `error`: error, the reason that connection was closed.
* `ready`: A function that is called when the proxy has fetched all the options and ready for the clients to connect.



The following options are optional:
* `httpServer`: An instance of http.Server from NodeJS. It can be used to serve an http server on the MTProtoProxy port.

## Sample Code

```js
'use strict'

const {MTProtoProxy} = require('mtprotoproxy');
const http = require('http');
const net = require('net');
let ad_tag='cae554f8cbafba5b343a2d4f72e2f8e4'

let totalBytesRead=0;
let totalBytesWritten=0;
let totalConnections=0
let ongoingConnections=0
let stats=[];
let tracker=[];

let httpServer=http.createServer(function(req,res)
{
	res.write('<html><h1>Dear '+req.socket.remoteAddress+', Welcome; Here is the report:</h1>')
	res.end(`<h2>Statistics</h2><div>totalBytesRead: ${totalBytesRead}</div><div>totalBytesWritten: ${totalBytesWritten}</div><div>totalConnections: ${totalConnections}</div><div>ongoingConnections: ${ongoingConnections}</div><h2>Current clients:</h2><div>${Object.keys(stats).map(address=>`${address}:${stats[address]}`).join('</div><div>')}</div></html>`);
});


let telegram=new MTProtoProxy({
secrets:['dd00000000000000000000000000000000','ee00000000000000000000000000000000'],
httpServer,
async enter(options)
{
	tracker[options.id]=options;
	console.log('New client:',options);
	ongoingConnections++;
	if (stats[options.address])
		stats[options.address]++;
	else
		stats[options.address]=1;
	if (options.address==='8.8.8.8')
		return Promise.reject(new Error('Forbidden conuntry'));  //or simply throw error
	return ad_tag;
},
leave(options)
{
	console.log('Client left:',options);
	totalBytesRead+=options.bytesRead;
	totalBytesWritten+=options.bytesWritten;
	stats[tracker[options.id].address]--;
	if (stats[tracker[options.id].address]===0)
		delete stats[tracker[options.id].address];
	totalConnections++;
	ongoingConnections--;
	delete tracker[options.id]
},
ready()
{
	console.log('ready')
	let proxy=net.createServer(telegram.proxy);
	proxy.on('error',function(err){console.log(err)})
	proxy.listen(2500,'0.0.0.0');
}
});
```

Proxy server with the support for login/logout and complete web reporter. 
```js
'use strict'

const {MTProtoProxy} = require('mtprotoproxy');
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
		secrets:['dd00000000000000000000000000000000'],
		httpServer,
		async enter(options)
		{

			console.log('New client:',options);
			ongoingConnections++;
			stats[options.id]=Object.assign({ended:false,ctime: +new Date()},options);
			if ((allowedClients[options.address])&&((+new Date()-allowedClients[options.address])<3*3600*1000))
			{
				allowedClients[options.address]=+new Date();
				return Promise.resolve()
			}
			else
			{
				delete allowedClients[options.address]
				return Promise.reject(new Error('Forbidden user'));  //or simply throw error
			}
			return 'cae554f8cbafba5b343a2d4f72e2f8e4';
		},
		ready()
		{
			let proxy=net.createServer(telegram.proxy);
			proxy.on('error',function(err){console.log(err)})
			proxy.listen(8080,'0.0.0.0');
		},
		leave(options)
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
		}
	}
);
```

## Multi Core

NodeJS runs on one core. If you want to take the advantage of clustering on multiple processes, you have to fork the process and implement all the messaging between Master and Workers. The following code is a sample of implementation for the support of clustering.

```js
'use strict'
const cluster = require('cluster');
const numCPUs = 4;//require('os').cpus().length;
const {MTProtoProxy} = require('mtprotoproxy');
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
			secrets:['ee00000000000000000000000000000000'],
			httpServer,
			async enter(options)
			{
				process.send(Object.assign({eventName:'connection'},options));
				return 'cae554f8cbafba5b343a2d4f72e2f8e4'
			},
			leave(options){process.send(Object.assign({eventName:'end'},options))},
			ready()
			{
				let proxy=net.createServer(telegram.proxy);
				proxy.on('error',function(err){console.log(err)})
				proxy.listen(8080,'0.0.0.0');
			}
		}
	);
}
```
