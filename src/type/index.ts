export enum LiveType {
	NotLiveBroadcast = 0,
	StartBroadcasting = 1,
	LiveBroadcast = 2,
	StopBroadcast = 3,
	FirstLiveBroadcast = 4,
}

export type Channel = {
	channelId: string;
	dynamic: boolean;
	live: boolean;
	liveGuardBuy: boolean;
	atAll: boolean;
};

export type ChannelArr = Array<Channel>;

export type TargetItem = {
	channelArr: ChannelArr;
	platform: string;
};

export type Target = Array<TargetItem>;

export type SubItem = {
	id: number;
	uid: string;
	uname: string;
	roomId: string;
	target: Target;
	platform: string;
	live: boolean;
	dynamic: boolean;
	card: {
		enable: boolean;
		cardColorStart: string;
		cardColorEnd: string;
		cardBasePlateColor: string;
		cardBasePlateBorder: string;
	};
};

export type SubManager = Array<SubItem>;

export type MasterInfo = {
	username: string;
	userface: string;
	roomId: number;
	liveOpenFollowerNum: number;
	liveEndFollowerNum: number;
	liveFollowerChange: number;
};

export type LiveUsersItem = {
	face: string;
	is_reserve_recall: boolean;
	jump_url: string;
	mid: number;
	room_id: number;
	title: string;
	uname: string;
};

export type LiveUsers = {
	count: number;
	group: string;
	items: Array<LiveUsersItem>;
};

export type Dynamic = {
	// biome-ignore lint/complexity/noBannedTypes: <explanation>
	basic: Object;
	id_str: string;
	modules: {
		module_author: {
			// biome-ignore lint/complexity/noBannedTypes: <explanation>
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
			// biome-ignore lint/complexity/noBannedTypes: <explanation>
			official_verify: Object;
			// biome-ignore lint/complexity/noBannedTypes: <explanation>
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
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			additional: any;
			desc: null;
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
						rich_text_nodes: Array<{
							emoji?: {
								icon_url: string;
								size: number;
								text: string;
								type: number;
							}
							orig_text: string;
							text: string;
							type: string;
						}>;
						text: string;
					};
					title: string;
				};
				archive: {
					jump_url: string;
					badge: {
						text: string;
					}
					cover: string;
					duration_text: string;
					title: string;
					desc: string;
					stat: {
						play: number;
						danmaku: number;
					}
					bvid: string;
				};
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				draw: any;
				type: string;
			};
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
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

export enum PushType {
	Live = 0,
	Dynamic = 1,
	StartBroadcasting = 2,
	LiveGuardBuy = 3,
}

export type Result = {
	code: number;
	msg?: string;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	data?: any;
};
