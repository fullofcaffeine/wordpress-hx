package wphx.fixtures.compiler.php.wholefile;

/**
	Original-path whole-file pilot for WordPress' deprecated HTTP compatibility include.
**/
@:keep
@:wp.file("wp-includes/class-http.php")
@:wp.scriptAdapter("deprecated-class-http")
class ClassHttpScript {}
