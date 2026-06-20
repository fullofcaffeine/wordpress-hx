package wphx.wp.boundary;

import haxe.extern.EitherType;

/**
	WPHX-211: WordPress PHP values can be scalars, arrays, objects, resources,
	or null at public boundaries. Dynamic is isolated here until each migrated
	API has a narrower value model.
**/
typedef NativeValue = Dynamic;

/**
	WPHX-211: PHP callables may be closures, function-name strings, static
	method strings, or object/class method tuples. Haxe Function is too narrow
	for the public WordPress callable ABI.
**/
typedef NativeCallable = Dynamic;

typedef NativeArrayKey = EitherType<String, Int>;
typedef NativeWpError = NativeValue;
