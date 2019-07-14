'use strict'

const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');

const rp = require('request-promise'); 
const { crc32 } = require('crc');

const PROXY_INFO_ADDR   = 'https://core.telegram.org/getProxyConfig';
const PROXY_SECRET_ADDR = 'https://core.telegram.org/getProxySecret';
const PUBLIC_IP_ADDR = 'https://api.ipify.org/';

let globaleIndex=0;
let secrets;
let AD_TAG;
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
		return rp({url,encoding:null})
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
		self.localName=name;
		self.writeCRCenabled=false;
		self.readCRCenabled=false;
		self.writeCRCval=undefined;
		self.readCRCval=undefined;
		self.newDataCallback=function(){};
		self.errorCallback=function(){};
		self.inputBuffer=Buffer.alloc(0);
		self.on('data',function(data){self.ondata.call(self,data)}); //why
		self.on('timeout',function(){self.emit('finished',new Error(`${self.localName} timedout`))})
		self.on('end'  ,function()		{self.emit('finished',new Error(`${self.localName} ended`))});
		self.on('error',function(err)	{self.emit('finished',err)});
		self.once('finished',function(err){self.end();self.errorCallback(err);self.setErrorHandler=function(handler){throw err}})
	},
	addCryptoLayer({decoder,encoder})
	{
		if (this.inputBuffer.length>0)
			this.inputBuffer=decoder(this.inputBuffer);
		let oldondata=this.ondata;
		this.ondata=function(data){oldondata.call(this,decoder(data))};
		let oldPusher=this.pusher;
		this.pusher=function(data){oldPusher.call(this,encoder(data))};
	},
	setErrorHandler(handler)
	{
		if (handler)
			this.errorCallback=handler;
	},
	pusher(data)
	{
		if (data.length>0)
			this.write(data)
	},
	bufferedWrite(data)
	{
		if (this.writeCRCenabled)
			this.writeCRCval = crc32(data,this.writeCRCval);
		this.pusher(data);
	},
	beginWriteCRC()
	{
		this.writeCRCenabled=true;
		this.writeCRCval=undefined;
	},
	endWriteCRC()
	{
		this.writeCRCenabled=false;
		let ret=Buffer.alloc(4);
		ret.writeUInt32LE(this.writeCRCval);
		this.writeCRCval=undefined;
		this.bufferedWrite(ret);
	},
	beginReadCRC()
	{
		this.readCRCval=undefined;
		this.readCRCenabled=true;
	},
	async endReadCRC()
	{
		this.readCRCenabled=false;
		let ret=Buffer.alloc(4);
		ret.writeUInt32LE(this.readCRCval);
		this.readCRCval=undefined;
		return this.bufferedReadAssert(ret)
	},
	ondata(data)
	{
		this.inputBuffer=Buffer.concat([this.inputBuffer,data]);
		this.newDataCallback();
	},
	waitForNewData()
	{
		let self=this;
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
		if (this.readCRCenabled)
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
		if (this.readCRCenabled)
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
		if (this.readCRCenabled)
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

async function handleClient(client)
{
	client.setKeepAlive(true);
	client.setTimeout(CON_TIMEOUT);
	let cl_ip 	=Buffer.from(client.remoteAddress.split('.'));
	let cl_port =client.remotePort;
	extendSocket(client,'client');
	let skip = await client.bufferedReadExactly(8);
	let dec_prekey_and_iv = await client.bufferedReadExactly(48);
	let dec_proto_tag = await client.bufferedReadExactly(4);
	let dec_dcId = await client.bufferedReadExactly(2);
	let trailing = await client.bufferedReadExactly(2);

	let enc_prekey_and_iv = Buffer.from(dec_prekey_and_iv).reverse();
	let dec = {prekey : dec_prekey_and_iv.slice(0,32),iv : dec_prekey_and_iv.slice(32)}
	let enc = {prekey : enc_prekey_and_iv.slice(0,32),iv : enc_prekey_and_iv.slice(32)}
	let decoder,encoder;
	let permission=false;
	for (let secret in secrets)
	{
		dec.key = crypto.createHash('sha256').update(Buffer.concat([dec.prekey, secret])).digest();
		enc.key = crypto.createHash('sha256').update(Buffer.concat([enc.prekey, secret])).digest();
		decoder = createAESCTRTransform(dec,true);
		encoder = createAESCTRTransform(enc,false);
		decoder(skip);
		decoder(dec_prekey_and_iv);
		let proto_tag = decoder(dec_proto_tag);
		if (proto_tag.compare(Buffer.from('dddddddd','hex'))!==0)
			continue;
		permission=true;
		break;
	}

	assertit(permission,'No matching secret');
	let dcId = decoder(dec_dcId).readInt16LE();
	assertit(dcId>=-5);
	assertit(dcId<=5);
	assertit(dcId!==0);
	decoder(trailing);
	client.addCryptoLayer({decoder,encoder})
	let server=await getFromPool(dcId);
	client.once('finished',function(err)
	{
		server.emit('finished',err);
	})
	server.once('finished',function(err)
	{
		client.emit('finished',err);
	})
	let out_conn_id = crypto.randomBytes(8); //CHeck
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

class MTProtoProxy extends EventEmitter 
{
	constructor(options)
	{
		let {httpServer,tag,filter}=options;
		super();
		let self=this;
		secrets=options.secrets;
		AD_TAG=tag;
		refreshProxyInfo().then(function(){self.emit('ready')});
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
				if (!filter)
					filter=Promise.resolve;
				let index=globaleIndex;
				let user={id:index,address:client.remoteAddress,port:client.remotePort};
				self.emit('connection',user);
				globaleIndex++;
				filter(user).then(function(){let ret= handleClient(client);client.emit('data',data); return ret}).catch(function(err)
				{
					let error=err;
					if (err.message==='client ended')
						error=undefined;
					self.emit('end',{id:index,bytesWritten:client.bytesWritten,bytesRead:client.bytesRead,error})
					client.emit('finished',err)
				});
				
			})
		};
	}
}

module.exports.MTProtoProxy=MTProtoProxy;
