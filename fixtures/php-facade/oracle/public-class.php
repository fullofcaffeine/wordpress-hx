<?php

if ( ! interface_exists( 'WPHX_Public_Interface', false ) ) {
	interface WPHX_Public_Interface {
		public function describe();
	}
}

if ( ! class_exists( 'WPHX_Public_Base', false ) ) {
	class WPHX_Public_Base {
		public const BASE_KIND = 'base';

		public $baseValue;

		public function __construct( $base_value = 'base-default' ) {
			$this->baseValue = $base_value;
		}

		public function base_label() {
			return 'base:' . $this->baseValue;
		}
	}
}

if ( ! class_exists( 'WPHX_Public_Class', false ) ) {
	class WPHX_Public_Class extends WPHX_Public_Base implements WPHX_Public_Interface {
		public const KIND = 'fixture';

		public static $instances = 0;

		public $name;
		protected $meta;

		public function __construct( $name, $meta = array() ) {
			parent::__construct( 'base-' . $name );
			$this->name = $name;
			$this->meta = $meta;
			self::$instances++;
		}

		public static function factory( $name ) {
			return new self( $name, array( 'fromFactory' => true ) );
		}

		public function describe() {
			return strtoupper( $this->name ) . ':' . count( $this->meta );
		}

		public function get_meta( $key, $default = null ) {
			return array_key_exists( $key, $this->meta ) ? $this->meta[ $key ] : $default;
		}
	}
}
