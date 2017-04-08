const AWS = require('aws-sdk');
const constants = require('paste-n-sync-constants');

const creds = new AWS.Credentials({
    accessKeyId: 'AKIAJXZXRIN5LHWSVJAQ',
    secretAccessKey: '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'
});

AWS.config.credentials = creds;

// Create an S3 client
AWS.config.update({
    region: 'us-west-2'
});

var docClient;

module.exports = {
    init(){
        docClient = new AWS.DynamoDB.DocumentClient();
    },
    getUser(params){

        params = Object.assign({
            TableName: "Users",
            Key: {}
        }, params);

        return new Promise((resolve, reject) => {
            docClient.get(params, function (err, data) {
                if (err) {
                    reject(err.code);
                } else {
                    if(data && data.Item){
                        resolve(data.Item);
                    }else{
                        reject(constants.DB.NotExistingItem);
                    }
                }
            });
        });
    },
    register (params){

        params = Object.assign({
            TableName: "Users",
            Item: {}
        }, params);

        return new Promise((resolve, reject) => {
            docClient.put(params, function (err, data) {
                if (err) {
                    console.error("Put failed...");
                    reject(err.code);
                }
                resolve();
            });
        });
    },
    update(params){

        params = Object.assign({
            TableName: "Users",
            Key: {}
        }, params);

        return new Promise((resolve, reject) => {
            docClient.get(params, function (err, data) {
                if (err) {
                    reject(err.code);
                } else {
                    if(data && data.Item){
                        resolve(data.Item);
                    }else{
                        reject(constants.DB.NotExistingItem);
                    }
                }
            });
        });
        docClient.update({TableName: 'Users' }, (err, data)=>{ if(err) console.error(err); console.log(data)} );
    }
};