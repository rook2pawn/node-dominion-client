var util = require('./util');
var Api = require('../dominion-api');
var Hash = require('hashish');
var connectionmgr = function(params) {
    var clients = {};
    var self = {};
    self.connect = function(socket) {
        util.init(clients,socket.id,socket);
    };
    self.disconnect = function() {
        util.delete(clients,this.socket.id);
    };
    self.subscribe = function(params) {
        util.subscribe(clients,this.socket.id,params);
    };
    return self;
};
exports = module.exports = connectionmgr;
