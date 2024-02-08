import { Context, Schema } from 'koishi'
import { } from '@koishijs/plugin-notifier'
// import plugins
// import Authority from './authority'
import ComRegister from './comRegister'
import * as Database from './database'
// import Service
import Wbi from './wbi'
import GenerateImg from './generateImg'
import BiliAPI from './biliAPI'

export const inject = ['puppeteer', 'database', 'notifier']

export const name = 'bilibili-notify'

export interface Config {
    require: {},
    key: string,
    basicSettings: {},
    unlockSubLimits: boolean,
    liveStartAtAll: boolean,
    pushTime: number,
    dynamicCheckNumber: number,
    dynamicLoopTime: '1分钟' | '2分钟' | '3分钟' | '5分钟',
    renderType: 'render' | 'page',
    filter: {},
    style: {},
    removeBorder: boolean,
    cardColorStart: string,
    cardColorEnd: string,
    enableLargeFont: boolean
    font: string
}

export const Config: Schema<Config> = Schema.object({
    require: Schema.object({}).description('必填设置'),

    key: Schema.string()
        .pattern(/^[0-9a-f]{32}$/)
        .role('secret')
        .required()
        .description('请输入一个32位小写字母的十六进制密钥（例如：9b8db7ae562b9864efefe06289cc5530），使用此密钥将你的B站登录信息存储在数据库中，请一定保存好此密钥。如果你忘记了此密钥，必须重新登录。你可以自行生成，或到这个网站生成：https://www.sexauth.com/'),

    basicSettings: Schema.object({}).description('基本设置'),

    unlockSubLimits: Schema.boolean()
        .default(false)
        .description('解锁3个订阅限制，默认只允许订阅3位UP主。订阅过多用户可能有导致IP暂时被封禁的风险'),

    liveStartAtAll: Schema.boolean()
        .default(false)
        .description('直播开始时艾特全体成员，默认关闭'),

    pushTime: Schema.number()
        .min(0)
        .max(12)
        .step(0.5)
        .default(1)
        .description('设定隔多长时间推送一次直播状态，单位为小时，默认为一小时'),

    dynamicCheckNumber: Schema.number()
        .min(2)
        .max(10)
        .role('slider')
        .step(1)
        .default(5)
        .description('设定每次检查动态的数量。若订阅的UP主经常在短时间内连着发多条动态可以将该值提高，若订阅的UP主有置顶动态，在计算该值时应+1。默认值为5条'),

    dynamicLoopTime: Schema.union(['1分钟', '2分钟', '3分钟', '5分钟'])
        .role('')
        .default('2分钟')
        .description('设定多久检测一次动态。若需动态的时效性，可以设置为1分钟。若订阅的UP主经常在短时间内连着发多条动态应该将该值提高，否则会出现动态漏推送和晚推送的问题，默认值为2分钟'),

    renderType: Schema.union(['render', 'page'])
        .role('')
        .default('render')
        .description('渲染类型，默认为render模式，渲染速度更快，但会出现乱码问题，若出现乱码问题，请切换到page模式。若使用自定义字体，建议选择render模式'),

    filter: Schema.intersect([
        Schema.object({
            enable: Schema.boolean()
                .default(false)
                .description('是否开启动态关键字屏蔽功能')
                .experimental()
        }).description('屏蔽设置'),
        Schema.union([
            Schema.object({
                enable: Schema.const(true).required().experimental(),
                regex: Schema.string()
                    .description('正则表达式屏蔽'),
                keywords: Schema.array(String)
                    .description('关键字屏蔽，一个关键字为一项')
            }),
            Schema.object({})
        ])
    ]),

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
        .description('推送卡片的字体样式，如果你想用你自己的字体可以在此填写，例如：Microsoft YaHei')
})

export function apply(ctx: Context, config: Config) {
    // 设置提示
    ctx.notifier.create({
        content: '请记得使用Auth插件创建超级管理员账号，没有权限将无法使用该插件提供的指令。'
    })
    if (config.unlockSubLimits) { // 用户允许订阅超过三个用户
        // 设置警告
        ctx.notifier.create({
            type: 'danger',
            content: '过多的订阅可能会导致IP暂时被封禁！'
        })
    }
    // load config
    // 转换为具体时间
    let dynamicLoopTime: number
    switch (config.dynamicLoopTime) {
        case '1分钟': dynamicLoopTime = 60; break;
        case '2分钟': dynamicLoopTime = 120; break;
        case '3分钟': dynamicLoopTime = 180; break;
        case '5分钟': dynamicLoopTime = 300; break;
    }
    // 渲染模式
    let renderType: number
    switch (config.renderType) {
        case 'render': renderType = 0; break;
        case 'page': renderType = 1; break;
    }
    // load database
    ctx.plugin(Database)
    // Regist server
    ctx.plugin(Wbi, { key: config.key })
    ctx.plugin(GenerateImg, {
        renderType,
        filter: config.filter,
        removeBorder: config.removeBorder,
        cardColorStart: config.cardColorStart,
        cardColorEnd: config.cardColorEnd,
        enableLargeFont: config.enableLargeFont,
        font: config.font
    })
    ctx.plugin(BiliAPI)
    // load plugin
    // ctx.plugin(Authority)
    ctx.plugin(ComRegister, {
        unlockSubLimits: config.unlockSubLimits,
        liveStartAtAll: config.liveStartAtAll,
        pushTime: config.pushTime,
        dynamicCheckNumber: config.dynamicCheckNumber,
        dynamicLoopTime
    })
    // 当用户输入“恶魔兔，启动！”时，执行 help 指令
    ctx.middleware((session, next) => {
        if (session.content === '恶魔兔，启动！') {
            return session.execute('help', next)
        } else {
            return next()
        }
    })
}
