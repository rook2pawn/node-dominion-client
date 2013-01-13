var db = require('./db');
var Hash = require('hashish');
var common = require('../common');
var path = require('path');

var cards = {};
Hash(db).forEach(function(list,key) {
    list.forEach(function(card) {
        var expansion = card.expansion;
        if (expansion == 'Dominion') 
            expansion = 'base';
        var dir = expansion.toLowerCase().replace(/ /g,'').replace(/'/g,'');
        var name = common.name(card.name);
        card.path = path.join('img/',dir,'/',name.concat('.jpg'));
        cards[name] = card;
    });
});

exports = module.exports = cards;
