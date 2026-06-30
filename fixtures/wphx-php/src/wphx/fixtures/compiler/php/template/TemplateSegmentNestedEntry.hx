package wphx.fixtures.compiler.php.template;

/**
	Entry point that keeps the nested template segment scripts reachable.
**/
class TemplateSegmentNestedEntry
{
	static function main():Void
	{
		Type.getClassName(TemplateSegmentNestedParentScript);
		Type.getClassName(TemplateSegmentNestedPartialScript);
	}
}
