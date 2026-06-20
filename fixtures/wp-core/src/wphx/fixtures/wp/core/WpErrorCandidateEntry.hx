package wphx.fixtures.wp.core;

import wphx.wp.error.WpErrorRuntime;

class WpErrorCandidateEntry
{
	static function main():Void
	{
		WpErrorRuntime.shouldConstruct(false);
	}
}
