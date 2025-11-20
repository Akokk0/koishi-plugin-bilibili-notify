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
	dynamicAtAll: boolean;
	live: boolean;
	liveAtAll: boolean;
	liveGuardBuy: boolean;
	superchat: boolean;
	wordcloud: boolean;
	liveSummary: boolean;
};

export type ChannelArr = Array<Channel>;

export type TargetItem = {
	channelArr: ChannelArr;
	platform: string;
};

export type Target = Array<TargetItem>;

export type CustomCardStyle = {
	enable: boolean;
	cardColorStart?: string;
	cardColorEnd?: string;
	cardBasePlateColor?: string;
	cardBasePlateBorder?: string;
};

export type CustomLiveMsg = {
	enable: boolean;
	customLiveStart?: string;
	customLive?: string;
	customLiveEnd?: string;
};

export type CustomGuardBuyImg = {
	enable: boolean;
	captainImgUrl?: string;
	supervisorImgUrl?: string;
	governorImgUrl?: string;
};

export type CustomLiveSummary = {
	enable: boolean;
	liveSummary?: string;
};

export type SubItem = {
	uname: string;
	roomId: string;
	target: Target;
	live: boolean;
	dynamic: boolean;
	customCardStyle: CustomCardStyle;
	customLiveMsg: CustomLiveMsg;
	customLiveSummary: CustomLiveSummary;
};

export type SubManager = Map<string, SubItem>;

export type MasterInfo = {
	username: string;
	userface: string;
	roomId: number;
	liveOpenFollowerNum: number;
	liveEndFollowerNum: number;
	liveFollowerChange: number;
	medalName: string;
};

