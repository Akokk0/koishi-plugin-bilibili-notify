export enum LiveType {
	NotLiveBroadcast = 0,
	StartBroadcasting = 1,
	LiveBroadcast = 2,
	StopBroadcast = 3,
	FirstLiveBroadcast = 4,
}

export type ChannelIdArr = Array<{
	channelId: string;
	dynamic: boolean;
	live: boolean;
	liveGuardBuy: boolean;
	atAll: boolean;
}>;

export type TargetItem = {
	channelIdArr: ChannelIdArr;
	platform: string;
};

export type Target = Array<TargetItem>;

export type SubItem = {
	id: number;
	uid: string;
	roomId: string;
	target: Target;
	platform: string;
	live: boolean;
	dynamic: boolean;
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
