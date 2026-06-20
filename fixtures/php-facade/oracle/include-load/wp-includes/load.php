<?php

if ( ! defined( 'ABSPATH' ) ) {
	return 'ABSPATH_REQUIRED';
}

if ( ! function_exists( 'wphx_f5_oracle_event' ) ) {
	function wphx_f5_oracle_event( $event, $file, $detail ) {
		return array(
			'event' => $event,
			'file' => $file,
			'detail' => $detail,
		);
	}
}

if ( ! isset( $GLOBALS['wphx_f5_trace'] ) ) {
	$GLOBALS['wphx_f5_trace'] = array();
}

$GLOBALS['wphx_f5_trace'][] = wphx_f5_oracle_event( 'load:included', __FILE__, 'require_once' );

if ( ! function_exists( 'wphx_f5_load_marker' ) ) {
	function wphx_f5_load_marker() {
		return 'haxe:LOAD';
	}
}

return 'load:included';
