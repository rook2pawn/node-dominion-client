var address = window.location.host;
var dz = io.connect('http://'+address);
$(window).ready(function() {
    alert("yo");
});
