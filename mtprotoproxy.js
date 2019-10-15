'use strict'

const net = require('net');
const https =require('https');
const crypto = require('crypto');

function rp(url)
{
	return new Promise(function(accept,reject)
	{
		let rawData=[];
		let c=https.get(url,function(res)
		{
			if (res.statusCode!==200)
				reject(new Error(`Status code is ${res.statusCode}`));
			res.on('data',function(ret)
			{
				rawData.push(ret);
			})
			res.on('end',function()
			{
				accept(Buffer.concat(rawData));
			})
		})
		c.on('error',reject);
	})
}

let TABLE=new Uint32Array(256)
Buffer.from([
'AAAAAJYwB3csYQ7uulEJmRnEbQeP9GpwNaVj6aOVZJ4yiNsOpLjceR7p1eCI2dKXK0y2Cb18sX4HLbjn',
'kR2/kGQQtx3yILBqSHG5895BvoR91Noa6+TdbVG11PTHhdODVphsE8Coa2R6+WL97Mllik9cARTZbAZj',
'Yz0P+vUNCI3IIG47XhBpTORBYNVycWei0eQDPEfUBEv9hQ3Sa7UKpfqotTVsmLJC1sm720D5vKzjbNgy',
'dVzfRc8N1txZPdGrrDDZJjoA3lGAUdfIFmHQv7X0tCEjxLNWmZW6zw+lvbieuAIoCIgFX7LZDMYk6Qux',
'h3xvLxFMaFirHWHBPS1mtpBB3HYGcdsBvCDSmCoQ1e+JhbFxH7W2BqXkv58z1LjooskHeDT5AA+OqAmW',
'GJgO4bsNan8tPW0Il2xkkQFcY+b0UWtrYmFsHNgwZYVOAGLy7ZUGbHulARvB9AiCV8QP9cbZsGVQ6bcS',
'6ri+i3yIufzfHd1iSS3aFfN804xlTNT7WGGyTc5RtTp0ALyj4jC71EGl30rXldg9bcTRpPv01tNq6WlD',
'/NluNEaIZ63QuGDacy0EROUdAzNfTAqqyXwN3TxxBVCqQQInEBALvoYgDMkltWhXs4VvIAnUZrmf5GHO',
'DvneXpjJ2SkimNCwtKjXxxc9s1mBDbQuO1y9t61susAgg7jttrO/mgzitgOa0rF0OUfV6q930p0VJtsE',
'gxbccxILY+OEO2SUPmptDahaanoLzw7knf8JkyeuAAqxngd9RJMP8NKjCIdo8gEe/sIGaV1XYvfLZ2WA',
'cTZsGecGa252G9T+4CvTiVp62hDMSt1nb9+5+fnvvo5DvrcX1Y6wYOij1tZ+k9GhxMLYOFLy30/xZ7vR',
'Z1e8pt0GtT9LNrJI2isN2EwbCq/2SgM2YHoEQcPvYN9V32eo745uMXm+aUaMs2HLGoNmvKDSbyU24mhS',
'lXcMzANHC7u5FgIiLyYFVb47usUoC72yklq0KwRqs1yn/9fCMc/QtYue2Swdrt5bsMJkmybyY+yco2p1',
'CpNtAqkGCZw/Ng7rhWcHchNXAAWCSr+VFHq44q4rsXs4G7YMm47Skg2+1eW379x8Id/bC9TS04ZC4tTx',
'+LPdaG6D2h/NFr6BWya59uF3sG93R7cY5loIiHBqD//KOwZmXAsBEf+eZY9prmL40/9rYUXPbBZ44gqg',
'7tIN11SDBE7CswM5YSZnp/cWYNBNR2lJ23duPkpq0a7cWtbZZgvfQPA72DdTrrypxZ673n/Pskfp/7Uw',
'HPK9vYrCusowk7NTpqO0JAU20LqTBtfNKVfeVL9n2SMuemazuEphxAIbaF2UK28qN74LtKGODMMb3wVa',
'je8CLQ=='].join(),'base64').copy(Buffer.from(TABLE.buffer));

