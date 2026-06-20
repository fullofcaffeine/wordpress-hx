<?php

if ( ! isset( $GLOBALS['wphx_boundary_options'] ) ) {
	$GLOBALS['wphx_boundary_options'] = array(
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
		'numeric_keys' => array(
			0  => 'zero',
			2  => 'two',
			10 => 'ten',
		),
		'nested' => array(
			'theme' => array(
				'active' => true,
				'name'   => 'twentytwentyseven',
			),
		),
	);
}

if ( ! class_exists( 'WP_Error', false ) ) {
	class WP_Error {
		public $errors = array();
		public $error_data = array();

		public function __construct( $code = '', $message = '', $data = '' ) {
			if ( '' !== $code ) {
				$this->add( $code, $message, $data );
			}
		}

		public function add( $code, $message, $data = '' ) {
			$this->errors[ $code ][] = $message;
			if ( '' !== $data ) {
				$this->error_data[ $code ] = $data;
			}
		}

		public function has_errors() {
			return ! empty( $this->errors );
		}

		public function get_error_code() {
			$codes = array_keys( $this->errors );

			return $codes ? $codes[0] : '';
		}

		public function get_error_message( $code = '' ) {
			if ( '' === $code ) {
				$code = $this->get_error_code();
			}

			return isset( $this->errors[ $code ][0] ) ? $this->errors[ $code ][0] : '';
		}

		public function get_error_data( $code = '' ) {
			if ( '' === $code ) {
				$code = $this->get_error_code();
			}

			return array_key_exists( $code, $this->error_data ) ? $this->error_data[ $code ] : null;
		}
	}
}

if ( ! function_exists( 'wphx_boundary_get' ) ) {
	function wphx_boundary_get( $key, $default = false ) {
		return array_key_exists( $key, $GLOBALS['wphx_boundary_options'] ) ? $GLOBALS['wphx_boundary_options'][ $key ] : $default;
	}
}

if ( ! function_exists( 'wphx_boundary_set_global' ) ) {
	function wphx_boundary_set_global( $key, $value ) {
		$GLOBALS['wphx_boundary_options'][ $key ] = $value;

		return $GLOBALS['wphx_boundary_options'][ $key ];
	}
}

if ( ! function_exists( 'wphx_boundary_normalize_key' ) ) {
	function wphx_boundary_normalize_key( $key ) {
		return strtolower( str_replace( ' ', '_', trim( $key ) ) );
	}
}

if ( ! function_exists( 'wphx_boundary_callback' ) ) {
	function wphx_boundary_callback( $callback, $value ) {
		return call_user_func( $callback, $value );
	}
}

if ( ! function_exists( 'wphx_boundary_reference_param' ) ) {
	function wphx_boundary_reference_param( &$value, $suffix = '-ref' ) {
		$value = strtoupper( $value ) . $suffix;

		return strlen( $value );
	}
}

if ( ! function_exists( 'wphx_boundary_reference_return' ) ) {
	function &wphx_boundary_reference_return() {
		if ( ! isset( $GLOBALS['wphx_boundary_reference_store'] ) ) {
			$GLOBALS['wphx_boundary_reference_store'] = 'seed';
		}

		return $GLOBALS['wphx_boundary_reference_store'];
	}
}

if ( ! function_exists( 'wphx_boundary_reference_callback' ) ) {
	function wphx_boundary_reference_callback( $callback, &$value ) {
		$callback( $value );

		return $value;
	}
}

if ( ! function_exists( 'wphx_boundary_error_snapshot' ) ) {
	function wphx_boundary_error_snapshot( $error ) {
		return array(
			'isWpError' => is_object( $error ) && method_exists( $error, 'get_error_code' ),
			'hasErrors' => method_exists( $error, 'has_errors' ) ? $error->has_errors() : false,
			'code'      => $error->get_error_code(),
			'message'   => $error->get_error_message(),
			'data'      => method_exists( $error, 'get_error_data' ) ? $error->get_error_data() : null,
		);
	}
}
