<?php

if ( ! defined( 'ABSPATH' ) ) {
	return 'ABSPATH_REQUIRED';
}

if ( ! function_exists( 'wphx_segment_escape' ) ) {
	function wphx_segment_escape( $value ) {
		return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
	}
}

if ( ! function_exists( 'wphx_segment_row_class' ) ) {
	function wphx_segment_row_class( $index ) {
		return 0 === $index % 2 ? 'row even' : 'row odd';
	}
}

$GLOBALS['wphx_segment_trace'][] = array(
	'event'     => 'admin:begin',
	'title'     => $title,
	'itemCount' => count( $items ),
);

$notice = strtoupper( $notice );
$screen->rendered = true;
?>
<div class="wrap" data-screen="<?php echo wphx_segment_escape( $screen->id ); ?>">
	<h1><?php echo wphx_segment_escape( $title ); ?></h1>
	<div class="notice"><?php echo wphx_segment_escape( $notice ); ?></div>
	<ul class="wp-list-table">
		<?php foreach ( $items as $index => $item ) : ?>
			<li class="<?php echo wphx_segment_escape( wphx_segment_row_class( $index ) ); ?>" data-index="<?php echo wphx_segment_escape( $index ); ?>"><?php echo wphx_segment_escape( $item ); ?></li>
		<?php endforeach; ?>
	</ul>
</div>
<?php
$items[] = 'admin-mutated';
$GLOBALS['wphx_segment_trace'][] = array(
	'event'     => 'admin:end',
	'notice'    => $notice,
	'itemCount' => count( $items ),
);

return array(
	'kind'      => 'admin-segment',
	'notice'    => $notice,
	'itemCount' => count( $items ),
	'marker'    => 'segment:ADMIN',
);
