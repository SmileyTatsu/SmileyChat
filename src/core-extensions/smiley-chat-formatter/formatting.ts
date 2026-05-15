import { parseInlineMarkdown, renderMarkdownBlocks } from "./markdown";
import { FormatterApi, FormatterNode, paragraphize } from "./nodes";
import { getFormatterSettings } from "./settings";
import { parseXmlNodeList } from "./xml-tags";

export function renderFormatted(api: FormatterApi, content: string) {
    if (getFormatterSettings().markdown) {
        return renderMarkdownBlocks(api, content, (inlineContent) =>
            renderInlineContent(api, inlineContent),
        );
    }

    return paragraphize(api, renderInlineContent(api, content));
}

export function renderPlain(api: FormatterApi, content: string) {
    return paragraphize(api, [content]);
}

function renderInlineContent(api: FormatterApi, content: string): FormatterNode[] {
    const settings = getFormatterSettings();
    const markdownNodes = settings.markdown
        ? parseInlineMarkdown(api, content, (inlineContent) =>
              renderInlineContent(api, inlineContent),
          )
        : [content];

    return settings.xmlTags ? parseXmlNodeList(api, markdownNodes) : markdownNodes;
}
