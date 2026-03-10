import type { Dynamic } from "../type";

export interface DynamicFilterConfig {
	enable?: boolean;
	regex?: string;
	keywords?: Array<string>;
	forward?: boolean;
	article?: boolean;
	whitelistEnable?: boolean;
	whitelistRegex?: string;
	whitelistKeywords?: Array<string>;
}

export enum DynamicFilterReason {
	BlacklistKeyword = "blacklist-keyword",
	BlacklistForward = "blacklist-forward",
	BlacklistArticle = "blacklist-article",
	WhitelistUnmatched = "whitelist-unmatched",
}

export interface DynamicFilterResult {
	blocked: boolean;
	reason?: DynamicFilterReason;
}

function collectRichText(dynamic: Dynamic, texts: Array<string>) {
	const richTextNodes = dynamic.modules?.module_dynamic?.desc?.rich_text_nodes;
	if (richTextNodes?.length) {
		texts.push(richTextNodes.map((node) => node.text ?? "").join(""));
	}

	const summaryNodes =
		dynamic.modules?.module_dynamic?.major?.opus?.summary?.rich_text_nodes;
	if (summaryNodes?.length) {
		texts.push(summaryNodes.map((node) => node.text ?? "").join(""));
	}

	const title = dynamic.modules?.module_dynamic?.major?.opus?.title;
	if (title) {
		texts.push(title);
	}

	const archiveTitle = dynamic.modules?.module_dynamic?.major?.archive?.title;
	if (archiveTitle) {
		texts.push(archiveTitle);
	}
}

function getDynamicText(dynamic: Dynamic) {
	const texts: Array<string> = [];
	collectRichText(dynamic, texts);
	if (dynamic.orig) {
		collectRichText(dynamic.orig, texts);
	}
	return texts.join("\n");
}

function safeRegexTest(pattern: string, text: string) {
	if (!pattern) return false;
	try {
		return new RegExp(pattern).test(text);
	} catch {
		return false;
	}
}

function testKeywordMatched(text: string, keywords: Array<string>) {
	if (!keywords?.length) return false;
	return keywords.some((keyword) => keyword && text.includes(keyword));
}

export function filterDynamic(
	dynamic: Dynamic,
	config: DynamicFilterConfig,
): DynamicFilterResult {
	const normalizedConfig = {
		enable: false,
		regex: "",
		keywords: [] as Array<string>,
		forward: false,
		article: false,
		whitelistEnable: false,
		whitelistRegex: "",
		whitelistKeywords: [] as Array<string>,
		...config,
	};

	if (normalizedConfig.enable) {
		if (normalizedConfig.forward && dynamic.type === "DYNAMIC_TYPE_FORWARD") {
			return { blocked: true, reason: DynamicFilterReason.BlacklistForward };
		}
		if (normalizedConfig.article && dynamic.type === "DYNAMIC_TYPE_ARTICLE") {
			return { blocked: true, reason: DynamicFilterReason.BlacklistArticle };
		}

		const dynamicText = getDynamicText(dynamic);
		const regexMatched = safeRegexTest(normalizedConfig.regex, dynamicText);
		const keywordMatched = testKeywordMatched(
			dynamicText,
			normalizedConfig.keywords,
		);
		if (regexMatched || keywordMatched) {
			return { blocked: true, reason: DynamicFilterReason.BlacklistKeyword };
		}
	}

	if (normalizedConfig.whitelistEnable) {
		const dynamicText = getDynamicText(dynamic);
		const whitelistRegexMatched = safeRegexTest(
			normalizedConfig.whitelistRegex,
			dynamicText,
		);
		const whitelistKeywordMatched = testKeywordMatched(
			dynamicText,
			normalizedConfig.whitelistKeywords,
		);
		const hasWhitelistRule =
			!!normalizedConfig.whitelistRegex ||
			normalizedConfig.whitelistKeywords.length > 0;

		if (
			hasWhitelistRule &&
			!whitelistRegexMatched &&
			!whitelistKeywordMatched
		) {
			return { blocked: true, reason: DynamicFilterReason.WhitelistUnmatched };
		}
	}

	return { blocked: false };
}
