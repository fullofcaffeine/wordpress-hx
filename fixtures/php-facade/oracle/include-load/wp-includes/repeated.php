<?php

if ( ! isset( $GLOBALS['wphx_f5_repeated_count'] ) ) {
	$GLOBALS['wphx_f5_repeated_count'] = 0;
}

$GLOBALS['wphx_f5_repeated_count']++;
$GLOBALS['wphx_f5_trace'][] = wphx_f5_oracle_event( 'repeated:included', __FILE__, 'count:' . $GLOBALS['wphx_f5_repeated_count'] );

return 'repeated:' . $GLOBALS['wphx_f5_repeated_count'];
