/* eslint-disable @typescript-eslint/ban-types */
import { Context, ForkScope, Schema, Service } from 'koishi'
import { } from '@koishijs/plugin-notifier'
// import plugins
// import Authority from './authority'
import ComRegister from './comRegister'
import * as Database from './database'
// import Service
import GenerateImg from './generateImg'
import BiliAPI from './biliAPI'

export const inject = ['puppeteer', 'database', 'notifier']

export const name = 'bilibili-notify'

let globalConfig: Config

declare module 'koishi' {
    interface Context {
        sm: ServerManager
    }
}

export interface Config {
    require: {},
    key: string,
    master: {},
    basicSettings: {},
    unlockSubLimits: boolean,
    automaticResend: boolean,
    renderType: 'render' | 'page',
    userAgent: string,
    subTitle: {},
    sub: Array<{
        uid: string,
        dynamic: boolean,
        live: boolean,
        target: Array<{
            channelIdArr: Array<{
                channelId: string,
                dynamic: boolean,
                live: boolean,
                atAll: boolean
            }>,
            platform: string
        }>
    }>,
    dynamic: {},
    dynamicUrl: boolean,
    dynamicCheckNumber: number,
    dynamicLoopTime: '1分钟' | '2分钟' | '3分钟' | '5分钟' | '10分钟' | '20分钟'
    live: {},
    changeMasterInfoApi: boolean,
    liveStartAtAll: boolean,
    restartPush: boolean,
    pushTime: number,
    customLiveStart: string,
    customLive: string,
    customLiveEnd: string,
    hideDesc: boolean,
    style: {},
    removeBorder: boolean,
    cardColorStart: string,
    cardColorEnd: string,
    enableLargeFont: boolean,
    font: string,
    filter: {},
    debug: {},
    dynamicDebugMode: boolean,
}

