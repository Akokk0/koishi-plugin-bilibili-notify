// biome-ignore assist/source/organizeImports: <import>
import { type Awaitable, type Context, Schema, Service } from "koishi";
import md5 from "md5";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { DateTime } from "luxon";
import axios, { type AxiosInstance } from "axios";
import { CookieJar, Cookie } from "tough-cookie";
import { JSDOM } from "jsdom";
import type { Notifier } from "@koishijs/plugin-notifier";

import type {
	BACookie,
	BiliTicket,
	V_VoucherCaptchaData,
	ValidateCaptchaData,
} from "./type";
import { CronJob } from "cron";

declare module "koishi" {
	interface Context {
		"bilibili-notify-api": BiliAPI;
	}
}

const mixinKeyEncTab = [
	46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
	33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
	26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
	20, 34, 44, 52,
];

// 在getUserInfo中检测到番剧出差的UID时，要传回的数据：
const bangumiTripData = { code: 0, data: { live_room: { roomid: 931774 } } };

const GET_USER_SPACE_DYNAMIC_LIST =
	"https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?platform=web&features=itemOpusStyle";
const GET_ALL_DYNAMIC_LIST =
	"https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?platform=web&features=itemOpusStyle";
const HAS_NEW_DYNAMIC =
	"https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all/update";
const GET_COOKIES_INFO =
	"https://passport.bilibili.com/x/passport-login/web/cookie/info";
const GET_USER_INFO = "https://api.bilibili.com/x/space/wbi/acc/info";
const GET_MYSELF_INFO = "https://api.bilibili.com/x/member/web/account";
const GET_LOGIN_QRCODE =
	"https://passport.bilibili.com/x/passport-login/web/qrcode/generate";
const GET_LOGIN_STATUS =
	"https://passport.bilibili.com/x/passport-login/web/qrcode/poll";
const GET_LIVE_ROOM_INFO =
	"https://api.live.bilibili.com/room/v1/Room/get_info";
const GET_MASTER_INFO =
	"https://api.live.bilibili.com/live_user/v1/Master/info";
const GET_TIME_NOW = "https://api.bilibili.com/x/report/click/now";
const GET_SERVER_UTC_TIME = "https://interface.bilibili.com/serverdate.js";

// 最近更新UP
const GET_LATEST_UPDATED_UPS =
	"https://api.bilibili.com/x/polymer/web-dynamic/v1/portal";

// 操作
const MODIFY_RELATION = "https://api.bilibili.com/x/relation/modify";
const CREATE_GROUP = "https://api.bilibili.com/x/relation/tag/create";
const MODIFY_GROUP_MEMBER = "https://api.bilibili.com/x/relation/tags/addUsers";
const GET_ALL_GROUP = "https://api.bilibili.com/x/relation/tags";
const COPY_USER_TO_GROUP = "https://api.bilibili.com/x/relation/tags/copyUsers";
const GET_RELATION_GROUP_DETAIL = "https://api.bilibili.com/x/relation/tag";

// 直播
const GET_LIVE_ROOM_INFO_STREAM_KEY =
	"https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo";
const GET_LIVE_ROOMS_INFO =
	"https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids";

class BiliAPI extends Service {
	static inject = ["database", "notifier"];

	jar: CookieJar;
	client: AxiosInstance;
	apiConfig: BiliAPI.Config;
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	cacheable: any;
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	loginData: any;
	loginNotifier: Notifier;
	refreshCookieTimer: () => void;
	loginInfoIsLoaded = false;

	wbiSign = { img_key: "", sub_key: "" };
	// Cron job
	updateJob: CronJob;
	// p-retry
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	pRetry: any;
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	AbortError: any;

	constructor(ctx: Context, config: BiliAPI.Config) {
		super(ctx, "bilibili-notify-api");
		this.apiConfig = config;
	}

