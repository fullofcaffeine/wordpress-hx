package wphx.fixtures.compiler.php.template;

/**
	Entry point that keeps the admin-style template segment script reachable.
**/
class TemplateSegmentEntry
{
	static function main():Void
	{
		Type.getClassName(TemplateSegmentAdminStyleScript);
	}
}