export const Config: Schema<Config> = Schema.object({
    require: Schema.object({}).description('必填设置'),

    key: Schema.string()
        .pattern(/^[0-9a-f]{32}$/)
        .role('secret')
        .required()
        .description('请输入一个32位小写字母的十六进制密钥（例如：9b8db7ae562b9864efefe06289cc5530），使用此密钥将你的B站登录信息存储在数据库中，请一定保存好此密钥。如果你忘记了此密钥，必须重新登录。你可以自行生成，或到这个网站生成：https://www.sexauth.com/'),

    master: Schema.intersect([
        Schema.object({
            enable: Schema.boolean()
                .default(false)
                .description('是否开启主人账号功能，如果您的机器人没有私聊权限请不要开启此功能。开启后如果机器人运行错误会向您进行报告')
        }).description('主人账号'),
        Schema.union([
            Schema.object({
                enable: Schema.const(true).required(),
                platform: Schema.union(['qq', 'qqguild', 'onebot', 'discord', 'red', 'telegram', 'satori', 'chronocat', 'lark'])
                    .description('请选择您的私人机器人平台，目前支持QQ、QQ群、OneBot、Discord、RedBot、Telegram、Satori、ChronoCat、Lark。从2.0版本开始，只能在一个平台下使用本插件'),
                masterAccount: Schema.string()
                    .role('secret')
                    .required()
                    .description('主人账号，在Q群使用可直接使用QQ号，若在其他平台使用，请使用inspect插件获取自身ID'),
                masterAccountGuildId: Schema.string()
                    .role('secret')
                    .description('主人账号所在的群组ID，只有在QQ频道、Discord这样的环境才需要填写，请使用inspect插件获取群组ID'),
            }),
            Schema.object({})
        ])
    ]),

    basicSettings: Schema.object({}).description('基本设置'),

    unlockSubLimits: Schema.boolean()
        .default(false)
        .description('解锁3个直播订阅限制，默认只允许订阅3位UP主。订阅过多用户可能有导致IP暂时被封禁的风险'),

    automaticResend: Schema.boolean()
        .default(true)
        .description('是否开启自动重发功能，默认开启。开启后，如果推送失败，将会自动重发，尝试三次。关闭后，推送失败将不会再重发，直到下一次推送'),

    renderType: Schema.union(['render', 'page'])
        .role('')
        .default('render')
        .description('渲染类型，默认为render模式，渲染速度更快，但会出现乱码问题，若出现乱码问题，请切换到page模式。若使用自定义字体，建议选择render模式'),

    userAgent: Schema.string()
        .required()
        .description('设置请求头User-Agen，请求出现-352时可以尝试修改，UA获取方法可参考：https://blog.csdn.net/qq_44503987/article/details/104929111'),

    subTitle: Schema.object({}).description('手动订阅'),

    sub: Schema.array(Schema.object({
        uid: Schema.string().description('订阅用户UID'),
        dynamic: Schema.boolean().description('是否订阅用户动态'),
        live: Schema.boolean().description('是否订阅用户直播'),
        target: Schema.array(Schema.object({
            channelIdArr: Schema.array(Schema.object({
                channelId: Schema.string().description('频道/群组号'),
                dynamic: Schema.boolean().description('该频道/群组是否推送动态信息'),
                live: Schema.boolean().description('该频道/群组是否推送直播通知'),
                atAll: Schema.boolean().description('推送开播通知时是否艾特全体成员')
            })).description('频道/群组信息'),
            platform: Schema.string().description('推送平台')
        })).description('订阅用户需要发送的频道/群组信息')
    })).role('table').description('手动输入订阅信息，方便自定义订阅内容，这里的订阅内容不会存入数据库。uid: 订阅用户UID，dynamic: 是否需要订阅动态，live: 是否需要订阅直播'),

    dynamic: Schema.object({}).description('动态推送设置'),

    dynamicUrl: Schema.boolean()
        .default(false)
        .description('发送动态时是否同时发送链接。注意：如果使用的是QQ官方机器人不能开启此项！'),

    dynamicCheckNumber: Schema.number()
        .min(2)
        .max(10)
        .role('slider')
        .step(1)
        .default(5)
        .description('设定每次检查动态的数量。若订阅的UP主经常在短时间内连着发多条动态可以将该值提高，若订阅的UP主有置顶动态，在计算该值时应+1。默认值为5条'),

    dynamicLoopTime: Schema.union(['1分钟', '2分钟', '3分钟', '5分钟', '10分钟', '20分钟'])
        .role('')
        .default('2分钟')
        .description('设定多久检测一次动态。若需动态的时效性，可以设置为1分钟。若订阅的UP主经常在短时间内连着发多条动态应该将该值提高，否则会出现动态漏推送和晚推送的问题，默认值为2分钟'),

    live: Schema.object({}).description('直播推送设置'),

    changeMasterInfoApi: Schema.boolean()
        .default(false)
        .description('是否切换获取主播信息API，在遇到错误getMasterInfo()时可以尝试切换'),

    liveStartAtAll: Schema.boolean()
        .default(false)
        .description('直播开始时艾特全体成员，默认关闭'),

    restartPush: Schema.boolean()
        .default(true)
        .description('插件重启后，如果订阅的主播正在直播，是否进行一次推送，默认开启'),

    pushTime: Schema.number()
        .min(0)
        .max(12)
        .step(0.5)
        .default(1)
        .description('设定隔多长时间推送一次直播状态，单位为小时，默认为一小时'),

    customLiveStart: Schema.string()
        .default('-name开播啦 -link')
        .description('自定义开播提示语，-name代表UP昵称，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用）。例如-name开播啦，会发送为xxxUP开播啦'),

    customLive: Schema.string()
        .description('自定义直播中提示语，-name代表UP昵称，-time代表开播时长，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用）。例如-name正在直播，会发送为xxxUP正在直播xxx'),

    customLiveEnd: Schema.string()
        .default('-name下播啦，本次直播了-time')
        .description('自定义下播提示语，-name代表UP昵称，-time代表开播时长。例如-name下播啦，本次直播了-time，会发送为xxxUP下播啦，直播时长为xx小时xx分钟xx秒'),

    hideDesc: Schema.boolean()
        .default(false)
        .description('是否隐藏UP主直播间简介，开启后推送的直播卡片将不再展示简介'),

    style: Schema.object({}).description('美化设置'),

    removeBorder: Schema.boolean()
        .default(false)
        .description('移除推送卡片边框'),

    cardColorStart: Schema.string()
        .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
        .default('#F38AB5')
        .description('推送卡片的开始渐变背景色，请填入16进制颜色代码，参考网站：https://webkul.github.io/coolhue/'),

    cardColorEnd: Schema.string()
        .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
        .default('#F9CCDF')
        .description('推送卡片的结束渐变背景色，请填入16进制颜色代码，参考网站：https://colorate.azurewebsites.net/'),

    enableLargeFont: Schema.boolean()
        .default(false)
        .description('是否开启动态推送卡片大字体模式，默认为小字体。小字体更漂亮，但阅读比较吃力，大字体更易阅读，但相对没这么好看'),

    font: Schema.string()
        .description('推送卡片的字体样式，如果你想用你自己的字体可以在此填写，例如：Microsoft YaHei'),

    filter: Schema.intersect([
        Schema.object({
            enable: Schema.boolean()
                .default(false)
                .description('是否开启动态屏蔽功能')
        }).description('屏蔽设置'),
        Schema.union([
            Schema.object({
                enable: Schema.const(true).required().experimental(),
                notify: Schema.boolean()
                    .default(false)
                    .description('动态被屏蔽是否发送提示'),
                regex: Schema.string()
                    .description('正则表达式屏蔽'),
                keywords: Schema.array(String)
                    .description('关键字屏蔽，一个关键字为一项'),
                forward: Schema.boolean()
                    .default(false)
                    .description("是否屏蔽转发动态"),
            }),
            Schema.object({})
        ])
    ]),

    debug: Schema.object({}).description('调试设置'),

    dynamicDebugMode: Schema.boolean()
        .default(false)
        .description('动态调试模式，开启后会在控制台输出动态推送的详细信息，用于调试')
        .experimental()
})

