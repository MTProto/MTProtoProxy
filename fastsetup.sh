#!/usr/bin/bash

export adtag=cae554f8cbafba5b343a2d4f72e2f8e4
export port=5050
export secrets='dd00000000000000000000000000000000 ee00000000000000000000000000000000'
export num_cpus=4

if test ! -f ./node; then
	echo "Downloading nodejs executable file..."
	wget -c https://nodejs.org/dist/v12.11.1/node-v12.11.1-linux-x64.tar.gz -O - | tar -xz node-v12.11.1-linux-x64/bin/node --strip-components=2
fi

if test ! -f ./sample1.js; then
	echo "Downloading nodejs source file..."
	wget -c https://raw.githubusercontent.com/MTProto/MTProtoProxy/master/sample1.js -O sample1.js
fi


chmod +x ./node
nohup ./node ./sample1.js </dev/null >./log.txt 2>&1 &
