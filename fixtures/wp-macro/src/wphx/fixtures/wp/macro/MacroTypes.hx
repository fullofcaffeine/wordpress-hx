package wphx.fixtures.wp.macro;

/**
	WPHX-211: Macro fixtures model WordPress callback ABI shape without invoking
	the callback. Dynamic is isolated to that PHP callable boundary.
**/
typedef WpCallback = Dynamic;