export type MasterInfoR = {
	code: number;
	msg: string;
	message: string;
	data: {
		info: {
			uid: number;
			uname: string;
			face: string;
			official_verify: {
				type: number;
				desc: string;
			};
			gender: number;
		};
		exp: {
			master_level: {
				level: number;
				color: number;
				current: Array<number>;
				next: Array<number>;
			};
		};
		follower_num: number;
		room_id: number;
		medal_name: string;
		glory_count: number;
		pendant: string;
		link_group_num: number;
		room_news: {
			content: string;
			ctime: string;
			ctime_text: string;
		};
	};
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

export type Live = {
	code: number;
	message: string;
	msg: string;
	data: {
		[key: string]: {
			title: string;
			room_id: number;
			uid: number;
			online: number;
			live_time: number;
			live_status: number;
			short_id: number;
			area: number;
			area_name: string;
			area_v2_id: number;
			area_v2_name: string;
			area_v2_parent_name: string;
			area_v2_parent_id: number;
			uname: string;
			face: string;
			tag_name: string;
			tags: string;
			cover_from_user: string;
			keyframe: string;
			lock_till: string;
			hidden_till: string;
			broadcast_type: number;
		};
	};
};

export type LiveAPIStatus = {
	live: boolean;
	roomId: string;
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	liveRoomInfo: any;
	masterInfo: MasterInfo;
	watchedNum: string;
	liveStartTimeInit: boolean;
	liveStartTime: string;
	push: number;
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
	DynamicAtAll = 2,
	StartBroadcasting = 3,
	LiveGuardBuy = 4,
	WordCloudAndLiveSummary = 5,
	Superchat = 6,
}

export const PushTypeMsg = {
	[PushType.Live]: "直播推送",
	[PushType.Dynamic]: "动态推送",
	[PushType.DynamicAtAll]: "动态推送+At全体",
	[PushType.StartBroadcasting]: "开播推送",
	[PushType.LiveGuardBuy]: "上舰推送",
	[PushType.WordCloudAndLiveSummary]: "弹幕词云和直播总结推送",
	[PushType.Superchat]: "SC推送",
};

export type Result = {
	code: number;
	message?: string;
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	data?: any;
};

export type CreateGroup = {
	code: number;
	message: string;
	ttl: number;
	data: {
		tagid: number;
	};
};

export type GroupList = {
	code: number;
	message: string;
	ttl: number;
	data: Array<{
		tagid: number;
		name: string;
		count: number;
		tip: string;
	}>;
};

export type PushArrMap = Map<
	string,
	{
		dynamicArr?: Array<string>;
		dynamicAtAllArr?: Array<string>;
		liveArr?: Array<string>;
		liveAtAllArr?: Array<string>;
		liveGuardBuyArr?: Array<string>;
		wordcloudArr?: Array<string>;
		superchatArr?: Array<string>;
		liveSummaryArr?: Array<string>;
	}
>;

export type BiliTicket = {
	code: number;
	message: string;
	data: {
		ticket: string;
		create_at: number;
		ttl: number;
		// biome-ignore lint/complexity/noBannedTypes: <obj>
		context: {};
		nav: {
			img: string;
			sub: string;
		};
	};
	ttl: number;
};

export type BACookie = {
	key: string;
	value: string;
	expires: string;
	domain: string;
	path: string;
	secure: boolean;
	hostOnly: boolean;
	httpOnly: boolean;
	sameSite: string;
	creation: string;
	lastAccessed: string;
};

export type V_VoucherCaptchaData = {
	code: number;
	message: string;
	ttl: number;
	data: {
		type: string;
		token: string;
		geetest: {
			gt: string;
			challenge: string;
		};
		biliword: null;
		phone: null;
		sms: null;
	};
};

export type ValidateCaptchaData = {
	code: number;
	message: string;
	ttl: number;
	data: {
		is_valid: number;
		grisk_id: string;
	};
};

export type Subscription = {
	uname: string;
	uid: string;
	roomid: string;
	dynamic: boolean;
	live: boolean;
	target: Target;
	customCardStyle: CustomCardStyle;
	customLiveMsg: CustomLiveMsg;
	customLiveSummary: CustomLiveSummary;
	customGuardBuyImg: CustomGuardBuyImg;
};

export type Subscriptions = Record<string, Subscription>;

export type DynamicTimelineManager = Map<string, number>;

export type LiveAPIManager = Map<string, LiveAPIStatus>;

export type LiveWSManager = Map<string, () => void>;

type LiveRoomInfoDataFrame = {
	name: string;
	value: string;
	position: number;
	desc: string;
	area: number;
	area_old: number;
	bg_color: string;
	bg_pic: string;
	use_old_area: boolean;
};

type LiveRoomInfoDataBadge = {
	name: string;
	position: number;
	value: string;
	desc: string;
};

export type LiveRoomInfo = {
	code: number;
	message: string;
	msg: string;
	data: {
		uid: number;
		room_id: number;
		short_id: number;
		attention: number;
		online: number;
		is_portrait: boolean;
		description: string;
		live_status: number;
		area_id: number;
		parent_area_id: number;
		parent_area_name: string;
		old_area_id: number;
		background: string;
		title: string;
		user_cover: string;
		keyframe: string;
		is_strict_room: boolean;
		live_time: string;
		tags: string;
		is_anchor: number;
		room_silent_type: string;
		room_silent_level: number;
		room_silent_second: number;
		area_name: string;
		pardants: string;
		area_pardants: string;
		hot_words: Array<string>;
		hot_words_status: number;
		verify: string;
		new_pendants: {
			frame: LiveRoomInfoDataFrame;
			mobile_frame: LiveRoomInfoDataFrame | null;
			badge: LiveRoomInfoDataBadge;
			mobile_badge: LiveRoomInfoDataBadge | null;
		};
		up_session: string;
		pk_status: number;
		pk_id: number;
		battle_id: number;
		allow_change_area_time: number;
		allow_upload_cover_time: number;
		studio_info: {
			status: number;
			master_list: [];
		};
	};
};

export type LiveData = {
	watchedNum?: string;
	likedNum?: string;
	fansNum?: string;
	fansChanged?: string;
};

export type UserInfoInLiveData = {
	uid: number;
	uname: string;
	face: string;
	verify_type: number;
	desc: string;
	uname_color: string;
	room_id: number;
	pendant: string;
	pendant_from: number;
	follow_num: number;
	attention_num: number;
	relation_status: number;
	privilege_type: number;
	is_admin: number;
	fans_medal: {
		medal_id: number;
		medal_name: string;
		level: number;
		medal_color: number;
		target_id: number;
		medal_icon_id: number;
		medal_icon_url: string;
		anchor_id: number;
		uid: number;
		medal_color_start: number;
		medal_color_end: number;
		medal_color_border: number;
		is_lighted: number;
		guard_level: number;
	};
	guard: {
		accompany: number;
		accompany_slake: number;
	};
};
