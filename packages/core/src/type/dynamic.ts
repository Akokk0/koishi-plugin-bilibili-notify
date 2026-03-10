export type RichTextNode = Array<{
	emoji?: {
		icon_url: string;
		size: number;
		text: string;
		type: number;
	};
	orig_text: string;
	text: string;
	type: string;
}>;

export type Dynamic = {
	// biome-ignore lint/complexity/noBannedTypes: <Object>
	basic: Object;
	id_str: string;
	modules: {
		module_author: {
			// biome-ignore lint/complexity/noBannedTypes: <Object>
			avatar: Object;
			decorate: {
				card_url: string;
				fan: {
					num_str: number;
					color: string;
				};
			};
			face: string;
			face_nft: boolean;
			following: boolean;
			jump_url: string;
			label: string;
			mid: number;
			name: string;
			// biome-ignore lint/complexity/noBannedTypes: <Object>
			official_verify: Object;
			// biome-ignore lint/complexity/noBannedTypes: <Object>
			pendant: Object;
			pub_action: string;
			pub_action_text: string;
			pub_location_text: string;
			pub_time: string;
			pub_ts: number;
			type: string;
			vip: {
				type: number;
			};
		};
		module_dynamic: {
			// biome-ignore lint/suspicious/noExplicitAny: <any>
			additional: any;
			desc: {
				rich_text_nodes: Array<{
					orig_text: string;
					text: string;
					type: string;
					emoji: {
						icon_url: string;
						size: number;
						text: string;
						type: number;
					};
					jump_url: string;
					rid: string;
					goods: {
						jump_url: string;
						type: number;
					};
					icon_name: string;
				}>;
				text: string;
			};
			major: {
				opus: {
					fold_action: Array<string>;
					jump_url: string;
					pics: Array<{
						height: number;
						live_url: string;
						size: number;
						url: string;
						width: number;
					}>;
					summary: {
						rich_text_nodes: RichTextNode;
						text: string;
					};
					title: string;
				};
				archive: {
					jump_url: string;
					badge: {
						text: string;
					};
					cover: string;
					duration_text: string;
					title: string;
					desc: string;
					stat: {
						play: number;
						danmaku: number;
					};
					bvid: string;
				};
				// biome-ignore lint/suspicious/noExplicitAny: <any>
				draw: any;
				type: string;
			};
			// biome-ignore lint/suspicious/noExplicitAny: <any>
			topic: any;
		};
		module_stat: {
			comment: {
				count: number;
			};
			forward: {
				count: number;
			};
			like: {
				count: number;
			};
		};
	};
	orig?: Dynamic;
	type: string;
	visible: boolean;
};

export type AllDynamicInfo = {
	code: number;
	message: string;
	data: {
		has_more: boolean;
		items: Array<Dynamic>;
		offset: string;
		update_baseline: string;
		update_num: number;
	};
};

export type DynamicTimelineManager = Map<string, number>;
