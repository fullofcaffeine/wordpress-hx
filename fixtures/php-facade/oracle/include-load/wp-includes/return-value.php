<?php

if ( ! isset( $GLOBALS['wphx_f5_return_count'] ) ) {
	$GLOBALS['wphx_f5_return_count'] = 0;
}

$GLOBALS['wphx_f5_return_count']++;
$GLOBALS['wphx_f5_trace'][] = wphx_f5_oracle_event( 'return-value:included', __FILE__, 'count:' . $GLOBALS['wphx_f5_return_count'] );

return 'return-value:' . $GLOBALS['wphx_f5_return_count'];