class ServerManager extends Service {
    // 服务
    servers: ForkScope[] = []
    // 渲染模式
    renderType: number
    // 动态循环时间
    dynamicLoopTime: number

    constructor(ctx: Context) {
        super(ctx, 'sm')

        // 插件运行相关指令
        const sysCom = ctx.command('sys', 'bili-notify插件运行相关指令', { permissions: ['authority:5'] })

        sysCom
            .subcommand('.restart', '重启插件')
            .usage('重启插件')
            .example('sys restart')
            .action(async () => {
                this.logger.info('调用sys restart指令')
                if (await this.restartPlugin()) {
                    return '插件重启成功'
                }
                return '插件重启失败'
            })

        sysCom
            .subcommand('.stop', '停止插件')
            .usage('停止插件')
            .example('sys stop')
            .action(async () => {
                this.logger.info('调用sys stop指令')
                if (await this.disposePlugin()) {
                    return '插件已停止'
                }
                return '停止插件失败'
            })

        sysCom
            .subcommand('.start', '启动插件')
            .usage('启动插件')
            .example('sys start')
            .action(async () => {
                this.logger.info('调用sys start指令')
                if (await this.registerPlugin()) {
                    return '插件启动成功'
                }
                return '插件启动失败'
            })
    }

    protected start(): void | Promise<void> {
        // 加载配置
        // 根据用户设置的渲染模式设置
        switch (globalConfig.renderType) {
            case 'render': this.renderType = 0; break;
            case 'page': this.renderType = 1; break;
        }
        // 转换为具体时间
        switch (globalConfig.dynamicLoopTime) {
            case '1分钟': this.dynamicLoopTime = 60; break;
            case '2分钟': this.dynamicLoopTime = 120; break;
            case '3分钟': this.dynamicLoopTime = 180; break;
            case '5分钟': this.dynamicLoopTime = 300; break;
            case '10分钟': this.dynamicLoopTime = 600; break;
            case '20分钟': this.dynamicLoopTime = 1200; break;
        }
        // 注册插件
        if (this.registerPlugin()) {
            this.logger.info('插件启动成功')
        } else {
            this.logger.error('插件启动失败')
        }
    }

