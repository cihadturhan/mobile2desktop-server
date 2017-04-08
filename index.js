const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const constants = require('paste-n-sync-constants');
const dynoDBWrapper = require('./dynoDBWrapper');
const uuidV4 = require('uuid/v4');
const bcrypt = require('bcrypt');
const moment = require('moment');


const app = express();
const server = http.Server(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

const UserStore = require('./user-store');

dynoDBWrapper.init();

server.listen(PORT, () => console.log(`listening on *:${PORT}`));

// The event will be called when a client is connected.
io.on('connection', (socket) => {
    console.log('Connected:    ', socket.id);
    let trials = 0;
    let UserToken = null;
    let deviceUuid = null;

    socket.on(constants.REGISTER, (params)=> {
        console.log('Connected:    ', socket.id);
        trials += 1;
        if (trials > 5) {
            return socket.emit(constants.REGISTER_ERROR, 'Too many retries. Your account is blocked. If you forgot password, email to resetpassword@cihadturhan.com.');
        }

        if (params.password && params.UserId) {
            dynoDBWrapper.getUser({
                Key: { UserId: params.UserId }
            }).then((DBUserData)=>{
                // UserId is email
                // UserToken is a secret hash

                if(!DBUserData.password){
                    return socket.emit(constants.REGISTER_ERROR, 'Unknown Error. Please Check again later.');
                }

                //Verify existing user password with the one with db
                bcrypt.compare(params.password, DBUserData.password, function(err, res) {
                    if(err){
                        return socket.emit(constants.REGISTER_ERROR, 'Unknown encryption error');
                    }

                    if (res) {
                        // Passwords match
                        UserToken = DBUserData.UserToken;
                        Object.assign(DBUserData, {password: '__secret__'});
                        UserStore.set(UserToken, DBUserData);
                        return socket.emit(constants.REGISTER_SUCCESS, DBUserData.UserToken);
                    } else {
                        return socket.emit(constants.REGISTER_ERROR, 'Incorrect User-Password Combination! Check Again');
                    }
                });

            }).catch((err)=>{
                switch (err){
                    //User doesn't exist. Register
                    case constants.DB.NotExistingItem:
                        return registerUser();
                    case constants.DB.ValidationException:
                        return socket.emit(constants.REGISTER_ERROR, 'Incorrect User-Password Combination! Check Again');
                    default:
                        return socket.emit(constants.REGISTER_ERROR, 'Unknown Error. Please Check again later.');
                }
            });


            /* User Register */
            function registerUser(){

                let DBUserData = {};

                (new Promise((resolve, reject) => {
                    bcrypt.hash(params.password, 10, (err, passwordHash)=> {
                        if (err) {
                            reject();
                            return socket.emit(constants.REGISTER_ERROR, 'Unknown encryption error');
                        }

                        resolve(passwordHash)
                    });
                })).then((passwordHash)=>{
                    return new Promise((resolve, reject)=>{
                        bcrypt.hash(params.password + moment().valueOf() + params.UserId, 10, (err, UserTokenHash)=> {
                            if (err) {
                                reject();
                                return socket.emit(constants.REGISTER_ERROR, 'Unknown encryption error');
                            }

                            resolve({passwordHash, UserTokenHash})
                        });
                    })
                }).then(({passwordHash, UserTokenHash}) => {
                    DBUserData = {
                            UserId: params.UserId,
                            UserToken: UserTokenHash,
                            password: passwordHash,
                            devices: {},
                            createdAt: moment().valueOf(),
                            messages: [],
                        };

                    return dynoDBWrapper.register({Item: DBUserData})
                        .then(()=> {
                            //User successfully created
                            UserToken = UserTokenHash;
                            UserStore.set(UserToken, DBUserData);
                            return socket.emit(constants.REGISTER_SUCCESS, UserTokenHash);
                        });
                }).catch(()=> {
                    return socket.emit(constants.REGISTER_ERROR, 'Unknown Error! Please try again later.');
                });

            }
        } else {
            socket.emit(constants.REGISTER_ERROR, 'Missing Parameters! Try again');
        }
    });

    socket.on(constants.JOIN, (params)=> {
        if(deviceUuid){
            return;
        }

        if(!params.UserToken){
            return socket.emit(constants.LOGOUT, "Please login/register first to join.");
        }

        if (!params.deviceUuid) {
            return socket.emit(constants.JOIN_ERROR, 'Missing Parameters! Check Again');
        }

        UserToken = params.UserToken;

        let userData = UserStore.get(UserToken);
        if(!userData){
            return socket.emit(constants.LOGOUT, "Your session is expired. Please try logging in again.");
        }

        if(userData.devices[params.deviceUuid]){
           join();
        } else {
            if(params.deviceName){
                userData.devices[params.deviceUuid] = params.deviceName;
                join();
            }else{
                return socket.emit(constants.JOIN_ERROR, 'Missing Parameters! Check Again');
            }

            // TO-DO Add Devices to device array and save to database and don't require device name again and again
            /*let DBParams = {
                Key: {UserId: 'BLA BLA'},
                UpdateExpression: "set devices=:d ",
                ExpressionAttributeValues: {':d': {'abc': 'iPhone', 'def': 'iPad'}}
            };

            dynoDBWrapper.update(DBParams).then(()=> {
                userData.devices[params.deviceUuid] = params.deviceName;
                join();
            });
            */
        }

        function join(){
            socket.join(UserToken);
            //Join success to user, joined to others
            socket.emit(constants.JOIN_SUCCESS, {});
            io.to(UserToken).emit(constants.DEVICE_LIST, userData.devices);
            io.to(UserToken).emit(constants.MESSAGE_LIST, userData.messages);
            deviceUuid = params.deviceUuid;
            console.log('Joined:  ', deviceUuid);
        }


    });

    socket.on(constants.MESSAGE, (message) => {

        if(typeof message != 'object' || message == '') {
            return socket.emit(constants.MESSAGE_ERROR, "Message type doesn't match");
        }

        if (!deviceUuid)
            return socket.emit(constants.LOGOUT, 'Please register and join first to send message!');

        let userData = UserStore.get(UserToken);
        if(!userData){
            return socket.emit(constants.LOGOUT, "Your session is expired. Please try logging in again.");
        }

        message.from = deviceUuid;
        message.createdAt = moment().valueOf();

        let sendMessage = ()=>{
            console.log('Message to:   ', UserToken, message);
            if(!userData.messages)
                userData.messages = [];

            if(userData.messages.length > 10){
                userData.messages.pop();
            }

            io.to(UserToken).emit(constants.MESSAGE, message);

            userData.messages.unshift(message);
        };

        (new Promise((resolve, reject)=> {
            bcrypt.hash(deviceUuid + message.createdAt, 10, (err, messageHash)=> {
                if (err) {
                    reject();
                    return socket.emit(constants.MESSAGE_ERROR, "Error occured when genering message. Please try to send again")
                }

                resolve(messageHash)
            });
        })).then(messageHash=> {

            console.log('Message to:   ', UserToken, message);
            message.Uuid = messageHash;
            // TO-DO
            // for later versions we should check message.version
            switch (message.version){
                case '1.0':
                    if(message.content && typeof message.content.length){
                        return sendMessage();
                    }else {
                        return socket.emit(constants.MESSAGE_ERROR, "Error occured when generating message. Please try to send again");
                    }
                default:
                    return socket.emit(constants.MESSAGE_ERROR, "We can't send message. Check if you use latest version of the app or plugin");
            }
        });


    });

    socket.on('disconnect', ()=> {
        let userData = UserStore.get(UserToken);
        if(!userData){
            return socket.emit(constants.JOIN_ERROR, "Your session is somehow expired. Please try logging in again.");
        }

        if(userData.devices[deviceUuid]){
            delete userData.devices[deviceUuid];
        }

        io.to(UserToken).emit(constants.DEVICE_LIST, userData.devices);

        console.log('Disconnected: ', deviceUuid);
    });

});