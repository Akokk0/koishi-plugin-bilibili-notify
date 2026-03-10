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
	spacialDanmaku: boolean;
	spacialUserEnterTheRoom: boolean;
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

export type CustomGuardBuy = {
	enable: boolean;
	guardBuyMsg?: string;
	captainImgUrl?: string;
	supervisorImgUrl?: string;
	governorImgUrl?: string;
};

export type CustomLiveSummary = {
	enable: boolean;
	liveSummary?: Array<string> | string;
};

export type CustomSpecialDanmakuUsers = {
	enable: boolean;
	specialDanmakuUsers?: Array<string>;
	msgTemplate?: string;
};

export type CustomSpecialUsersEnterTheRoom = {
	enable: boolean;
	specialUsersEnterTheRoom?: Array<string>;
	msgTemplate?: string;
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
	customSpecialDanmakuUsers: CustomSpecialDanmakuUsers;
	customSpecialUsersEnterTheRoom: CustomSpecialUsersEnterTheRoom;
};

export type SubManager = Map<string, SubItem>;

export type Subscription = {
	uname: string;
	uid: string;
	roomid: string;
	dynamic: boolean;
	live: boolean;
	liveEnd: boolean;
	target: Target;
	customCardStyle: CustomCardStyle;
	customLiveMsg: CustomLiveMsg;
	customLiveSummary: CustomLiveSummary;
	customGuardBuy: CustomGuardBuy;
	customSpecialDanmakuUsers: CustomSpecialDanmakuUsers;
	customSpecialUsersEnterTheRoom: CustomSpecialUsersEnterTheRoom;
};

export type Subscriptions = Record<string, Subscription>;
