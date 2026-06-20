<?php

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

if ( ! defined( 'WPINC' ) ) {
	define( 'WPINC', 'wp-includes' );
}

if ( ! isset( $GLOBALS['wphx_f5_trace'] ) ) {
	$GLOBALS['wphx_f5_trace'] = array();
}

if ( ! isset( $GLOBALS['wphx_f5_settings_count'] ) ) {
	$GLOBALS['wphx_f5_settings_count'] = 0;
}

$GLOBALS['wphx_f5_settings_count']++;
$GLOBALS['wphx_f5_trace'][] = array(
	'event' => 'settings:begin',
	'file' => __FILE__,
	'detail' => 'count:' . $GLOBALS['wphx_f5_settings_count'],
);

$wphx_f5_load_return = require_once ABSPATH . WPINC . '/load.php';
$wphx_f5_repeated_return = include ABSPATH . WPINC . '/repeated.php';
$wphx_f5_value_return = require ABSPATH . WPINC . '/return-value.php';
$wphx_f5_pluggable_return = require_once ABSPATH . WPINC . '/pluggable.php';

$GLOBALS['wphx_f5_load_returns'][] = array(
	'load' => $wphx_f5_load_return,
	'repeated' => $wphx_f5_repeated_return,
	'returnValue' => $wphx_f5_value_return,
	'pluggable' => $wphx_f5_pluggable_return,
);

$GLOBALS['wphx_f5_trace'][] = array(
	'event' => 'settings:end',
	'file' => __FILE__,
	'detail' => 'trace:' . count( $GLOBALS['wphx_f5_trace'] ),
);

return 'settings:' . $GLOBALS['wphx_f5_settings_count'];
