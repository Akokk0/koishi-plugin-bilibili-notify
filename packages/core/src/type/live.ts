export enum LiveType {
	NotLiveBroadcast = 0,
	StartBroadcasting = 1,
	LiveBroadcast = 2,
	StopBroadcast = 3,
	FirstLiveBroadcast = 4,
}

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

export type LiveAPIManager = Map<string, LiveAPIStatus>;

export type LivePushTimerManager = Map<string, () => void>;

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
