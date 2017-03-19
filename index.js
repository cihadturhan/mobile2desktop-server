var express = require('express');
var http = require('http');
var socketio = require('socket.io');

var app = express();
var server = http.Server(app);
var io = socketio(server);
server.listen(3000, () => console.log('listening on *:3000'));

// The event will be called when a client is connected.
io.on('connection', (socket) => {
    console.log('Connected:    ', socket.id);
    let socketUid = null;

    socket.on('register', (uid)=>{
        //TO-DO uid check
        socketUid = uid;
        socket.join(uid);
        console.log('Registered:  ', socket.id);
    });

    socket.on('message', (message) => {
        if(!socketUid)
            return;

        // The `broadcast` allows us to send to all users but the sender.
        io.to(socketUid).emit('message', message);
        console.log('Message to:   ', socketUid, message);
    });

    socket.on('disconnect', ()=>{
        console.log('Disconnected: ', socket.id);
    });

});