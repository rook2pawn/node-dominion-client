var address = window.location.host;
var dz = io.connect('http://'+address);
var Hash = require('hashish');
var hat = require('hat');
var rack = hat.rack(128,10,2);
var common = require('../common');
var cards = require('../cards/cards');

var hand = ['Cellar','Bank','City','Market','Village','copper','copper'];

var small = function(path) {
    var base = path.slice(0,path.indexOf('.'));
    return base + '_small.jpg';
};

var focus = function(id) {
    id = id.slice(1);
    var name = rack.get(id);
    var card = cards[name];
    $('#focus').empty().append("<img src='"+card.path + "' >");
}
$(window).ready(function() {
    dz.conn
    hand.forEach(function(key){ 
        var card = cards[common.name(key)];
        var id = rack(common.name(key));
        $('#hand').append("<div class='card'><img id='_"+id + "' src='"+small(card.path) + "'></div>");
        $('#_'+id).mouseover(function() {
            focus(this.id);
        });
//        $('#cards').append("<img src='"+card.path + "'>");
    });
});
