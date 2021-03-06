require('dotenv').config()

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

const server = spawn('java', ['-Xms'+process.env.XMS, '-Xmx'+process.env.XMX, '-jar', process.env.JAR, 'nogui'], {
  cwd: process.env.MC_FOLDER,
  detached: true,
});
const rl = readline.createInterface({input: server.stdout});
const er = readline.createInterface({input: server.stderr});
let log = [];

function logLine(line) {
  log.push(line);
  console.log(line)
  if (log.length > Number(process.env.LOG_LENGTH)) {
    log = log.slice(log.length - Number(process.env.LOG_LENGTH), log.length);
  }

  io.emit('commands', [line]);
}

er.on('line', line => {
  logLine(line);
});


rl.on('line', line => {
  logLine(line);
});

rl.on('close', () => process.exit(0));

function findByUsernameOrId(username, cb) {
  if (typeof username !== 'string') return cb(new Error('username needs to be a string'));
  if (username === String(process.env.USERNAME)) return cb(null, {username: process.env.USERNAME, password: String(process.env.PASSWORD)});
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
  if (userId !== String(process.env.USERNAME)) {
    socket.emit('login');
    socket.disconnect();
    return;
  }
  socket.emit('settings', {LOG_LENGTH: Number(process.env.LOG_LENGTH)})
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

http.listen(process.env.WEB_PORT, function(){
  console.log(`Admin console available at http://localhost:${process.env.WEB_PORT}/`);
  console.log('Login credentials:')
  console.log(`Username: ${process.env.USERNAME}`);
  console.log(`Password: ${process.env.PASSWORD}`);
});

// ====================
//  Exit gracefully
// ====================
function stop() {
  server.stdin.write('stop\n');
  setInterval(() => {
    server.stdin.write('stop\n');
  }, 1000);
  // Force exit after timeout
  setTimeout(() => {
    process.exit(0);
  }, 10000);
}

process.on('SIGINT', function () {
  stop();
});

process.on('SIGTERM', function () {
  stop();
});

process.on('message', function(msg) {
  if (msg == 'shutdown') {
    stop();
  }
});