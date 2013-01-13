exports.name = function(val) {
    var name = val.toLowerCase().replace(/ /g,'').replace(/\'/g,'').replace('-','');
    return name;
};
