<?php

$GLOBALS['wphx_f5_trace'][] = wphx_f5_oracle_event( 'pluggable:included', __FILE__, 'conditional' );

if ( ! function_exists( 'wphx_f5_pluggable' ) ) {
	function wphx_f5_pluggable() {
		return 'haxe:PLUGGABLE';
	}
}

return 'pluggable:available';
