export enum BiliLoginStatus {
	NOT_LOGIN,
	LOADING_LOGIN_INFO,
	LOGIN_QR,
	LOGGING_QR,
	LOGGING_IN,
	LOGGED_IN,
	LOGIN_SUCCESS,
	LOGIN_FAILED,
}

export type BiliDataServer = {
	status: BiliLoginStatus;
	msg: string;
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	data?: any;
};