	protected async start(): Promise<void> {
		// 导入p-retry
		this.pRetry = (await import("p-retry")).default;
		// 导入AbortError
		this.AbortError = (await import("p-retry")).AbortError;
		// 导入dns缓存
		const CacheableLookup = (await import("cacheable-lookup")).default;
		// 注册dns缓存
		this.cacheable = new CacheableLookup();
		// 安装缓存
		this.cacheable.install(http.globalAgent);
		this.cacheable.install(https.globalAgent);
		// 创建cookieJar
		this.jar = new CookieJar();
		// 创建新的http客户端(axios)
		await this.createNewClient();
		// 从数据库加载cookies
		await this.loadCookiesFromDatabase();
		// 开启定时任务更新biliTicket(每天凌晨0点进行更新)
		this.updateJob = new CronJob("0 0 * * *", async () => {
			await this.updateBiliTicket();
		});
		// 开启定时任务
		this.updateJob.start();
		// 更新biliTicket
		await this.updateBiliTicket();
	}

	protected stop(): Awaitable<void> {
		// 卸载dns缓存
		this.cacheable.uninstall(http.globalAgent);
		this.cacheable.uninstall(https.globalAgent);
		// 关闭定时任务
		this.updateJob.stop();
	}

	async updateBiliTicket() {
		try {
			// 获取csrf
			const csrf = this.getCSRF();
			// 获取biliTicket
			const ticket = (await this.getBiliTicket(csrf)) as BiliTicket;
			// 判断ticket是否成功
			if (ticket.code !== 0) {
				// 如果失败则抛出错误
				throw new Error(`获取BiliTicket失败: ${ticket.message}`);
			}
			// 添加cookie到cookieJar
			// this.addCookie(`bili_ticket=${ticket.data.ticket}`);
			// 获取wbi签名的img_key和sub_key
			this.wbiSign.img_key = ticket.data.nav.img.slice(
				ticket.data.nav.img.lastIndexOf("/") + 1,
				ticket.data.nav.img.lastIndexOf("."),
			);
			this.wbiSign.sub_key = ticket.data.nav.sub.slice(
				ticket.data.nav.sub.lastIndexOf("/") + 1,
				ticket.data.nav.sub.lastIndexOf("."),
			);
		} catch (e) {
			// 如果获取失败则在控制台输出错误
			this.logger.error(`更新BiliTicket失败: ${e.message}`);
		}
	}

	// WBI签名
	// 对 imgKey 和 subKey 进行字符顺序打乱编码
	getMixinKey = (orig: string) =>
		mixinKeyEncTab
			.map((n) => orig[n])
			.join("")
			.slice(0, 32);

