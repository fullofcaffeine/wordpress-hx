package wphx.fixtures.wp.core;

import wphx.wp.options.PureOptionCache;

class OptionCacheCandidateEntry
{
	static function main():Void
	{
		PureOptionCache.determineOptionAutoloadValue("bool:true", null);
		PureOptionCache.filterDefaultAutoloadValueViaOptionSize(null, "seed", false, 150000);
		PureOptionCache.cacheSupports("flush_group");
	}
}
