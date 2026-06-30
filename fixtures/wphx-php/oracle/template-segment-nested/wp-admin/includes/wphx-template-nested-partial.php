<?php
$GLOBALS['wphx_nested_segment_trace'][] = array(
	'event'     => 'partial:begin',
	'marker'    => $partial_marker,
	'itemCount' => count( $items ),
);
$items[]         = 'partial-mutated';
$screen->partial = $partial_marker;
?>
<div class="wphx-partial" data-marker="<?php echo wphx_nested_segment_escape( $partial_marker ); ?>">
	<span><?php echo wphx_nested_segment_escape( end( $items ) ); ?></span>
</div>
<?php
$GLOBALS['wphx_nested_segment_trace'][] = array(
	'event'     => 'partial:end',
	'itemCount' => count( $items ),
);

return array(
	'kind'        => 'nested-partial',
	'marker'      => 'segment:NESTED-PARTIAL',
	'localMarker' => $partial_marker,
	'itemCount'   => count( $items ),
);
