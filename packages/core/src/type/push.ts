export enum PushType {
	Live = 0,
	Dynamic = 1,
	DynamicAtAll = 2,
	StartBroadcasting = 3,
	LiveGuardBuy = 4,
	WordCloudAndLiveSummary = 5,
	Superchat = 6,
	UserDanmakuMsg = 7,
	UserActions = 8,
}

export const PushTypeMsg = {
	[PushType.Live]: "直播推送",
	[PushType.Dynamic]: "动态推送",
	[PushType.DynamicAtAll]: "动态推送+At全体",
	[PushType.StartBroadcasting]: "开播推送",
	[PushType.LiveGuardBuy]: "上舰推送",
	[PushType.WordCloudAndLiveSummary]: "弹幕词云和直播总结推送",
	[PushType.Superchat]: "SC推送",
	[PushType.UserDanmakuMsg]: "用户弹幕推送",
	[PushType.UserActions]: "用户行为推送",
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
		spacialDanmakuArr?: Array<string>;
		spacialUserEnterTheRoomArr?: Array<string>;
	}
>;
