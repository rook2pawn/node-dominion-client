var http = require('http');
var path = require('path');
var ecstatic = require('ecstatic')(path.join(__dirname,"/client"));
var web = http.createServer(ecstatic);
web.listen(5500);
console.log("listening on 5500");
var server = require('socket.io').listen(web);


server.configure(function() {
    server.set('log level', 1); 
});
server.sockets.on('connection',function(socket) {
    console.log("Connect!");
});
