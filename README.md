dominion
========


perl grab script
================
use WWW::Mechanize;
use Data::Inspect;

my $mech = WWW::Mechanize->new();

my $insp = Data::Inspect->new;

$url = "http://dominion.diehrstraits.com/scans/promo/";
$mech->get( $url );

my @links = $mech->links();
foreach $link (@links) {
	my $hash = $link->attrs();
	my $name = $hash->{href};
	if ($name =~ m/\.jpg/) {
		print $name;
		$mech->get($link,':content_file' => "promo/".$name );
	}
}
