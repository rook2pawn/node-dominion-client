exports.init = function(hash,id,socket) {
    if (hash[id] === undefined) {
        hash[id] = {};  
        hash[id].subscriptions = {};
        hash[id].socket = socket;
    }
};
exports.delete = function(hash,id) {
    delete hash[id].subscriptions;
    delete hash[id].socket;
    delete hash[id];
};

// params = ({eventname:<string>,value:<somevalue>})
exports.subscribe = function(hash,id,params) {
    if (hash[id].subscriptions[params.eventname] === undefined) {
        hash[id].subscriptions[params.eventname] = [];
    }
    hash[id].subscriptions[params.eventname].push({value:params.value,isCurrentlyReceiving:false,eventname:params.eventname});
    console.log("hash[id].subscriptions = ");
    console.log(hash[id].subscriptions);
};