function crc32(buf, previous) {
  let crc = ~~previous ^ -1;
  for (let index = 0; index < buf.length; index++) {
    const byte = buf[index];
    crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1
}



const TLS_START_BYTES = Buffer.from('1603010200010001fc0303','hex');
const MAX_CHUNK_SIZE = 16384 + 24;

const firstPart =Buffer.from('1603030000020000000303000000000000000000000000000000000000000000000000000000000000000000','hex');
const secondPart=Buffer.from('130100002e00330024001d00200000000000000000000000000000000000000000000000000000000000000000002b000203041403030001011703030000','hex')
const PROXY_INFO_ADDR   = 'https://core.telegram.org/getProxyConfig';
const PROXY_SECRET_ADDR = 'https://core.telegram.org/getProxySecret';
const PUBLIC_IP_ADDR = 'https://api.ipify.org/';

let globaleIndex=0;
let secured_secrets,tls_secrets;
//let AD_TAG;
const CON_TIMEOUT= 5 * 60 * 1000;

let PROXY_SECRET;
let PROXY_SECRET_HEADER;
let my_ip;
let dc;

Array.prototype.removeItem=function(item)
{
	let array=this;
	var index = array.indexOf(item);
	if (index > -1) {
	  array.splice(index, 1);
	}
}

Number.prototype.toBuffer=function(bytes)
{
	if (bytes===2)
	{
		let ret=Buffer.alloc(2);
		ret.writeUInt16LE(this.valueOf())
		return ret;
	}
	else
	{
		let ret=Buffer.alloc(4);
		ret.writeInt32LE(this.valueOf());
		return ret;
	}
};

function assertit(check,msg)
{
	if (!msg)
		msg='';
	if (!check)
		throw new Error('Assertion failed: '+msg);
}

function refreshProxyInfo()
{
	return Promise.all([PROXY_INFO_ADDR,PROXY_SECRET_ADDR,PUBLIC_IP_ADDR].map(function(url)
	{
		return rp(url)
	})).then(function(arr)
	{
		PROXY_SECRET=arr[1];
		PROXY_SECRET_HEADER=PROXY_SECRET.slice(0,4);
		dc=[];
		let id;
		var str=arr[0].toString();
		var re = /proxy_for\s+(-?\d+)\s+(.+):(\d+)\s*;/g;
		let m;
		while (m = re.exec(str))
		{
			id=m[1];
			if (!dc[id])
				dc[id]=[];
			dc[id].push({host:m[2],port:m[3]})
			serverPool[id]=[];
		};
		my_ip = Buffer.from(arr[2].toString().split('.'));
		fillPool();
	}).catch(refreshProxyInfo);
};

let serverPool=[];

function fillPool()
{
	Object.keys(dc).forEach(function(dcId)
	{
		for(let i=0;i<5;i++)
		{
			getServer(dcId).then(function(s)
			{
				serverPool[dcId].push(s);
			})	
		}
	})
}


function getFromPool(dcId)
{
	let server=serverPool[dcId].shift();
	if (!server)
	{
		return getServer(dcId);
	}

	getServer(dcId).then(function(s)
	{
		serverPool[dcId].push(s);
	})

	return server;
}

function getServer(dcId)
{ 
	return new Promise(function(accept,reject)
	{
		let server = net.createConnection(dc[dcId].chooseOne());
		server.on('connect',async function()
		{
			extendSocket(server,'server');
			server.setTimeout(CON_TIMEOUT);
			const RPC_NONCE = Buffer.from('aa87cb7a','hex');
			const RPC_HANDSHAKE = Buffer.from('f5ee8276','hex');
			const RPC_FLAGS = Buffer.from('00000000','hex'); //    # pass as consts to simplify code
		    const CRYPTO_AES = (1).toBuffer();
		    const SENDER_PID = Buffer.from('IPIPPRPDTIME');
		    const PEER_PID = Buffer.from('IPIPPRPDTIME');

		    let my_port=server.localPort;
			let options=
			{
				client:
				{
					ip: Buffer.from(my_ip).reverse(), 
					port: my_port.toBuffer(2), 
					ts: Math.floor(Date.now()/1000).toBuffer(),
					nonce: crypto.randomBytes(16)
				},
				server:
				{
					ip: Buffer.from(server.remoteAddress.IPtoBuffer()).reverse(),
					port: server.remotePort.toBuffer(2),
				},
				middleproxy_secret: PROXY_SECRET
			};

			server.beginWriteCRC();
			server.bufferedWrite(Buffer.concat([(44).toBuffer(),(-2).toBuffer(),RPC_NONCE,PROXY_SECRET_HEADER,CRYPTO_AES,options.client.ts,options.client.nonce]));
			server.endWriteCRC();
			server.bufferedWrite((4).toBuffer()); //->48 ->Multiplier of 16
			let msg_len;
			do
			{
				server.beginReadCRC();
				let  msg_len_bytes = await server.bufferedReadExactly(4);
				msg_len = msg_len_bytes.readInt32LE();
			} while (msg_len===4);
			assertit(msg_len===44);
			await server.bufferedReadAssert(-2);
			await server.bufferedReadAssert(RPC_NONCE);
			await server.bufferedReadAssert(PROXY_SECRET_HEADER);
			await server.bufferedReadAssert(CRYPTO_AES);
			options.server.ts = await server.bufferedReadExactly(4);
			options.server.nonce = await server.bufferedReadExactly(16);
			await server.endReadCRC();
			let [encryptkey,decryptkey]=get_middleproxy_aes_key_and_iv(options);
			let encoder=createAESCBCTransform(encryptkey,false);
			let decoder=createAESCBCTransform(decryptkey,true);
			server.addCryptoLayer({decoder,encoder})
			server.beginWriteCRC();
			server.bufferedWrite(Buffer.concat([(44).toBuffer(),(-1).toBuffer(),RPC_HANDSHAKE, RPC_FLAGS, SENDER_PID, PEER_PID]));
			server.endWriteCRC();
			server.bufferedWrite((4).toBuffer());
			do
			{
				server.beginReadCRC();
				let msg_len_bytes = await server.bufferedReadExactly(4);
				msg_len = msg_len_bytes.readInt32LE();
			} while (msg_len===4);
			assertit(msg_len===44);
			await server.bufferedReadAssert(-1)
			await server.bufferedReadAssert(Buffer.concat([RPC_HANDSHAKE, RPC_FLAGS]))
			let handshake_sender_pid = server.bufferedReadExactly(12);
			await server.bufferedReadAssert(SENDER_PID);
			await server.endReadCRC();
			await server.bufferedReadAssert(4);
			server.on('finished',function(){serverPool[dcId].removeItem(server)});
			accept(server);
		});
		server.on('error',function(err)
		{
			reject(err);
		})
	}).catch(function()
	{
		return getServer(dcId);
	})
}

function get_middleproxy_aes_key_and_iv({client,server,middleproxy_secret})
{
    return ([Buffer.from('CLIENT'),Buffer.from('SERVER')].map(function(purpose)
    {
    	let s = Buffer.concat([server.nonce, client.nonce, client.ts, server.ip, client.port, purpose, client.ip, server.port, middleproxy_secret, server.nonce, client.nonce]);
		return {
		    key : Buffer.concat([crypto.createHash('md5').update(s.slice(1)).digest().slice(0,12), crypto.createHash('sha1').update(s).digest()]),
		    iv : crypto.createHash('md5').update(s.slice(2)).digest()
		}
    }))
}

Array.prototype.chooseOne=function()
{
	if (this.length===0)
		return null;
	let i=Math.floor(this.length*Math.random());
	return this[i];
}


String.prototype.IPtoBuffer=function()
{
	return Buffer.from(this.split('.'));
}

let extendedSocket=
{
	startBuffering(name)
	{
		let self=this;
		self.autoWrite=true;
		self.setOutputBufferLength=function(){};
		self.outputBuffers=[];
		self.localName=name;
		self.writeCRCval=0x00000000;
		self.readCRCval=0x00000000;
		self.newDataCallback=function(){};
		self.errorCallback=function(){};
		self.inputBuffer=Buffer.alloc(0);
		self.cryptoLayers=[];
		self.on('data',function(data){try{self.ondata.call(self,data)}catch(e){self.emit('finished',e)}}); //why
		self.on('timeout',function(){self.emit('finished',new Error(`${self.localName} timedout`))})
		self.on('end'  ,function()		{self.emit('finished',new Error(`${self.localName} ended`))});
		self.on('error',function(err)	{self.emit('finished',err)});
		self.once('finished',function(err){self.end();self.errorCallback(err);self.setErrorHandler=function(handler){throw err}})
	},
	addCryptoLayer(layer)
	{
		this.cryptoLayers.push(layer);
		let {decoder}=layer
		if (this.inputBuffer.length>0)
			this.inputBuffer=decoder(this.inputBuffer);
	},
	setErrorHandler(handler)
	{
		if (handler)
			this.errorCallback=handler;
	},
	bufferedWrite(data)
	{
		if (data.length===0)
			return
		this.writeCRCval = crc32(data,this.writeCRCval);
		for (let layer of this.cryptoLayers.slice().reverse())
			data=layer.encoder(data);
		if (data.length!==0)
		{
			if (this.autoWrite)
				this.write(data)
			else
				this.outputBuffers.push(data);
		}
	},
	flushBuffer()
	{
		this.write(Buffer.concat(this.outputBuffers));
		this.outputBuffers=[];
	},
	beginWriteCRC()
	{
		this.writeCRCval=0x00000000;
	},
	endWriteCRC()
	{
		let ret=Buffer.alloc(4);
		ret.writeInt32LE(this.writeCRCval);
		this.writeCRCval=0x00000000;
		this.bufferedWrite(ret);
	},
	beginReadCRC()
	{
		this.readCRCval=0x00000000;
	},
	async endReadCRC()
	{
		let ret=Buffer.alloc(4);
		ret.writeInt32LE(this.readCRCval);
		this.readCRCval=0x00000000;
		return this.bufferedReadAssert(ret)
	},
	ondata(data)
	{
		for (let layer of this.cryptoLayers)
			data=layer.decoder(data);

		if (data.length===0)
			return
		this.inputBuffer=Buffer.concat([this.inputBuffer,data]);
		this.newDataCallback();
	},
	waitForNewData()
	{
		let self=this;
		if (self.idling)
			self.idling();
		return new Promise(function(accept,reject)
		{
			self.newDataCallback=accept;
			self.setErrorHandler(reject);
		});
	},
	async bufferedRead()
	{
		let data;
		if (this.inputBuffer.length===0)
		{
			await this.waitForNewData();
		}
		data=this.inputBuffer;
		this.inputBuffer=Buffer.alloc(0);
		this.readCRCval=crc32(data,this.readCRCval)
		return data;
	},
	async bufferedReadExactly(len)
	{
		let data;
		while (this.inputBuffer.length<len)
		{
			await this.waitForNewData();
		}
		data=this.inputBuffer.slice(0,len);
		this.inputBuffer=this.inputBuffer.slice(len);
		this.readCRCval=crc32(data,this.readCRCval)
		return data;
	},
	async bufferedReadAtmost(len)
	{
		let data;
		if (this.inputBuffer.length===0)
		{
			await this.waitForNewData();
		}
		len=Math.min(len,this.inputBuffer.length);
		data=this.inputBuffer.slice(0,len);
		this.inputBuffer=this.inputBuffer.slice(len);
		this.readCRCval=crc32(data,this.readCRCval)
		return data;
	},
	async bufferedReadInt()
	{
		return (await this.bufferedReadExactly(4)).readInt32LE();
	},
	async bufferedReadAssert(data,msg)
	{
		if (!msg)
			msg='';
		if (Buffer.isBuffer(data))
		{
			if (Buffer.compare(data,await this.bufferedReadExactly(data.length))!==0)
				return Promise.reject(new Error('Assertion failed: '+msg));
		}
		else
		{
			if (data!==(await this.bufferedReadInt()))
				return Promise.reject(new Error('Assertion failed: '+msg));
		}
	}
}

function extendSocket(socket,name)
{
	Object.assign(socket,extendedSocket);
	socket.startBuffering(name);
}

function createAESCBCTransform({key,iv},mode)
{
	let cr;
	let bufferedData=Buffer.alloc(0);
	if (!mode)
		cr = crypto.createCipheriv('aes-256-cbc', key, iv)
	else
		cr = crypto.createDecipheriv('aes-256-cbc', key, iv)
	cr.setAutoPadding(false);

	return (function(data)
		{
			data=Buffer.concat([bufferedData,data]); 
			let len=data.length;
			let pos=(len % 16)
			bufferedData=data.slice(len-pos);
			data=data.slice(0,len-pos); 
			return cr.update(data)
		});
}

function createAESCTRTransform({key,iv},mode)
{
	let cr;
	if (!mode)
		cr = crypto.createCipheriv('aes-256-ctr', key, iv);
	else
		cr = crypto.createDecipheriv('aes-256-ctr', key, iv);
	return ((data)=>cr.update(data));
}


async function handleClient(client,filter,id)
{
	let currentSecret;
	let isTLS=false;
	let AD_TAG
	client.setKeepAlive(true);
	client.setNoDelay();
	client.setTimeout(5000);
	let cl_ip 	=Buffer.from(client.remoteAddress.split('.'));
	let cl_port =client.remotePort;
	extendSocket(client,'client');
	let h1=await client.bufferedReadExactly(64);
	if (h1.compare(TLS_START_BYTES,0,11,0,11)===0)
	{
		isTLS=true
		//await client.bufferedReadAssert(TLS_START_BYTES);
		let h2=await client.bufferedReadExactly(453);
		let handshake=Buffer.concat([h1,h2]);
		let sni_length=handshake.readUInt8(128);
		let SNI=handshake.slice(129,129+sni_length).toString();
		let d=handshake.slice(11, 11 + 32);
		let digest=Buffer.from(d);
		d.fill(0);
		let isOK=false;
		let mainPacket;
		for (let secret of tls_secrets)
		{
			let computed_digest=crypto.createHmac('sha256', secret.secret).update(handshake).digest();
			if (computed_digest.compare(digest,0,28,0,28)!==0)
				continue
			let timestamp=computed_digest.readUInt32LE(28)^digest.readUInt32LE(28);
			let lag=timestamp-Math.floor(Date.now()/1000);
			if (Math.abs(lag)>60*10)
				continue

			let sess_id_len = handshake[11];
	    	let sess_id = handshake.slice(11, 11 + sess_id_len);
			let fake_cert_len=1024+Math.floor(3*1024*Math.random());
			let http_data = crypto.randomBytes(fake_cert_len);

	    	let p1=Buffer.from(firstPart);
	    	let p2=Buffer.from(secondPart);
	    	p1.writeUInt16BE(90+sess_id_len,3);
	    	p1.writeUInt32BE(86+sess_id_len,5);
	    	p1.writeUInt8(2,5);
	    	p1.writeUInt8(sess_id_len,43);
	    	crypto.randomBytes(32).copy(p2,13); //x25519_public_key
	    	p2.writeUInt16BE(fake_cert_len,60);
	    	let dd=Buffer.concat([digest,p1,sess_id,p2,http_data]);
	    	mainPacket=dd.slice(32);
	    	let digestPlaceHolder=mainPacket.slice(11);
	    	crypto.createHmac('sha256', secret.secret).update(dd).digest().copy(digestPlaceHolder)

	        isOK=true;
	        currentSecret=secret;
	        break;
		}
		

		assertit(isOK,'No matching secret found')
		AD_TAG=await filter({id,address:client.remoteAddress,port:client.remotePort,secretIndex:currentSecret.index,SNI});
		client.bufferedWrite(mainPacket)
		client.addCryptoLayer(
			(function()
			{
				let cache=Buffer.alloc(0);
				let remainingLen1=0;
				let remainingLen2=0;
				let remainingPacketLen=0;
				let readingHeader=true;
				let skip=false;
				client.setOutputBufferLength=function(bufferLen)
				{
					//len=remainingLen+remainingPacketLen
					assertit(remainingLen2===0);
					assertit(remainingPacketLen===0)
					remainingLen2=bufferLen;
					remainingPacketLen=0;
				}
				return {
					decoder(msg)
					{
						msg=Buffer.concat([cache,msg]);
						let out=Buffer.alloc(0);
						while(true)
						{
							if (msg.length===0)
								return out;

							if (readingHeader)
							{
								if (msg.length<5)
								{
									cache=msg;
									return out
								}
								assertit([0x14,0x17].includes(msg[0]));
								assertit(msg[1]===0x03);
								assertit(msg[2]===0x03);
								
								skip=(msg.readUInt8()===0x14);
								remainingLen1=msg.readUInt16BE(3);
								msg=msg.slice(5);
								readingHeader=false;
							}
							if (remainingLen1<=msg.length)
							{
								if (!skip)
									out=Buffer.concat([out,msg.slice(0,remainingLen1)]);
								msg=msg.slice(remainingLen1);
								readingHeader=true;
							}
							else
							{
								remainingLen1-=msg.length;
								if (!skip)
									out=Buffer.concat([out,msg]);
								return out;
							}
						}
					},
					encoder(msg)
					{
						let out=Buffer.alloc(0);
						while (msg.length>0)
						{
							if (remainingLen2+remainingPacketLen===0)
								throw new Error('No remaining Len');
							if (remainingPacketLen===0)
							{
								let p=Math.min(remainingLen2,MAX_CHUNK_SIZE);
								remainingLen2-=p;
								remainingPacketLen+=p;
								let header=Buffer.from('1703030000','hex');
								header.writeUInt16BE(p,3);
								out=Buffer.concat([out,header]);
							}
							let q=Math.min(msg.length,remainingPacketLen);
							out=Buffer.concat([out,msg.slice(0,q)]);
							remainingPacketLen-=q;
							msg=msg.slice(q);
						}
						return out
					}
				}
			})());
		h1=await client.bufferedReadExactly(64);
	}

	let skip = h1.slice(0,8);
	let dec_prekey_and_iv = h1.slice(8,56);
	let dec_proto_tag = h1.slice(56,60);
	let dec_dcId = h1.slice(60,62);
	let trailing = h1.slice(62,64);

	let enc_prekey_and_iv = Buffer.from(dec_prekey_and_iv).reverse();
	let dec = {prekey : dec_prekey_and_iv.slice(0,32),iv : dec_prekey_and_iv.slice(32)}
	let enc = {prekey : enc_prekey_and_iv.slice(0,32),iv : enc_prekey_and_iv.slice(32)}
	let decoder,encoder;
	let permission=false;
	let s=isTLS?[currentSecret]:secured_secrets;
	for (let secret of s)
	{
		dec.key = crypto.createHash('sha256').update(Buffer.concat([dec.prekey, secret.secret])).digest();
		enc.key = crypto.createHash('sha256').update(Buffer.concat([enc.prekey, secret.secret])).digest();
		decoder = createAESCTRTransform(dec,true);
		encoder = createAESCTRTransform(enc,false);
		decoder(skip);
		decoder(dec_prekey_and_iv);
		let proto_tag = decoder(dec_proto_tag);
		if (proto_tag.compare(Buffer.from('dddddddd','hex'))!==0)
			continue;
		permission=true;
		currentSecret=secret;
		break;
	}

	assertit(permission,'No matching secret');
	let dcId = decoder(dec_dcId).readInt16LE();
	assertit(dcId>=-5);
	assertit(dcId<=5);
	assertit(dcId!==0);
	decoder(trailing);
	if (!isTLS)
		AD_TAG=await filter({id,address:client.remoteAddress,port:client.remotePort,secretIndex:currentSecret.index});
	client.addCryptoLayer({decoder,encoder})
	let server=await getFromPool(dcId);
	server.setNoDelay();
	client.once('finished',function(err)
	{
		server.emit('finished',err);
	})
	server.once('finished',function(err)
	{
		client.emit('finished',err);
	})

	server.autoWrite=false;
	client.autoWrite=false;
	server.idling=function()
	{
		client.flushBuffer();
	}
	client.idling=function()
	{
		server.flushBuffer();
	}

	let out_conn_id = crypto.randomBytes(8); //CHeck
	client.setTimeout(CON_TIMEOUT);
	AD_TAG=Buffer.from(AD_TAG,'hex')
	async function serverToClient()
	{
		const RPC_PROXY_ANS = Buffer.from("0dda0344",'hex')
	    const RPC_CLOSE_EXT = Buffer.from("a234b65e",'hex')
	    const RPC_SIMPLE_ACK = Buffer.from("9b40ac3b",'hex')
	    let remainingLen;
		let seq_no=0;
		let msg_len_bytes,msg_len,msg_seq_bytes,msg_seq,checksum_bytes,checksum,ans_type;
		while(true)
		{
			server.beginReadCRC();
			msg_len = await server.bufferedReadInt();
			if (msg_len === 4)
				continue;
			assertit(msg_len%4===0);
			assertit(12<=msg_len);
			assertit(msg_len<=0x01000000);
	        msg_seq = await server.bufferedReadInt()
	        assertit(msg_seq===(seq_no++));
	        remainingLen=msg_len - 4 - 4 - 4;
	        if (remainingLen>=4)
	       	{
		        ans_type = await server.bufferedReadExactly(4);
		        remainingLen-=4;
		        if (ans_type.compare(RPC_CLOSE_EXT)===0)
		        {
		        }
		        else if (ans_type.compare(RPC_PROXY_ANS)===0)
		        {
		        	let ans_flags = await server.bufferedReadExactly(4);
		        	remainingLen-=4;
		        	let conn_id = await server.bufferedReadExactly(8);
		        	remainingLen-=8;
		        	let padding_len = Math.floor(4*Math.random());
		        	let msgLength=padding_len+remainingLen;


					client.setOutputBufferLength(msgLength+4);
		        	client.bufferedWrite((padding_len+remainingLen).toBuffer());
		        	while(remainingLen>0)
			        {
			        	let data=await server.bufferedReadAtmost(remainingLen);
			        	remainingLen-=data.length;
						client.bufferedWrite(data);
			        }
			        client.bufferedWrite(crypto.randomBytes(padding_len)); //Check
		        }
		        else if (ans_type.compare(RPC_SIMPLE_ACK)===0)
		        {
		        	let conn_id = await server.bufferedReadExactly(8);
		        	remainingLen-=8;
		        	let confirm = await server.bufferedReadExactly(4);
		        	client.setOutputBufferLength(4);
		        	client.bufferedWrite(confirm)
		        	remainingLen-=4;
		        }
		        else
		        	throw(new Error('Invalid ans type'+ans_type.toString('hex')))
	    	}

	    	if (remainingLen>0)
	    		await server.bufferedReadExactly(remainingLen);
	        await server.endReadCRC();
		}
	};
	async function clientToServer()
	{
		let seq_no=0;
		let remote_ip_port=Buffer.concat([Buffer.from('00000000000000000000ffff','hex'),cl_ip,cl_port.toBuffer(4)]);
		let our_ip_port   =Buffer.concat([Buffer.from('00000000000000000000ffff','hex'),my_ip,server.localPort.toBuffer(4)]);

		while(true)
		{
			let flags=0x28021008;
		    let msg_len = (await client.bufferedReadExactly(4)).readUInt32LE();
			flags = flags | (msg_len&0x80000000)
		    msg_len=(msg_len&0x7fffffff);
		    let trailing_len=msg_len%4;
		    msg_len-=trailing_len;
			let remainingLen=msg_len;
		    assertit (remainingLen>=8); //Why????
		    let msg_startswith=await client.bufferedReadExactly(8);
		    remainingLen-=8;
		    if (msg_startswith.compare(Buffer.from('0000000000000000','hex'))===0)
		        flags |= 0x2
		    server.beginWriteCRC();
		    server.bufferedWrite((msg_len+96).toBuffer());
		    server.bufferedWrite((seq_no).toBuffer()); //check ++seq_no
		    seq_no++;
		    server.bufferedWrite(Buffer.concat([Buffer.from('eef1ce36','hex'),flags.toBuffer(),out_conn_id,remote_ip_port,our_ip_port,Buffer.from('18000000ae261edb','hex')]));
		    server.bufferedWrite(Buffer.concat([Buffer.from([16]),AD_TAG,Buffer.from('000000','hex')]))  //84
			server.bufferedWrite(msg_startswith)
		    while (remainingLen>0)
		    {
		    	let data=await client.bufferedReadAtmost(remainingLen);
		    	server.bufferedWrite(data);
		    	remainingLen-=data.length;
		    }
		    if (trailing_len!==0)
		    	await client.bufferedReadExactly(trailing_len);
		    server.endWriteCRC();
		    while((msg_len%16)!==0)
		    {
		    	msg_len+=4;
		    	server.bufferedWrite(Buffer.from('04000000','hex'));
		    }
		}
	};
	return Promise.all([clientToServer(),serverToClient()]);
}

class MTProtoProxy
{
	constructor(options)
	{
		let {httpServer,tag,enter,leave,ready}=options;
		let self=this;
		let secrets=options.secrets.map(function(secret,index){return {secret:Buffer.from(secret,'hex').slice(1),index,isTLS:secret.startsWith('ee'),isSecured:secret.startsWith('dd')}});
		tls_secrets=secrets.filter(function(secret){return secret.isTLS});
		secured_secrets=secrets.filter(function(secret){return secret.isSecured});
		refreshProxyInfo().then(function(){ready()});
		this.proxy=function(client)
		{
			client.on('error',function(){})
			client.once('data',function(data)
			{
				let firstPacket=data.toString('utf8');
				if ((httpServer)&&((firstPacket.startsWith('GET /'))||(firstPacket.startsWith('POST /'))))
				{
					httpServer.emit('connection',client);
					client.emit('data',data);
					return false;
				}

				let index=globaleIndex;
				globaleIndex++;
				handleClient(client,enter,index).catch(function(err)
				{
					let error=err.stack;
					if (err.message==='client ended')
						error=undefined;
					leave({id:index,bytesWritten:client.bytesWritten,bytesRead:client.bytesRead,error})
					client.emit('finished',err)
				});
				client.emit('data',data);
			})
		};
	}
}

module.exports.MTProtoProxy=MTProtoProxy;
