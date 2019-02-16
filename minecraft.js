const spawn = require('child_process').spawn;
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const readline = require('readline');
const passport = require('passport');
const Strategy = require('passport-local').Strategy;
const srs = require('secure-random-string');

function generateDefaultConfig() {
  return {
    JAR: "minecraft_server.jar",
    XMS: "1024M",
    XMX: "2048M",
    JAVA_PATH: "java",
    CWD: "./minecraft/",
    WEB_PORT: 3000,
    USERNAME: 'admin',
    PASSWORD: srs({length: 12}),
    LOG_LENGTH: 500, // Amount of lines kept in console log
  }
}

let userSettings = {};
if (fs.existsSync('settings.json'))
  userSettings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

let defaultSettings = generateDefaultConfig();
const SETTINGS = Object.assign(defaultSettings, userSettings);
fs.writeFileSync('settings.json', JSON.stringify(SETTINGS, null, 2));

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

function logLine(line) {
  log.push(line);
  if (log.length > SETTINGS.LOG_LENGTH) {
    log = log.slice(log.length - SETTINGS.LOG_LENGTH, log.length);
  }
}


rl.on('line', line => {
  logLine(line);
  io.emit('commands', [line]);
});

rl.on('close', () => process.exit(0));

function findByUsernameOrId(username, cb) {
  if (typeof username !== 'string') return cb(new Error('username needs to be a string'));
  if (username === SETTINGS.USERNAME) return cb(null, {username: SETTINGS.USERNAME, password: SETTINGS.PASSWORD});
  return cb(null, false);
}

passport.use(new Strategy(
  function(username, password, cb) {
    findByUsernameOrId(username, function(err, user) {
      if (err) { return cb(err); }
      if (!user) { return cb(null, false); }
      if (user.password != password) { return cb(null, false); }
      return cb(null, user);
    });
  }
));

passport.serializeUser(function(user, cb) {
  cb(null, user.username);
});

passport.deserializeUser(function(id, cb) {
  findByUsernameOrId(id, function (err, user) {
    if (err) { return cb(err); }
    cb(null, user);
  });
});

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

var expressSession = require("express-session"),
    bodyParser = require("body-parser");

var sessionMiddleware = expressSession(({
    secret: srs(),
    resave: true,
    saveUninitialized: true
}));

io.use(function(socket, next) {
    // Wrap the express middleware
    sessionMiddleware(socket.request, socket.request.res, next);
}).on('connection', function(socket){
  socket.emit('clear');
  var userId = false;
  var passport = socket.request.session.passport;
  if (passport) userId = passport.user;
  if (userId !== SETTINGS.USERNAME) {
    socket.emit('login');
    socket.disconnect();
    return;
  }
  socket.emit('settings', {LOG_LENGTH: SETTINGS.LOG_LENGTH})
  socket.emit('commands', log);
  socket.on('command', function(cmd){
    server.stdin.write(cmd + '\n');
    logLine('> '+cmd);
    io.emit('commands', ['> '+cmd]);
  });
});


app.use(sessionMiddleware);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());


app.get('/',
  function(req, res) {
    res.render('page', { user: req.user });
  });

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout',
  function(req, res){
    req.logout();
    res.redirect('/');
  });

app.use('/static', express.static('static'));

http.listen(SETTINGS.WEB_PORT, function(){
  console.log('Visit localhost:'+SETTINGS.WEB_PORT+' using your web browser.');
});
