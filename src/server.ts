#!/usr/bin/env node

import * as http from 'http';
import * as fs from 'fs';

import * as parseArgs from 'minimist';
import * as yaml from 'js-yaml';
import * as ws from 'ws';
import * as rpc from '@sourcegraph/vscode-ws-jsonrpc';
import * as rpcServer from '@sourcegraph/vscode-ws-jsonrpc/lib/server';
const URL = require('url');
let argv = parseArgs(process.argv.slice(2));

if (argv.help || !argv.languageServers) {
  console.log(`Usage: server.js --port 3000 --languageServers config.yml`);
  process.exit(1);
}

let serverPort : number = parseInt(argv.port) || 3000;

let languageServers;
try {
  let parsed = yaml.safeLoad(fs.readFileSync(argv.languageServers), 'utf8');
  if (!parsed.langservers) {
    console.log('Your langservers file is not a valid format, see README.md');
    process.exit(1);
  }
  languageServers = parsed.langservers;
} catch (e) {
  console.error(e);
  process.exit(1);
}
/*interface ExtWebSocket extends WebSocket {
    isAlive: boolean;
    pingInterval: Number;
}*/

const wss : ws.Server = new ws.Server({
  port: serverPort,
  perMessageDeflate: false,
  clientTracking: true
}, () => {
  console.log(`Listening to http and ws requests on ${serverPort}`);
});

function keepAliveSockets(wss){
    setTimeout(wsSet => { wsSet.forEach(ws => ws.isAlive ? (ws.isAlive = false, ws.ping("", false))
        : ws.terminate());
        keepAliveSockets(wss);
    }, 10000, wss.clients);
}

keepAliveSockets(wss);


function toSocket(webSocket: ws, languageName: string): rpc.IWebSocket {

  return {

      send: content =>{
         // console.log(`Send message ${content}`)
          webSocket.send(content)
      },

      onMessage: cb => webSocket.onmessage = event => {
          cb(event.data)
          /*let updatedData ='{"jsonrpc":"2.0","method":"workspace/didChangeConfiguration","params":{"settings":{"python":{"linting":{"enabled":true},"analysis":{"errors":["undefined-variable"],"warnings":["unknown-parameter-name"],"information":["unresolved-import"],"disabled":["too-many-function-arguments","parameter-missing"]}}}}}'
          let messageData = event.data
          //console.log(`Receive message ${languageName} ${messageData}`)
          parseJsonAsync(messageData.toString()).then(
              jsonData => {
                  if(jsonData['method']=='workspace/didChangeConfiguration' && (languageName=='python' || languageName=='python3')){
                      messageData = updatedData
                      console.log(`updated event data ${messageData}`)
                  }
              })

          cb(messageData)*/
      },
      onError: cb => webSocket.onerror = event => {
          if ('message' in event) {
             // console.log(`Receive message ${event}`)
              cb((event as any).message)
          }
      },
      onClose: cb => webSocket.onclose = event => cb(event.code, event.reason),
      dispose: () => webSocket.close()
  }
}

const parseJsonAsync = (jsonString) => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(JSON.parse(jsonString))
        })
    })
}


wss.on('connection', (client : ws, request : http.IncomingMessage) => {
  let langServer : string[];
  let langKey: string = '';
  var queryData = URL.parse(request.url, true).query;
  var userFilePath = queryData.uuid || '';
  var mainfile = queryData.main || '';
  console.log(queryData);
  var uri = URL.parse(request.url);
  console.log(uri.pathname)
  Object.keys(languageServers).forEach((key) => {
    if (uri.pathname === '/' + key) {
      langServer = languageServers[key];
        langKey = key
    }
  });

  if (!langServer || !langServer.length) {
    console.error('Invalid language server', uri.pathname);
    client.close();
    return;
  }
    var filePath = '/tmp/'+userFilePath
    if (userFilePath!='') {
        fs.mkdir(filePath,
            { recursive: true }, (err) => {
                if (err) {
                    return console.error(err);
                }
                console.log('Directory created successfully!');
            });

    }

    if(mainfile!=''){
        try {
            fs.closeSync(fs.openSync(filePath+'/'+mainfile, 'w'))
            console.log(`${filePath+'/'+mainfile} file created!`);
        } catch (err) {
            console.error(`Error while creating file ${filePath+'/'+mainfile}.`);
        }
    }

  console.log(langServer[0]);
  console.log(langServer.slice(1));
  let localConnection = rpcServer.createServerProcess(langKey.toUpperCase() +' Server ',  langServer[0], langServer.slice(1),{cwd: userFilePath});
  let socket : rpc.IWebSocket = toSocket(client, langKey);
  let connection = rpcServer.createWebSocketConnection(socket);
  rpcServer.forward(connection, localConnection);
  console.log(`Forwarding new client`);
  socket.onClose((code, reason) => {
    console.log('Client closed', reason);
    localConnection.dispose();
    //TODO removing temp folder
      if (userFilePath!='') {
          try {
              fs.rmdirSync(filePath);
              console.log(`${filePath} is deleted!`);
          } catch (err) {
              console.error(`Error while deleting ${filePath}.`);
          }
      }
  });

});