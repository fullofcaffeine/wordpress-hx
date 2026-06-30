<?php
if ( ! defined( 'ABSPATH' ) ) {
	return 'ABSPATH_REQUIRED';
}

if ( ! function_exists( 'wphx_nested_segment_escape' ) ) {
	function wphx_nested_segment_escape( $value ) {
		return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
	}
}

$GLOBALS['wphx_nested_segment_trace'][] = array(
	'event'     => 'parent:begin',
	'title'     => $title,
	'itemCount' => count( $items ),
);
$partial_marker = 'from-parent';
?>
<section class="wphx-nested" data-screen="<?php echo wphx_nested_segment_escape( $screen->id ); ?>">
	<h2><?php echo wphx_nested_segment_escape( $title ); ?></h2>
	<?php $partial_return = include __DIR__ . '/includes/wphx-template-nested-partial.php'; ?>
	<footer data-count="<?php echo wphx_nested_segment_escape( count( $items ) ); ?>"><?php echo wphx_nested_segment_escape( $partial_return['marker'] ); ?></footer>
</section>
<?php
$GLOBALS['wphx_nested_segment_trace'][] = array(
	'event'     => 'parent:end',
	'partial'   => $partial_return,
	'itemCount' => count( $items ),
);

return array(
	'kind'      => 'nested-parent',
	'partial'   => $partial_return,
	'itemCount' => count( $items ),
	'marker'    => 'segment:NESTED-PARENT',
);
