package wphx.fixtures.wp.facade;

/**
	WPHX-211:
	PHP-native filter values can be scalars, arrays, objects, resources, or null.
	Dynamic is intentionally isolated behind this typedef until each migrated API
	gets a narrower WordPress value model.
**/
typedef NativeWpValue = Dynamic;

/**
	WPHX-211:
	WordPress accepts every PHP callable shape: Closure, function-name string,
	static method string, or object/class method tuple. Haxe Function is too
	narrow for that public ABI, so Dynamic is isolated here.
**/
typedef NativeWpCallable = Dynamic;
