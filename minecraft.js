const spawn = require('child_process').spawn;
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const readline = require('readline');

// Create settings file if not exists
if (!fs.existsSync('settings.json'))
  fs.copyFileSync('default_settings.json', 'settings.json');
const SETTINGS = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

if (!fs.existsSync(SETTINGS.CWD)) throw new Error('To run a server you need a minecraft server folder at: '+SETTINGS.CWD+' and a jarfile named: '+SETTINGS.JAR);

/*
  MINECRAFT SERVER
*/

const server = spawn(SETTINGS.JAVA_PATH, ['-Xms'+SETTINGS.XMS, '-Xmx'+SETTINGS.XMX, '-jar', SETTINGS.JAR, ,'nogui'], {
  cwd: SETTINGS.CWD,
});
const rl = readline.createInterface({
  input: server.stdout
});
let log = [];


rl.on('line', line => {
  log.push(line);
  io.emit('commands', [line]);
});

rl.on('close', () => process.exit(0));

io.on('connection', function(socket){
  io.emit('clear');
  io.emit('commands', log);
  socket.on('command', function(cmd){
    server.stdin.write(cmd + '\n');
    log.push('> '+cmd);
    io.emit('commands', ['> '+cmd]);
  });
});

app.use('/', express.static('public'))

http.listen(SETTINGS.WEB_PORT, function(){
  console.log('Visit localhost:'+SETTINGS.WEB_PORT+' using your web browser.');
});
