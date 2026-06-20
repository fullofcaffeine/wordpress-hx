<?php

$GLOBALS['wphx_f5_trace'][] = wphx_f5_oracle_event( 'scope:included', __FILE__, isset( $existing ) ? $existing : 'missing' );
$scoped_value = 'scoped:' . ( isset( $existing ) ? $existing : 'missing' );

return 'scope:return:' . $scoped_value;