    registerPlugin = () => {
        // 如果已经有服务则返回false
        if (this.servers.length !== 0) return false
        // 注册插件
        try {
            // BA = BiliAPI
            const ba = this.ctx.plugin(BiliAPI, {
                userAgent: globalConfig.userAgent,
                key: globalConfig.key
            })

            // GI = GenerateImg
            const gi = this.ctx.plugin(GenerateImg, {
                renderType: this.renderType,
                filter: globalConfig.filter,
                removeBorder: globalConfig.removeBorder,
                cardColorStart: globalConfig.cardColorStart,
                cardColorEnd: globalConfig.cardColorEnd,
                hideDesc: globalConfig.hideDesc,
                enableLargeFont: globalConfig.enableLargeFont,
                font: globalConfig.font
            })

            // CR = ComRegister
            const cr = this.ctx.plugin(ComRegister, {
                sub: globalConfig.sub,
                master: globalConfig.master,
                unlockSubLimits: globalConfig.unlockSubLimits,
                automaticResend: globalConfig.automaticResend,
                changeMasterInfoApi: globalConfig.changeMasterInfoApi,
                liveStartAtAll: globalConfig.liveStartAtAll,
                restartPush: globalConfig.restartPush,
                pushTime: globalConfig.pushTime,
                customLiveStart: globalConfig.customLiveStart,
                customLive: globalConfig.customLive,
                customLiveEnd: globalConfig.customLiveEnd,
                dynamicCheckNumber: globalConfig.dynamicCheckNumber,
                dynamicLoopTime: this.dynamicLoopTime,
                dynamicUrl: globalConfig.dynamicUrl,
                filter: globalConfig.filter,
                dynamicDebugMode: globalConfig.dynamicDebugMode
            })

            // 添加服务
            this.servers.push(ba)
            this.servers.push(gi)
            this.servers.push(cr)
        } catch (e) {
            this.logger.error('插件注册失败', e)
            return false
        }
        // 成功返回true 
        return true
    }

    disposePlugin = async () => {
        // 如果没有服务则返回false
        if (this.servers.length === 0) return false
        // 遍历服务
        await new Promise(resolve => {
            this.servers.forEach(fork => {
                fork.dispose()
            })
            // 清空服务
            this.servers = []
            resolve('ok')
        })
        // 成功返回true
        return true
    }

    restartPlugin = async (): Promise<boolean> => {
        // 如果没有服务则返回false
        if (this.servers.length === 0) return false
        // 停用插件
        await this.disposePlugin()
        // 隔一秒启动插件
        return new Promise(resolve => {
            this.ctx.setTimeout(() => {
                try {
                    this.registerPlugin()
                } catch (e) {
                    this.logger.error('重启插件失败', e)
                    resolve(false)
                }
                resolve(true)
            }, 1000)
        })
    }
}

export function apply(ctx: Context, config: Config) {
    // 设置config
    globalConfig = config
    // 设置提示
    ctx.notifier.create({
        content: '从2.0.0-alpha.9以前版本更新需重新订阅'
    })
    ctx.notifier.create({
        content: '请使用Auth插件创建超级管理员账号，没有权限将无法使用该插件提供的指令。'
    })
    if (config.unlockSubLimits) { // 用户允许订阅超过三个用户
        // 设置警告
        ctx.notifier.create({
            type: 'danger',
            content: '过多的订阅可能会导致IP暂时被封禁！'
        })
    }
    // load database
    ctx.plugin(Database)
    // Register ServerManager
    ctx.plugin(ServerManager)
    // 当用户输入“恶魔兔，启动！”时，执行 help 指令
    ctx.middleware((session, next) => {
        if (session.content === '恶魔兔，启动！') {
            return session.send('启动不了一点')
        } else {
            return next()
        }
    })
}
