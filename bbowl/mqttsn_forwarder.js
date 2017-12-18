#!/usr/bin/env node

const noble = require('noble');
const net = require('net');
const prettyjson = require('prettyjson');
const mqttsn = require('mqttsn-packet');
let perif;

const dgram = require('dgram');

const createMqttForwarder = function(udpClient) {
  const parser = mqttsn.parser();

  parser.on('packet', function(packet) {
    console.log(prettyjson.render(packet));
    const buffer = mqttsn.generate(packet) ;
    udpClient.send(buffer, 0, buffer.length, settings.PORT, settings.HOST, function(err, bytes) {
      //
    });
  });
  return parser;
}

let uart = {
	tx : null,
	rx : null
}

const connections = []
const uids=[]

let settings = {

	HOST :"192.168.242.165",
	PORT : 10000,

	UART : '6e400001b5a3f393e0a9e50e24dcca9e',
	RX : '6e400003b5a3f393e0a9e50e24dcca9e',
	TX : '6e400002b5a3f393e0a9e50e24dcca9e',
	ADDRESS : ""
}

if(process.argv.indexOf("-a") != -1){
	settings.ADDRESS = process.argv[process.argv.indexOf("-a") + 1];
}

if(process.argv.indexOf("-nus") != -1){
	settings.UART = process.argv[process.argv.indexOf("-s") + 1];
}

if(process.argv.indexOf("-RXChar") != -1){
	settings.RX = process.argv[process.argv.indexOf("-RXChar") + 1];
}

if(process.argv.indexOf("-TXChar") != -1){
	settings.TX = process.argv[process.argv.indexOf("-TXChar") + 1];
}

if(process.argv.indexOf("-h") != -1){
	settings.HOST = process.argv[process.argv.indexOf("-b") + 1];
}

if(process.argv.indexOf("-p") != -1){
	settings.PORT = process.argv[process.argv.indexOf("-p") + 1];
}

console.log("MQTT-SN forwarder starting")
console.log("Settings: " + JSON.stringify(settings,null,2))

process.on('exit', function() {
	if (perif != null) {
		console.log("MQTT-SN forwarder is shutting down, disconnecting...")
		peripheral.once('disconnect');
	}
})

const writeToUdp = function(client) {
  var mqttForwarder = createMqttForwarder(client);
  return function(data) {
    console.log('Received from UART: ', data.slice(0, -1));
    mqttForwarder.parse(data);
  }
}

const writeToBT = function(data) {
	console.log("->\n"+data.slice(0,-1))
	uart.tx.write(new Buffer(data))
}

const writeToSockets = function(data) {
	console.log("<-\n" + data.slice(0,-1))
	connections.forEach(function (sck) {
		sck.write(data)
	})
}

function ready(chrRead, chrWrite) {

	console.log("connected to bluetooth le UART device")

	uart.rx = chrRead
	uart.tx = chrWrite

	uart.rx.on('data', writeToSockets)
	uart.rx.notify(true)

	console.log("RX is setup")

	const client = dgram.createSocket('udp4');

	client.on('message', function(data, remote) {
		console.log('Received from UDP: ', data.slice(0, -1));
		uart.tx.write(data, true); 
	});

	client.on("listening", function() {
		const address = client.address();
		console.log(`Listening to port ${address.port}`);
	});

	client.bind(settings.PORT);

	uart.rx.notify(true);
	uart.rx.on('data', writeToUdp(client))
}

noble.on('stateChange', function(state) {

	console.log("BLE adapter state: [" + state + "]")

	if(state === "poweredOn") {
		noble.startScanning(uids, false,function(error) {
			if (!error) {
				console.log("Scanning for BLE devices...")
			} else {
				console.log("Error while scanning for BLE devices: " + error)
			}
		})
	}
})

noble.on('discover', function(p) {
  perif = p
  console.log("Found device " + p.advertisement.localName + " " + p.address)

  if (settings.ADDRESS == "" || p.address === settings.ADDRESS) {

  console.log("Stopping scan...")
  noble.stopScanning();

  console.log("Trying to connect to " + p.advertisement.localName + "["+p.address+"]")
  p.connect(function() {
  	p.discoverAllServicesAndCharacteristics(function(error, services, characteristics){
  		if (!error) {
				console.log("[---")
				console.log("Services: \n" + "["+services+"]")
				console.log("---]")
        
				let chrRead
				let chrWrite
			  services.forEach(function(s, serviceId) {
					if (s.uuid == settings.UART) {
						s.characteristics.forEach(function(ch, charId) {
							if (ch.uuid === settings.RX) {
								chrRead = ch
							} else if (ch.uuid === settings.TX) {
								chrWrite = ch
							}
						})
					}
				})

  			if (chrRead != null && chrWrite != null) {
  				ready(chrRead, chrWrite)
  			} else {
  				console.log("no UART service/charactersitics found...")
  			}
  		} else {
  			console.log(error)
  		}

  	})
  })
  }
})
