<?php

if ( ! isset( $GLOBALS['wphx_f3_options'] ) ) {
	$GLOBALS['wphx_f3_options'] = array(
		'siteurl' => 'https://example.test',
		'blog_public' => '1',
		'empty_string' => '',
		'zero_string' => '0',
		'false_bool' => false,
		'null_value' => null,
		'list' => array( 'first', 'second' ),
		'assoc' => array(
			'alpha' => 1,
			'beta' => 2,
		),
	);
}

if ( ! isset( $_SERVER['WPHX_F3_REQUEST_METHOD'] ) ) {
	$_SERVER['WPHX_F3_REQUEST_METHOD'] = 'GET';
}

if ( ! function_exists( 'wphx_native_get' ) ) {
	function wphx_native_get( $key, $default = false ) {
		return array_key_exists( $key, $GLOBALS['wphx_f3_options'] ) ? $GLOBALS['wphx_f3_options'][ $key ] : $default;
	}
}

if ( ! function_exists( 'wphx_native_set_global' ) ) {
	function wphx_native_set_global( $key, $value ) {
		$GLOBALS['wphx_f3_options'][ $key ] = $value;

		return $GLOBALS['wphx_f3_options'][ $key ];
	}
}

if ( ! function_exists( 'wphx_native_normalize_key' ) ) {
	function wphx_native_normalize_key( $key ) {
		return strtolower( str_replace( ' ', '_', trim( $key ) ) );
	}
}

if ( ! function_exists( 'wphx_native_callback' ) ) {
	function wphx_native_callback( $callback, $value ) {
		return $callback( $value );
	}
}
