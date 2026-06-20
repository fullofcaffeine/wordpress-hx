<?php

namespace {
	if ( ! interface_exists( 'WPHX_Public_Contract', false ) ) {
		interface WPHX_Public_Contract {
			public function describe( string $prefix = '' ): string;
		}
	}

	if ( ! trait_exists( 'WPHX_Public_Trait', false ) ) {
		trait WPHX_Public_Trait {
			protected $traitValue = 'trait-seed';

			public function trait_label( string $suffix = '' ): string {
				return 'trait:' . $this->name . ( '' === $suffix ? '' : ':' . $suffix );
			}
		}
	}

	if ( ! class_exists( 'WPHX_Public_Base', false ) ) {
		class WPHX_Public_Base {
			public const BASE_KIND = 'base';

			public $baseValue;

			public function __construct( string $base_value = 'base-default' ) {
				$this->baseValue = $base_value;
			}

			public function base_label(): string {
				return 'base:' . $this->baseValue;
			}
		}
	}

	if ( ! class_exists( 'WPHX_Public_Class', false ) ) {
		class WPHX_Public_Class extends WPHX_Public_Base implements WPHX_Public_Contract {
			use WPHX_Public_Trait;

			public const KIND = 'fixture';

			public static $instances = 0;

			public $name;
			protected $meta;

			public function __construct( string $name, array $meta = array() ) {
				parent::__construct( 'base-' . $name );
				$this->name = $name;
				$this->meta = $meta;
				self::$instances++;
			}

			public static function factory( string $name ): self {
				return new self( $name, array( 'fromFactory' => true ) );
			}

			public function describe( string $prefix = '' ): string {
				$head = '' === $prefix ? '' : $prefix . ':';

				return $head . strtoupper( $this->name ) . ':' . count( $this->meta );
			}

			public function get_meta( string $key, $default = null ) {
				return array_key_exists( $key, $this->meta ) ? $this->meta[ $key ] : $default;
			}
		}
	}
}

namespace WordPress\WPHX\Fixture {
	if ( ! interface_exists( __NAMESPACE__ . '\\NamespacedContract', false ) ) {
		interface NamespacedContract {
			public function namespacedDescribe( string $prefix = 'ns' ): string;
		}
	}

	if ( ! trait_exists( __NAMESPACE__ . '\\NamespacedTrait', false ) ) {
		trait NamespacedTrait {
			public function namespacedTraitLabel( string $suffix = '' ): string {
				return 'ns-trait:' . $this->name . ( '' === $suffix ? '' : ':' . $suffix );
			}
		}
	}

	if ( ! class_exists( __NAMESPACE__ . '\\NamespacedImplementation', false ) ) {
		class NamespacedImplementation implements NamespacedContract {
			use NamespacedTrait;

			public const KIND = 'namespaced';

			public static $instances = 0;

			public $name;

			public function __construct( string $name = 'core' ) {
				$this->name = $name;
				self::$instances++;
			}

			public function namespacedDescribe( string $prefix = 'ns' ): string {
				return $prefix . ':' . strtolower( $this->name );
			}
		}
	}
}
