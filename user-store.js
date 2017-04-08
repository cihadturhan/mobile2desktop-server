const moment = require('moment');
const volatileUserData = {};

const sortByDate = (a, b)=> a.createdAt < b.createdAt ? 1 : a.createdAt == b.createdAt ? 0 : -1;

module.exports = {
    get(userId) {
        let userData = volatileUserData[userId];
        if (userData)
            userData.lastGet = moment().valueOf();
        return userData;
    },
    set(userId, userData){
        if (!userData)
            return false;

        let currentUserData = volatileUserData[userId];

        if (currentUserData) {
            userData.messages = currentUserData.messages.reduce((p, c)=> {
                if (!p.find(m => m.Uuid == c.Uuid)) {
                    p.push(c);
                }
                return p;
            }, userData.messages).sort(sortByDate);

            Object.keys(currentUserData.devices).forEach(key => {
                if (!userData.devices[key]) {
                    userData.devices[key] = currentUserData[key];
                }
            });
        }

        //Remove password in any case
        Object.assign(userData, {password: '__secret__'});
        userData.lastSet = moment().valueOf();
        volatileUserData[userId] = userData;
    }
};
