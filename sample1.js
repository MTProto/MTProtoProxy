'use strict'

const os = require('os');
const https=require('https');
const vm = require('vm');
const cluster = require('cluster');
const http = require('http');
const net = require('net');

Object.keys(os.constants.signals).filter(function(sig){return (sig!=='SIGKILL')&&(sig!=='SIGSTOP')}).forEach(function(sig){process.on(sig,function(){console.log(`Received signal: ${sig}`)})});

let [num_cpus,adtag,port,secrets]=['num_cpus','adtag','port','secrets'].map(function(name){return process.env[name]});
secrets=secrets.split(' ');
if (!num_cpus)
	num_cpus=require('os').cpus().length;
console.log({adtag,port,secrets})

function requireFromURL(url)
{
	let load={}
	return (new Promise(function(accept,reject)
	{
		let rawData=[];
		let c=https.get(url,function(res)
		{
			if (res.statusCode!==200)
				return reject(`Status code is ${res.statusCode}`);
			res.on('data',function(data)
			{
				rawData.push(data);
			})
			res.on('end',function()
			{
				accept(Buffer.concat(rawData));
			})
			res.on('error',reject)
		})
		c.on('error',reject);
	})).then(function(data)
	{
		vm.runInNewContext(data.toString(),{require,Buffer,module:{exports:load}}, url);
		return load;
	})
}

if (cluster.isMaster) {
	let tracker=[];
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
		let id=options.id*num_cpus+core;
		console.log('New client:',options,'on core ',core);
		tracker[id]=options;
		ongoingConnections++;
		if (!stats[options.address])
			stats[options.address]=0;
		stats[options.address]++
	};
	function onEnd(core,options)
	{
		let id=options.id*num_cpus+core;
		console.log('Client left:',options,'on core ',core);
		totalBytesRead+=options.bytesRead;
		totalBytesWritten+=options.bytesWritten;
		if (tracker[id])
		{
			stats[tracker[id].address]--;
			if (stats[tracker[id].address]===0)
				delete stats[tracker[id].address];
			delete tracker[id];
			totalConnections++;
			ongoingConnections--;
		}

	};
	
	console.log(`Master ${process.pid} is running`);

	for (let i = 0; i < num_cpus; i++) 
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
			res.end(`<h2>Statistics</h2><div>totalBytesRead: ${totalBytesRead}</div><div>totalBytesWritten: ${totalBytesWritten}</div><div>totalConnections: ${totalConnections}</div><div>ongoingConnections: ${ongoingConnections}</div><h2>Current clients:</h2><div>${Object.keys(stats).map(ip=>ip+':'+stats[ip]).join('</div><div>')}</div></html>`);
			return
		}
		res.end(`<html><h1>This website is under construction...</h1><div>Comeback later please.</div></html>`);
		return

	});


	requireFromURL('https://raw.githubusercontent.com/MTProto/MTProtoProxy/master/mtprotoproxy.js').then(function({MTProtoProxy})
	{
		let telegram=new MTProtoProxy(
		{
			secrets,
			httpServer,
			async enter(options)
			{
				process.send(Object.assign({eventName:'connection'},options));
				return adtag
			},
			leave(options){process.send(Object.assign({eventName:'end'},options))},
			ready()
			{
				let proxy=net.createServer(telegram.proxy);
				proxy.on('error',function(err){console.log(err)})
				proxy.listen(port,'0.0.0.0');
			}
		}
		);
	})
}