	// 为请求参数进行 wbi 签名
	encWbi(
		params: { [key: string]: string | number | object },
		img_key: string,
		sub_key: string,
	) {
		const mixin_key = this.getMixinKey(img_key + sub_key);
		const curr_time = Math.round(DateTime.now().toSeconds() / 1000);
		const chr_filter = /[!'()*]/g;

		Object.assign(params, { wts: curr_time }); // 添加 wts 字段
		// 按照 key 重排参数
		const query = Object.keys(params)
			.sort()
			.map((key) => {
				// 过滤 value 中的 "!'()*" 字符
				const value = params[key].toString().replace(chr_filter, "");
				return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
			})
			.join("&");

		const wbi_sign = md5(query + mixin_key); // 计算 w_rid

		return `${query}&w_rid=${wbi_sign}`;
	}

	async getWbi(params: { [key: string]: string | number | object }) {
		const web_keys = this.wbiSign || (await this.getWbiKeys());
		const img_key = web_keys.img_key;
		const sub_key = web_keys.sub_key;
		const query = this.encWbi(params, img_key, sub_key);
		return query;
	}

	encrypt(text: string): string {
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv(
			"aes-256-cbc",
			Buffer.from(this.apiConfig.key),
			iv,
		);
		const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
		return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
	}

	decrypt(text: string): string {
		const textParts = text.split(":");
		const iv = Buffer.from(textParts.shift(), "hex");
		const encryptedText = Buffer.from(textParts.join(":"), "hex");
		const decipher = crypto.createDecipheriv(
			"aes-256-cbc",
			Buffer.from(this.apiConfig.key),
			iv,
		);
		const decrypted = Buffer.concat([
			decipher.update(encryptedText),
			decipher.final(),
		]);
		return decrypted.toString();
	}

	// BA API
	async getTheUserWhoIsLiveStreaming() {
		const run = async () => {
			// 获取直播间信息流密钥
			const { data } = await this.client.get(GET_LATEST_UPDATED_UPS);
			// 返回data
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getTheUserWhoIsLiveStreaming() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getLiveRoomInfoStreamKey(roomId: string) {
		const run = async () => {
			// 获取直播间信息流密钥
			const { data } = await this.client.get(
				`${GET_LIVE_ROOM_INFO_STREAM_KEY}?id=${roomId}`,
			);
			// 返回data
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getLiveRoomInfoStreamKey() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getLiveRoomInfoByUids(uids: string[]) {
		const run = async () => {
			// 构建查询参数
			const params = uids.map((uid) => `uids[]=${uid}`).join("&");
			// 获取直播间信息
			const { data } = await this.client.get(
				`${GET_LIVE_ROOMS_INFO}?${params}`,
			);
			// 返回数据
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getLiveRoomInfoByUids() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getServerUTCTime() {
		const run = async () => {
			const { data } = await this.client.get(GET_SERVER_UTC_TIME);
			const regex = /Date\.UTC\((.*?)\)/;
			const match = data.match(regex);
			if (match) {
				const timestamp = new Function(`return Date.UTC(${match[1]})`)();
				return timestamp / 1000;
			}
			throw new this.AbortError("解析服务器时间失败！");
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getServerUTCTime() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getTimeNow() {
		const run = async () => {
			const { data } = await this.client.get(GET_TIME_NOW);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getTimeNow() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getAllGroup() {
		const run = async () => {
			const { data } = await this.client.get(GET_ALL_GROUP);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getAllGroup() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async removeUserFromGroup(mid: string) {
		const run = async () => {
			// 获取csrf
			const csrf = this.getCSRF();
			// 将用户mid添加到groupId
			const { data } = await this.client.post(
				MODIFY_GROUP_MEMBER,
				{
					fids: mid,
					tagids: 0,
					csrf,
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`removeUserFromGroup() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async copyUserToGroup(mid: string, groupId: string) {
		const run = async () => {
			// 获取csrf
			const csrf = this.getCSRF();
			// 将用户mid添加到groupId
			const { data } = await this.client.post(
				COPY_USER_TO_GROUP,
				{
					fids: mid,
					tagids: groupId,
					csrf,
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`copyUserToGroup() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getUserSpaceDynamic(mid: string) {
		const run = async () => {
			const { data } = await this.client.get(
				`${GET_USER_SPACE_DYNAMIC_LIST}&host_mid=${mid}`,
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getUserSpaceDynamic() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async createGroup(tag: string) {
		const run = async () => {
			const { data } = await this.client.post(
				CREATE_GROUP,
				{
					tag,
					csrf: this.getCSRF(),
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`createGroup() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getAllDynamic() {
		const run = async () => {
			const { data } = await this.client.get(GET_ALL_DYNAMIC_LIST);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getAllDynamic() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async hasNewDynamic(updateBaseline: string) {
		const run = async () => {
			const { data } = await this.client.get(
				`${HAS_NEW_DYNAMIC}?update_baseline=${updateBaseline}`,
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`hasNewDynamic() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async follow(fid: string) {
		const run = async () => {
			const { data } = await this.client.post(
				MODIFY_RELATION,
				{
					fid,
					act: 1,
					re_src: 11,
					csrf: this.getCSRF(),
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`follow() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getRelationGroupDetail(tagid: string) {
		const run = async () => {
			const { data } = await this.client.get(
				`${GET_RELATION_GROUP_DETAIL}?tagid=${tagid}`,
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getRelationGroupDetail() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	// Check if Token need refresh
	async getCookieInfo(refreshToken: string) {
		const run = async () => {
			const { data } = await this.client
				.get(`${GET_COOKIES_INFO}?csrf=${refreshToken}`)
				.catch((e) => {
					this.logger.info(e.message);
					return null;
				});
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getCookieInfo() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getUserInfo(mid: string, grisk_id?: string) {
		const run = async () => {
			//如果为番剧出差的UID，则不从远程接口拉取数据，直接传回一段精简过的有效数据
			if (mid === "11783021") {
				console.log("检测到番剧出差UID，跳过远程用户接口访问");
				return bangumiTripData;
			}
			// 如果grisk_id存在，则将其添加到请求参数中
			const params: { mid: string; grisk_id?: string } = { mid };
			if (grisk_id) {
				params.grisk_id = grisk_id;
			}
			// 计算wbi签名
			const wbi = await this.getWbi(params);
			// 获取用户信息
			const { data } = await this.client.get(`${GET_USER_INFO}?${wbi}`);
			//返回数据
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getUserInfo() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getWbiKeys(): Promise<{ img_key: string; sub_key: string }> {
		const run = async () => {
			const { data } = await this.client.get(
				"https://api.bilibili.com/x/web-interface/nav",
			);
			const {
				data: {
					wbi_img: { img_url, sub_url },
				},
			} = data;

			return {
				img_key: img_url.slice(
					img_url.lastIndexOf("/") + 1,
					img_url.lastIndexOf("."),
				),
				sub_key: sub_url.slice(
					sub_url.lastIndexOf("/") + 1,
					sub_url.lastIndexOf("."),
				),
			};
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getWbiKeys() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getMyselfInfo() {
		const run = async () => {
			const { data } = await this.client.get(GET_MYSELF_INFO);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getMyselfInfo() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getLoginQRCode() {
		const run = async () => {
			const { data } = await this.client.get(GET_LOGIN_QRCODE);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getLoginQRCode() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getLoginStatus(qrcodeKey: string) {
		const run = async () => {
			const { data } = await this.client.get(
				`${GET_LOGIN_STATUS}?qrcode_key=${qrcodeKey}`,
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getLoginStatus() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getLiveRoomInfo(roomId: string) {
		const run = async () => {
			const { data } = await this.client.get(
				`${GET_LIVE_ROOM_INFO}?room_id=${roomId}`,
			);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getLiveRoomInfo() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	async getMasterInfo(mid: string) {
		const run = async () => {
			const { data } = await this.client.get(`${GET_MASTER_INFO}?uid=${mid}`);
			return data;
		};
		return await this.pRetry(run, {
			onFailedAttempt: (error) => {
				this.logger.error(
					`getMasterInfo() 第${error.attemptNumber}次失败: ${error.message}`,
				);
			},
			retries: 3,
		});
	}

	disposeNotifier() {
		if (this.loginNotifier) this.loginNotifier.dispose();
	}

	/**
	 * Generate HMAC-SHA256 signature
	 * @param {string} key     The key string to use for the HMAC-SHA256 hash
	 * @param {string} message The message string to hash
	 * @returns {string} The HMAC-SHA256 signature as a hex string
	 */
	hmacSha256(key: string, message: string): string {
		const hmac = crypto.createHmac("sha256", key);
		hmac.update(message);
		return hmac.digest("hex");
	}

	/**
	 * Get Bilibili web ticket
	 * @param {string} csrf    CSRF token, can be empty or null
	 * @returns {Promise<any>} Promise of the ticket response in JSON format
	 */
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	async getBiliTicket(csrf?: string): Promise<any> {
		const ts = Math.floor(DateTime.now().toSeconds() / 1000);
		const hexSign = this.hmacSha256("XgwSnGZ1p", `ts${ts}`);
		const params = new URLSearchParams({
			key_id: "ec02",
			hexsign: hexSign,
			"context[ts]": ts.toString(),
			csrf: csrf || "",
		});

		const url =
			"https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket";
		const resp = await this.client
			.post(
				`${url}?${params.toString()}`,
				{},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						"User-Agent":
							"Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
					},
				},
			)
			.catch((e) => {
				throw e;
			});

		return resp.data;
	}

	async createNewClient() {
		// import wrapper
		const wrapper = (await import("axios-cookiejar-support")).wrapper;
		// 包装cookieJar
		this.client = wrapper(
			axios.create({
				jar: this.jar,
				headers: {
					"Content-Type": "application/json",
					"User-Agent":
						this.apiConfig.userAgent ||
						"Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
					Origin: "https://www.bilibili.com",
					Referer: "https://www.bilibili.com/",
				},
			}),
		);
	}

	addCookie(cookieStr: string) {
		// 添加cookie到cookieJar
		this.jar.setCookieSync(
			`${cookieStr}; path=/; domain=.bilibili.com`,
			"https://www.bilibili.com",
		);
	}

	getCookies() {
		try {
			// 获取cookies
			const cookies = this.jar.serializeSync().cookies.map((cookie) => {
				return cookie;
			});
			// 返回cookies的JSON字符串
			return JSON.stringify(cookies);
		} catch (e) {
			console.error("获取cookies失败：", e);
			return undefined;
		}
	}

	async getCookiesForHeader() {
		try {
			// 获取cookies对象
			const cookies = this.jar.serializeSync().cookies;
			// 将每个 cookie 对象转换为 "key=value" 形式，并用 "; " 连接起来
			const cookieHeader = cookies
				.map((cookie) => `${cookie.key}=${cookie.value}`)
				.join("; ");
			return cookieHeader;
		} catch (e) {
			console.error("无效的 JSON 格式：", e);
			return "";
		}
	}

	getLoginInfoIsLoaded() {
		return this.loginInfoIsLoaded;
	}

	async getLoginInfoFromDB() {
		// 读取数据库获取cookies
		const data = (await this.ctx.database.get("loginBili", 1))[0];
		// 判断是否登录
		if (data === undefined) {
			// 没有数据则直接返回
			// 未登录，在控制台提示
			this.loginNotifier = this.ctx.notifier.create({
				type: "warning",
				content: "您尚未登录，将无法使用插件提供的指令",
			});
			// 返回空值
			return {
				cookies: null,
				refresh_token: null,
			};
		}
		// 尝试解密
		try {
			// 解密数据
			const decryptedCookies = this.decrypt(data.bili_cookies);
			// 解密refresh_token
			const decryptedRefreshToken = this.decrypt(data.bili_refresh_token);
			// 解析从数据库读到的cookies
			const cookies = JSON.parse(decryptedCookies) as Array<BACookie>;
			// 返回值
			return {
				cookies,
				refresh_token: decryptedRefreshToken,
			};
		} catch (_) {
			// 数据库被篡改，在控制台提示
			this.loginNotifier = this.ctx.notifier.create({
				type: "warning",
				content: "数据库被篡改，请重新登录",
			});
			// 解密或解析失败，删除数据库登录信息
			await this.ctx.database.remove("loginBili", [1]);
			// 返回空值
			return {
				cookies: null,
				refresh_token: null,
			};
		}
	}

	getCSRF() {
		// 获取csrf
		return this.jar
			.serializeSync()
			.cookies.find((cookie) => cookie.key === "bili_jct")?.value;
	}

	async loadCookiesFromDatabase() {
		// Get login info from db
		const { cookies, refresh_token } = await this.getLoginInfoFromDB();
		// 判断是否有值
		if (!cookies || !refresh_token) {
			// Login info is loaded
			this.loginInfoIsLoaded = true;
			return;
		}
		// 定义CSRF Token
		let csrf: string;
		let expires: Date | "Infinity";
		let domain: string;
		let path: string;
		let secure: boolean;
		let httpOnly: boolean;
		let sameSite: string;

		for (const cookieData of cookies) {
			// 获取key为bili_jct的值
			if (cookieData.key === "bili_jct") {
				csrf = cookieData.value;
				expires = cookieData.expires
					? DateTime.fromISO(cookieData.expires).toJSDate()
					: "Infinity";
				domain = cookieData.domain;
				path = cookieData.path;
				secure = cookieData.secure;
				httpOnly = cookieData.httpOnly;
				sameSite = cookieData.sameSite;
			}
			// 获取expires
			const cdExpires = (() => {
				// 判断expires
				if (!cookieData.expires) {
					return "Infinity";
				}
				if (cookieData.expires !== "Infinity") {
					return DateTime.fromISO(cookieData.expires).toJSDate();
				}
				return cookieData.expires;
			})();
			// 创建一个完整的 Cookie 实例
			const cookie = new Cookie({
				key: cookieData.key,
				value: cookieData.value,
				expires: cdExpires,
				domain: cookieData.domain,
				path: cookieData.path,
				secure: cookieData.secure,
				httpOnly: cookieData.httpOnly,
				sameSite: cookieData.sameSite,
			});
			this.jar.setCookieSync(
				cookie,
				`http${cookie.secure ? "s" : ""}://${cookie.domain}${cookie.path}`,
			);
		}
		// 对于某些 IP 地址，需要在 Cookie 中提供任意非空的 buvid3 字段
		const buvid3Cookie = new Cookie({
			key: "buvid3",
			value: "some_non_empty_value", // 设置任意非空值
			expires, // 设置过期时间
			domain, // 设置域名
			path, // 设置路径
			secure, // 设置是否为安全 cookie
			httpOnly, // 设置是否为 HttpOnly cookie
			sameSite, // 设置 SameSite 属性
		});
		this.jar.setCookieSync(
			buvid3Cookie,
			`http${buvid3Cookie.secure ? "s" : ""}://${buvid3Cookie.domain}${buvid3Cookie.path}`,
		);
		// Login info is loaded
		this.loginInfoIsLoaded = true;
		// restart plugin check
		this.checkIfTokenNeedRefresh(refresh_token, csrf);
		// enable refresh cookies detect
		this.enableRefreshCookiesDetect();
	}

	enableRefreshCookiesDetect() {
		// 判断之前是否启动检测
		if (this.refreshCookieTimer) this.refreshCookieTimer();
		// Open scheduled tasks and check if token need refresh
		this.refreshCookieTimer = this.ctx.setInterval(async () => {
			// 每12小时检测一次
			// 从数据库获取登录信息
			const { cookies, refresh_token } = await this.getLoginInfoFromDB();
			// 判断是否有值
			if (!cookies || !refresh_token) return;
			// 获取csrf
			const csrf = cookies.find((cookie) => {
				// 判断key是否为bili_jct
				if (cookie.key === "bili_jct") return true;
			}).value;
			// 检查是否需要更新
			this.checkIfTokenNeedRefresh(refresh_token, csrf);
		}, 3600000);
	}

	async checkIfTokenNeedRefresh(refreshToken: string, csrf: string, times = 3) {
		// 定义方法
		const notifyAndError = async (info: string) => {
			// 设置控制台通知
			this.loginNotifier = this.ctx.notifier.create({
				type: "warning",
				content: info,
			});
			// 重置为未登录状态
			await this.createNewClient();
			// 关闭定时器
			this.refreshCookieTimer();
			// 抛出错误
			throw new Error(info);
		};
		// 尝试获取Cookieinfo
		try {
			const { data } = await this.getCookieInfo(refreshToken);
			// 不需要刷新，直接返回
			if (!data?.refresh) return;
		} catch (_) {
			// 发送三次仍网络错误则直接刷新cookie
			if (times >= 1) {
				// 等待3秒再次尝试
				this.ctx.setTimeout(() => {
					this.checkIfTokenNeedRefresh(refreshToken, csrf, times - 1);
				}, 3000);
			}
			// 如果请求失败，有可能是404，直接刷新cookie
		}
		// 定义Key
		const publicKey = await crypto.subtle.importKey(
			"jwk",
			{
				kty: "RSA",
				n: "y4HdjgJHBlbaBN04VERG4qNBIFHP6a3GozCl75AihQloSWCXC5HDNgyinEnhaQ_4-gaMud_GF50elYXLlCToR9se9Z8z433U3KjM-3Yx7ptKkmQNAMggQwAVKgq3zYAoidNEWuxpkY_mAitTSRLnsJW-NCTa0bqBFF6Wm1MxgfE",
				e: "AQAB",
			},
			{ name: "RSA-OAEP", hash: "SHA-256" },
			true,
			["encrypt"],
		);
		// 定义获取CorrespondPath方法
		async function getCorrespondPath(timestamp) {
			const data = new TextEncoder().encode(`refresh_${timestamp}`);
			const encrypted = new Uint8Array(
				await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, data),
			);
			return encrypted.reduce(
				(str, c) => str + c.toString(16).padStart(2, "0"),
				"",
			);
		}
		// 获取CorrespondPath
		const ts = DateTime.now().toMillis();
		const correspondPath = await getCorrespondPath(ts);
		// 获取refresh_csrf
		const { data: refreshCsrfHtml } = await this.client.get(
			`https://www.bilibili.com/correspond/1/${correspondPath}`,
		);
		// 创建一个虚拟的DOM元素
		const { document } = new JSDOM(refreshCsrfHtml).window;
		// 提取标签name为1-name的内容
		const targetElement = document.getElementById("1-name");
		const refresh_csrf = targetElement ? targetElement.textContent : null;
		// 发送刷新请求
		const { data: refreshData } = await this.client.post(
			"https://passport.bilibili.com/x/passport-login/web/cookie/refresh",
			{
				csrf,
				refresh_csrf,
				source: "main_web",
				refresh_token: refreshToken,
			},
			{
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			},
		);
		// 检查是否有其他问题
		switch (refreshData.code) {
			// 账号未登录
			case -101:
				return await this.createNewClient();
			case -111: {
				await this.ctx.database.remove("loginBili", [1]);
				notifyAndError("csrf 校验错误，请重新登录");
				break;
			}
			case 86095: {
				await this.ctx.database.remove("loginBili", [1]);
				notifyAndError(
					"refresh_csrf 错误或 refresh_token 与 cookie 不匹配，请重新登录",
				);
			}
		}
		// 更新 新的cookies和refresh_token
		const encryptedCookies = this.encrypt(this.getCookies());
		const encryptedRefreshToken = this.encrypt(refreshData.data.refresh_token);
		await this.ctx.database.upsert("loginBili", [
			{
				id: 1,
				bili_cookies: encryptedCookies,
				bili_refresh_token: encryptedRefreshToken,
			},
		]);
		// Get new csrf from cookies
		const newCsrf: string = this.jar.serializeSync().cookies.find((cookie) => {
			if (cookie.key === "bili_jct") return true;
		}).value;
		// Accept update
		const { data: aceeptData } = await this.client.post(
			"https://passport.bilibili.com/x/passport-login/web/confirm/refresh",
			{
				csrf: newCsrf,
				refresh_token: refreshToken,
			},
			{
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			},
		);
		// 检查是否有其他问题
		switch (aceeptData.code) {
			case -111: {
				await this.ctx.database.remove("loginBili", [1]);
				notifyAndError("csrf 校验失败，请重新登录");
				break;
			}
			case -400:
				throw new Error("请求错误");
		}
		// 没有问题，cookies已更新完成
	}

	async v_voucherCaptcha(
		v_voucher: string,
	): Promise<{ data: V_VoucherCaptchaData["data"] }> {
		// 获取csrf
		const csrf = this.getCSRF();
		//申请captcha
		const { data } = (await this.client
			.post(
				"https://api.bilibili.com/x/gaia-vgate/v1/register",
				{
					csrf,
					v_voucher,
				},
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			)
			.catch((e) => {
				this.logger.error(e);
			})) as { data: V_VoucherCaptchaData };
		// 判断是否成功
		if (data.code !== 0) {
			this.logger.error("验证码获取失败！");
		}
		return { data: data.data };
	}

	async validateCaptcha(
		challenge: string,
		token: string,
		validate: string,
		seccode: string,
	): Promise<{ data: ValidateCaptchaData["data"] }> {
		const csrf = this.getCSRF();
		// 从验证结果获取 grisk_id
		const { data } = (await this.client.post(
			"https://api.bilibili.com/x/gaia-vgate/v1/validate",
			{
				csrf,
				challenge,
				token,
				validate,
				seccode,
			},
			{
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			},
		)) as { data: ValidateCaptchaData };
		// 判断是否验证成功
		if (data.code !== 0) {
			this.logger.info(
				`验证失败：错误码=${data.code}，错误消息:${data.message}`,
			);
			return { data: null };
		}
		// 添加cookie
		this.addCookie(`x-bili-gaia-vtoken=${data.data.grisk_id}`);
		// 返回验证结果
		return { data: data.data };
	}
}

namespace BiliAPI {
	export interface Config {
		userAgent: string;
		key: string;
	}

	export const Config: Schema<Config> = Schema.object({
		userAgent: Schema.string(),
		key: Schema.string()
			.pattern(/^[0-9a-f]{32}$/)
			.required(),
	});
}

export default BiliAPI;
