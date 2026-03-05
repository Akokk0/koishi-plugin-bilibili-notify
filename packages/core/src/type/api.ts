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

export type MySelfInfoData = {
	code: number;
	message: string;
	ttl: number;
	data: {
		mid: number;
	};
};

export type UserCardInfoData = {
	code: number;
	message: string;
	ttl: number;
	data: {
		card: {
			mid: string;
			approve: boolean;
			name: string;
			sex: string;
			face: string;
			DisplayRank: string;
			regtime: number;
			spacesta: number;
			birthday: string;
			place: string;
			description: string;
			article: number;
			attention: number;
			sign: string;
			level_info: {
				current_level: number;
				current_min: number;
				current_exp: number;
				next_exp: number;
			};
			pendant: {
				pid: number;
				name: string;
				image: string;
				expire: number;
			};
			nameplate: {
				nid: number;
				name: string;
				image: string;
				image_small: string;
				level: string;
				condition: string;
			};
			Official: {
				role: number;
				title: string;
				desc: string;
				type: number;
			};
			official_verify: {
				type: number;
				desc: string;
			};
			vip: {
				vipType: number;
				dueRemark: string;
				accessStatus: number;
				vipStatus: number;
				vipStatusWarn: string;
				theme_type: number;
			};
		};
		space: {
			s_img: string;
			l_img: string;
		};
		following: boolean;
		archive_count: number;
		article_count: number;
		follower: number;
		like_num: number;
	};
};
