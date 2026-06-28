package wphx.wp.http;

@:keep
function shouldRejectRedirect(isValidLocation:Bool):Bool
{
	return !isValidLocation;
}
