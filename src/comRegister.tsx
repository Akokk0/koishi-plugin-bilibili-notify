/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bot, Context, FlatPick, Logger, Schema, Session, h } from "koishi"
import { Notifier } from "@koishijs/plugin-notifier";
import { } from '@koishijs/plugin-help'
// 导入qrcode
import QRCode from 'qrcode'
import { LoginBili } from "./database";

enum LiveType {
    NotLiveBroadcast,
    StartBroadcasting,
    LiveBroadcast,
    StopBroadcast
}

type ChannelIdArr = Array<{
    channelId: string,
    atAll: boolean
}>

type TargetItem = {
    channelIdArr: ChannelIdArr,
    platform: string
}

type Target = Array<TargetItem>

type SubItem = {
    id: number,
    uid: string,
    roomId: string,
    target: Target,
    platform: string,
    live: boolean,
    dynamic: boolean,
    liveDispose: Function
}

type SubManager = Array<SubItem>

class ComRegister {
    static inject = ['ba', 'gi', 'database', 'sm'];
    qqRelatedBotList: Array<string> = ['qq', 'onebot', 'red', 'satori', 'chronocat']
    logger: Logger;
    config: ComRegister.Config
    loginTimer: Function
    num: number = 0
    rebootCount: number = 0
    subNotifier: Notifier
    subManager: SubManager = []
    // 检查登录数据库是否有数据
    loginDBData: FlatPick<LoginBili, "dynamic_group_id">
    // 机器人实例
    privateBot: Bot<Context>
    // 动态销毁函数
    dynamicDispose: Function
    // 发送消息方式
    sendMsgFunc: (bot: Bot<Context, any>, channelId: string, content: any) => Promise<void>
    // 构造函数
    constructor(ctx: Context, config: ComRegister.Config) {
        this.logger = ctx.logger('cr')
        this.config = config
        // 拿到私人机器人实例
        this.privateBot = ctx.bots.find(bot => bot.platform === config.master.platform)
        if (!this.privateBot) {
            ctx.notifier.create({
                content: '您未配置私人机器人，将无法向您推送机器人状态！'
            })
            this.logger.error('您未配置私人机器人，将无法向您推送机器人状态！')
        }
        // 检查登录数据库是否有数据
        ctx.database.get('loginBili', 1, ['dynamic_group_id']).then(data => this.loginDBData = data[0])
        // 从数据库获取订阅
        this.getSubFromDatabase(ctx)
        // 判断消息发送方式
        if (config.automaticResend) {
            this.sendMsgFunc = async (bot: Bot<Context, any>, channelId: string, content: any) => {
                // 多次尝试发送消息
                const attempts = 3
                for (let i = 0; i < attempts; i++) {
                    try {
                        // 发送消息
                        await bot.sendMessage(channelId, content)
                        // 防止消息发送速度过快被忽略
                        await ctx.sleep(500)
                        // 成功发送消息，跳出循环
                        break
                    } catch (e) {
                        if (i === attempts - 1) { // 已尝试三次
                            this.logger.error(`发送群组ID:${channelId}消息失败！原因: ` + e.message)
                            console.log(e);
                            this.sendPrivateMsg(`发送群组ID:${channelId}消息失败，请查看日志`)
                        }
                    }
                }
            }
        } else {
            this.sendMsgFunc = async (bot: Bot<Context, any>, guild: string, content: any) => {
                try {
                    // 发送消息
                    await bot.sendMessage(guild, content)
                } catch (e) {
                    this.logger.error(`发送群组ID:${guild}消息失败！原因: ` + e.message)
                    await this.sendPrivateMsg(`发送群组ID:${guild}消息失败，请查看日志`)
                }
            }
        }

        const statusCom = ctx.command('status', '插件状态相关指令', { permissions: ['authority:5'] })

        statusCom.subcommand('.dyn', '查看动态监测运行状态')
            .usage('查看动态监测运行状态')
            .example('status dyn')
            .action(() => {
                if (this.dynamicDispose) {
                    return '动态监测正在运行'
                } else {
                    return '动态监测未运行'
                }
            })

        statusCom.subcommand('.sm', '查看订阅管理对象')
            .usage('查看订阅管理对象')
            .example('status sm')
            .action(async () => {
                this.logger.info(this.subManager)
                return '查看控制台'
            })

        statusCom
            .subcommand('.bot', '查询当前拥有的机器人信息', { hidden: true })
            .usage('查询当前拥有的机器人信息')
            .example('status bot 查询当前拥有的机器人信息')
            .action(() => {
                this.logger.info('开始输出BOT信息')
                ctx.bots.forEach(bot => {
                    this.logger.info('--------------------------------')
                    this.logger.info('平台：' + bot.platform)
                    this.logger.info('名称：' + bot.user.name)
                    this.logger.info('--------------------------------')
                })
            })

        statusCom
            .subcommand('.env', '查询当前环境的信息', { hidden: true })
            .usage('查询当前环境的信息')
            .example('status env 查询当前环境的信息')
            .action(async ({ session }) => {
                await session.send(`Guild ID:${session.event.guild.id}`)
                await session.send(`Channel ID: ${session.event.channel.id}`)
            })

        const biliCom = ctx.command('bili', 'bili-notify插件相关指令', { permissions: ['authority:3'] })

        biliCom.subcommand('.login', '登录B站之后才可以进行之后的操作')
            .usage('使用二维码登录，登录B站之后才可以进行之后的操作')
            .example('bili login')
            .action(async ({ session }) => {
                this.logger.info('调用bili login指令')
                // 获取二维码
                let content: any
                try {
                    content = await ctx.ba.getLoginQRCode()
                } catch (e) {
                    return 'bili login getLoginQRCode() 本次网络请求失败'
                }
                // 判断是否出问题
                if (content.code !== 0) return await session.send('出问题咯，请联系管理员解决')
                // 生成二维码
                QRCode.toBuffer(content.data.url,
                    {
                        errorCorrectionLevel: 'H', // 错误更正水平
                        type: 'png',         // 输出类型
                        margin: 1,                 // 边距大小
                        color: {
                            dark: '#000000',         // 二维码颜色
                            light: '#FFFFFF'         // 背景颜色
                        }
                    }, async (err, buffer) => {
                        if (err) return await session.send('二维码生成出错，请重新尝试')
                        await session.send(h.image(buffer, 'image/png'))
                    })
                // 检查之前是否存在登录定时器
                if (this.loginTimer) this.loginTimer()
                // 设置flag
                let flag = true
                // 发起登录请求检查登录状态
                this.loginTimer = ctx.setInterval(async () => {
                    try {
                        // 判断上一个循环是否完成
                        if (!flag) return
                        flag = false
                        // 获取登录信息
                        let loginContent: any
                        try {
                            loginContent = await ctx.ba.getLoginStatus(content.data.qrcode_key)
                        } catch (e) {
                            this.logger.error(e)
                            return
                        }
                        if (loginContent.code !== 0) {
                            this.loginTimer()
                            return await session.send('登录失败请重试')
                        }
                        if (loginContent.data.code === 86038) {
                            this.loginTimer()
                            return await session.send('二维码已失效，请重新登录')
                        }
                        if (loginContent.data.code === 0) { // 登录成功
                            const encryptedCookies = ctx.ba.encrypt(ctx.ba.getCookies())
                            const encryptedRefreshToken = ctx.ba.encrypt(loginContent.data.refresh_token)
                            await ctx.database.upsert('loginBili', [{
                                id: 1,
                                bili_cookies: encryptedCookies,
                                bili_refresh_token: encryptedRefreshToken
                            }])
                            // 销毁定时器
                            this.loginTimer()
                            // 订阅之前的订阅
                            await this.getSubFromDatabase(ctx)
                            // 清除控制台通知
                            ctx.ba.disposeNotifier()
                            // 发送成功登录推送
                            await session.send('登录成功')
                            // bili show
                            await session.execute('bili show')
                            // 开启cookies刷新检测
                            ctx.ba.enableRefreshCookiesDetect()
                            return
                        }
                    } finally {
                        flag = true
                    }
                }, 1000)
            })

        biliCom
            .subcommand('.unsub <uid:string>', '取消订阅UP主动态、直播或全部')
            .usage('取消订阅，加-l为取消直播订阅，加-d为取消动态订阅，什么都不加则为全部取消')
            .option('live', '-l')
            .option('dynamic', '-d')
            .example('bili unsub 用户UID -ld')
            .action(async ({ session, options }, uid) => {
                this.logger.info('调用bili.unsub指令')
                // 若用户UID为空则直接返回
                if (!uid) return '用户UID不能为空'
                // -d -l两个选项不能同时存在
                if (options.dynamic && options.live) return '需要取消订阅该UP主请直接使用指令bili unsub 用户UID'
                // 定义是否存在
                let exist: boolean
                await Promise.all(this.subManager.map(async (sub, i) => {
                    if (sub.uid === uid) {
                        // 取消单个订阅
                        if (options.live || options.dynamic) {
                            if (options.live) await session.send(this.unsubSingle(ctx, sub.roomId, 0)) /* 0为取消订阅Live */
                            if (options.dynamic) await session.send(this.unsubSingle(ctx, sub.uid, 1)) /* 1为取消订阅Dynamic */
                            // 将存在flag设置为true
                            exist = true
                            // 结束循环
                            return
                        }
                        // 取消全部订阅 执行dispose方法，销毁定时器
                        if (sub.live) this.subManager[i].liveDispose()
                        // 从数据库中删除订阅
                        await ctx.database.remove('bilibili', { uid: this.subManager[i].uid })
                        // 将该订阅对象从订阅管理对象中移除
                        this.subManager.splice(i, 1)
                        // 将订阅对象移出订阅关注组
                        const removeUserFromGroupData = await ctx.ba.removeUserFromGroup(sub.uid)
                        // 判断是否移出成功 22105关注对象为自己
                        if (removeUserFromGroupData.code !== 0 && removeUserFromGroupData.code !== 22105) {
                            // 移出失败
                            await session.send('取消订阅对象失败，请稍后重试')
                            // 将存在flag设置为true
                            exist = true
                            // 结束循环
                            return
                        }
                        // id--
                        this.num--
                        // 判断是否还有动态订阅
                        if (this.dynamicDispose && !this.subManager.find((sub) => sub.dynamic === true)) { // 没有动态订阅
                            // 将动态检测关闭
                            this.dynamicDispose()
                            // 将动态监测置为空
                            this.dynamicDispose = null
                        }
                        // 发送成功通知
                        await session.send('已取消订阅该用户')
                        // 更新控制台提示
                        this.updateSubNotifier(ctx)
                        // 将存在flag设置为true
                        exist = true
                    }
                }))
                // 未订阅该用户，无需取消订阅
                if (!exist) await session.send('未订阅该用户，无需取消订阅')
            })

        biliCom
            .subcommand('.show', '展示订阅对象')
            .usage('展示订阅对象')
            .example('bili show')
            .action(() => {
                const subTable = this.subShow()
                return subTable
            })

        biliCom
            .subcommand('.sub <mid:string> [...groupId:string]', '订阅用户动态和直播通知')
            .option(
                'multiplatform',
                '-m <value:string>',
                { type: /^[A-Za-z0-9]+@?(?:,[A-Za-z0-9]+@?)*\.[A-Za-z0-9]+(?:;[A-Za-z0-9]+@?(?:,[A-Za-z0-9]+@?)*\.[A-Za-z0-9]+)*$/ }
            )
            .option('live', '-l')
            .option('dynamic', '-d')
            .option('atAll', '-a')
            .usage('订阅用户动态和直播通知，若需要订阅直播请加上-l，需要订阅动态则加上-d')
            .example('bili sub 1194210119 目标群号或频道号 -l -d 订阅UID为1194210119的UP主的动态和直播')
            .action(async ({ session, options }, mid, ...groupId) => {
                this.logger.info('调用bili.sub指令')
                // 先判断是否订阅直播，再判断是否解锁订阅限制，最后判断直播订阅是否已超三个
                if (options.live && !this.config.unlockSubLimits && (this.subManager.reduce((acc, cur) => acc + (cur.live ? 1 : 0), 0) >= 3)) {
                    return '直播订阅已达上限，请取消部分直播订阅后再进行订阅'
                }
                // 检查是否登录
                if (!(await this.checkIfIsLogin(ctx))) {
                    // 未登录直接返回
                    return '请使用指令bili login登录后再进行订阅操作'
                }
                // 检查必选参数是否已填
                if (!mid) return '请输入用户uid'
                // 订阅对象
                const subUserData = await this.subUserInBili(ctx, mid)
                // 判断是否订阅对象存在
                if (!subUserData.flag) return '订阅对象失败，请稍后重试！'
                // 定义目标变量
                let target: Target = []
                // 判断是否使用了多群组推送
                if (groupId.length > 0) {
                    // 定义channelIdArr
                    const channelIdArr: ChannelIdArr = []
                    // 遍历输入的群组
                    groupId.forEach(group => {
                        channelIdArr.push({
                            channelId: group,
                            atAll: options.atAll
                        })
                    })
                    target.push({
                        channelIdArr,
                        platform: session.event.platform
                    })
                } else {
                    // 判断是否使用多平台功能
                    if (options.multiplatform) {
                        // 分割字符串，赋值给target
                        target = this.splitMultiPlatformStr(options.multiplatform)
                    }
                    // 判断是否使用了多平台
                    if (target) {
                        target.forEach(async ({ channelIdArr, platform }, index) => {
                            if (channelIdArr.length > 0) { // 输入了推送群号或频道号
                                // 拿到对应的bot
                                const bot = this.getBot(ctx, platform)
                                // 判断是否配置了对应平台的机器人
                                if (!ctx.bots.some(bot => bot.platform === platform)) {
                                    await session.send('您未配置对应平台的机器人，不能在该平台进行订阅操作')
                                }
                                // 判断是否需要加入的群全部推送
                                if (channelIdArr[0].channelId !== 'all') {
                                    // 定义满足条件的群组数组
                                    const targetArr: ChannelIdArr = []
                                    // 获取机器人加入的群组
                                    const guildList = await bot.getGuildList()
                                    // 遍历target数组
                                    for (const channelId of channelIdArr) {
                                        // 定义是否加入群组标志
                                        let flag = false
                                        // 遍历群组
                                        for (const guild of guildList.data) {
                                            // 获取频道列表
                                            const channelList = await bot.getChannelList(guild.id)
                                            // 判断机器人是否加入群聊或频道
                                            if (channelList.data.some(channel => channel.id === channelId.channelId)) {
                                                // 加入群聊或频道
                                                targetArr.push(channelId)
                                                // 设置标志位为true
                                                flag = true
                                                // 结束循环
                                                break
                                            }
                                        }
                                        if (!flag) {
                                            // 不满足条件发送错误提示
                                            await session.send(`您的机器未加入${channelId.channelId}，无法对该群或频道进行推送`)
                                        }
                                    }
                                    // 判断targetArr是否为空
                                    if (target.length === 0) {
                                        // 为空则默认为当前环境
                                        target = [{ channelIdArr: [{ channelId: session.event.channel.id, atAll: options.atAll }], platform: session.event.platform }]
                                        // 没有满足条件的群组或频道
                                        await session.send('没有满足条件的群组或频道，默认订阅到当前聊天环境')
                                    }
                                    // 将符合条件的群组添加到target中
                                    target[index].channelIdArr = targetArr
                                }
                                // 如果为all则全部推送，不需要进行处理
                            } else {
                                // 未填写群号或频道号，默认为当前环境
                                target = [{ channelIdArr: [{ channelId: session.event.channel.id, atAll: options.atAll }], platform: session.event.platform }]
                                // 发送提示消息
                                await session.send('没有填写群号或频道号，默认订阅到当前聊天环境')
                            }
                        })
                    } else {
                        // 用户直接订阅，将当前环境赋值给target
                        target = [{ channelIdArr: [{ channelId: session.event.channel.id, atAll: options.atAll }], platform: session.event.platform }]
                    }
                }
                // 定义外围变量                
                let content: any
                try {
                    // 获取用户信息
                    content = await ctx.ba.getUserInfo(mid)
                } catch (e) {
                    // 返回错误信息
                    return 'bili sub getUserInfo() 发生了错误，错误为：' + e.message
                }
                // 判断是否成功获取用户信息
                if (content.code !== 0) {
                    // 定义错误消息
                    let msg: string
                    // 判断错误代码
                    switch (content.code) {
                        case -400: msg = '请求错误'; break;
                        case -403: msg = '访问权限不足，请尝试重新登录'; break;
                        case -404: msg = '用户不存在'; break;
                        case -352: msg = '风控校验失败，请尝试更换UA'; break;
                        default: msg = '未知错误，错误信息：' + content.message; break;
                    }
                    // 返回错误信息
                    return msg
                }
                // 获取data
                const { data } = content
                // 判断是否需要订阅直播和动态
                const [liveMsg, dynamicMsg] = await this.checkIfNeedSub(options.live, options.dynamic, session, data.live_room)
                // 判断是否未订阅任何消息
                if (!liveMsg && !dynamicMsg) return '您未订阅该UP的任何消息'
                // 获取到对应的订阅对象
                const subUser = this.subManager.find(sub => sub.uid === mid)
                // 判断要订阅的用户是否已经存在于订阅管理对象中
                if (subUser) {
                    // 已存在，判断是否重复订阅直播通知
                    if (liveMsg && subUser.live) {
                        return '已订阅该用户直播通知，请勿重复订阅'
                    }
                    // 已存在，判断是否重复订阅动态通知
                    if (dynamicMsg && subUser.dynamic) {
                        return '已订阅该用户动态通知，请勿重复订阅'
                    }
                }
                // 获取直播房间号
                const roomId = data.live_room?.roomid.toString()
                // 获取用户信息
                let userData: any
                try {
                    const { data } = await ctx.ba.getMasterInfo(mid)
                    userData = data
                } catch (e) {
                    this.logger.error('bili sub指令 getMasterInfo() 发生了错误，错误为：' + e.message)
                    return '订阅出错啦，请重试'
                }
                // 定义live销毁函数
                let liveDispose: Function
                // 订阅直播
                if (liveMsg) {
                    // 开始循环检测
                    liveDispose = ctx.setInterval(this.liveDetect(ctx, roomId, target), config.liveLoopTime * 1000)
                    // 发送订阅消息通知
                    await session.send(`订阅${userData.info.uname}直播通知`)
                }
                // 订阅动态
                if (dynamicMsg) {
                    // 判断是否开启动态监测
                    if (!this.dynamicDispose) {
                        // 开启动态监测
                        if (this.config.dynamicDebugMode) {
                            this.dynamicDispose = ctx.setInterval(this.debug_dynamicDetect(ctx), config.dynamicLoopTime * 1000)
                        } else {
                            this.dynamicDispose = ctx.setInterval(this.dynamicDetect(ctx), config.dynamicLoopTime * 1000)
                        }
                    }
                    // 发送订阅消息通知
                    await session.send(`订阅${userData.info.uname}动态通知`)
                }
                // 保存到数据库中
                const sub = await ctx.database.create('bilibili', {
                    uid: mid,
                    room_id: roomId,
                    dynamic: dynamicMsg ? 1 : 0,
                    live: liveMsg ? 1 : 0,
                    target: JSON.stringify(target),
                    platform: session.event.platform,
                    time: new Date()
                })
                // 订阅数+1
                this.num++
                // 保存新订阅对象
                this.subManager.push({
                    id: sub.id,
                    uid: mid,
                    roomId,
                    target,
                    platform: session.event.platform,
                    live: liveMsg,
                    dynamic: dynamicMsg,
                    liveDispose
                })
                // 新增订阅展示到控制台
                this.updateSubNotifier(ctx)
            })

        biliCom
            .subcommand('.status <roomId:string>', '查询主播当前直播状态', { hidden: true })
            .usage('查询主播当前直播状态')
            .example('bili status 732')
            .action(async ({ session }, roomId) => {
                this.logger.info('调用bili.status指令')
                if (!roomId) return session.send('请输入房间号!')
                let content: any
                try {
                    content = await ctx.ba.getLiveRoomInfo(roomId)
                } catch (e) {
                    return 'bili status指令 getLiveRoomInfo() 发生了错误，错误为：' + e.message
                }
                const { data } = content
                let userData: any
                try {
                    const { data: userInfo } = await ctx.ba.getMasterInfo(data.uid)
                    userData = userInfo
                } catch (e) {
                    return 'bili status指令 getMasterInfo() 发生了错误，错误为：' + e.message
                }
                // B站出问题了
                if (content.code !== 0) {
                    if (content.msg === '未找到该房间') {
                        session.send('未找到该房间')
                    } else {
                        session.send('未知错误，错误信息为：' + content.message)
                    }
                    return
                }

                const { pic, buffer } = await ctx.gi.generateLiveImg(
                    data,
                    userData.info.uname,
                    userData.info.face,
                    data.live_status !== 1 ?
                        LiveType.NotLiveBroadcast :
                        LiveType.LiveBroadcast
                )
                // pic 存在，使用的是render模式
                if (pic) return pic
                // pic不存在，说明使用的是page模式
                await session.send(h.image(buffer, 'image/png'))
            })

        biliCom
            .subcommand('.private', '向主人账号发送一条测试消息', { hidden: true })
            .usage('向主人账号发送一条测试消息')
            .example('bili private 向主人账号发送一条测试消息')
            .action(async ({ session }) => {
                // 发送消息
                await this.sendPrivateMsg('Hello World')
                // 发送提示
                await session.send('已发送消息，如未收到则说明您的机器人不支持发送私聊消息或您的信息填写有误')
            })
    }

    splitMultiPlatformStr(str: string): Target {
        return str.split(';').map(cv => cv.split('.')).map(([idStr, platform]) => {
            const channelIdArr = idStr.split(',').map(id => {
                const atAll = /@$/.test(id); // 使用正则表达式检查 id 是否以 @ 结尾
                const channelId = atAll ? id.slice(0, -1) : id; // 去除末尾的 @
                return { channelId, atAll }
            })
            return { channelIdArr, platform }
        })
    }

    getBot(ctx: Context, pf: string): Bot<Context, any> {
        return ctx.bots.find(bot => bot.platform === pf)
    }

    async sendPrivateMsg(content: string) {
        if (this.config.master.enable) {
            if (this.config.master.masterAccountGuildId) {
                // 向机器人主人发送消息
                await this.privateBot.sendPrivateMessage(
                    this.config.master.masterAccount,
                    content,
                    this.config.master.masterAccountGuildId
                )
            } else {
                // 向机器人主人发送消息
                await this.privateBot.sendPrivateMessage(
                    this.config.master.masterAccount,
                    content
                )
            }
        }
    }

    async sendPrivateMsgAndRebootService(ctx: Context) {
        // 判断重启次数是否超过三次
        if (this.rebootCount >= 3) {
            // logger
            this.logger.error('已重启插件三次，请检查机器人状态后使用指令 sys start 启动插件')
            // 重启失败，发送消息
            await this.sendPrivateMsg('已重启插件三次，请检查机器人状态后使用指令 sys start 启动插件')
            // 关闭插件
            await ctx.sm.disposePlugin()
            // 结束
            return
        }
        // 重启次数+1
        this.rebootCount++
        // logger
        this.logger.info('插件出现未知错误，正在重启插件')
        // 重启插件
        const flag = await ctx.sm.restartPlugin()
        // 判断是否重启成功
        if (flag) {
            this.logger.info('重启插件成功')
        } else {
            // logger
            this.logger.error('重启插件失败，请检查机器人状态后使用指令 sys start 启动插件')
            // 重启失败，发送消息
            await this.sendPrivateMsg('重启插件失败，请检查机器人状态后使用指令 sys start 启动插件')
            // 关闭插件
            await ctx.sm.disposePlugin()
        }
    }

    async sendPrivateMsgAndStopService(ctx: Context) {
        // 发送消息
        await this.sendPrivateMsg('插件发生未知错误，请检查机器人状态后使用指令 sys start 启动插件')
        // logger
        this.logger.error('插件发生未知错误，请检查机器人状态后使用指令 sys start 启动插件')
        // 关闭插件
        await ctx.sm.disposePlugin()
        // 结束
        return
    }

    async sendMsg(ctx: Context, targets: Target, content: any, live?: boolean) {
        for (const target of targets) {
            // 获取机器人实例
            const bot = this.getBot(ctx, target.platform)
            // 定义需要发送的数组
            let sendArr: ChannelIdArr = []
            // 判断是否需要推送所有机器人加入的群
            if (target.channelIdArr[0].channelId === 'all') {
                // 获取所有guild
                for (const guild of (await bot.getGuildList()).data) {
                    sendArr.push({ channelId: guild.id, atAll: target.channelIdArr[0].atAll })
                }
            } else {
                sendArr = target.channelIdArr
            }
            // 循环给每个群组发送
            if (live) {
                // 直播推送，需要判断是否为
                for (const channel of sendArr) {
                    await this.sendMsgFunc(bot, channel.channelId, <>{content}{channel.atAll && <at type="all" />}</>)
                }
            } else {
                for (const channel of sendArr) {
                    await this.sendMsgFunc(bot, channel.channelId, content)
                }
            }
        }
    }

    dynamicDetect(ctx: Context) {
        let detectSetup: boolean = true
        let updateBaseline: string
        // 相当于锁的作用，防止上一个循环没处理完
        let flag: boolean = true
        // 返回一个闭包函数
        return async () => {
            // 判断上一个循环是否完成
            if (!flag) return
            flag = false
            // 无论是否执行成功都要释放锁
            try {
                // 检测启动初始化
                if (detectSetup) {
                    // 获取动态信息
                    const data = await ctx.ba.getAllDynamic() as { code: number, data: { has_more: boolean, items: [], offset: string, update_baseline: string, update_num: number } }
                    // 判断获取动态信息是否成功
                    if (data.code !== 0) return
                    // 设置更新基线
                    updateBaseline = data.data.update_baseline
                    // 设置初始化为false
                    detectSetup = false
                    // 初始化完成
                    return
                }
                // 获取用户所有动态数据
                let updateNum: number
                let content: any
                try {
                    // 查询是否有新动态
                    const data = await ctx.ba.hasNewDynamic(updateBaseline)
                    updateNum = data.data.update_num
                    // 没有新动态或获取动态信息失败直接返回
                    if (updateNum <= 0 || data.code !== 0) return
                    // 获取动态内容
                    content = await ctx.ba.getAllDynamic(updateBaseline) as { code: number, data: { has_more: boolean, items: [], offset: string, update_baseline: string, update_num: number } }
                } catch (e) {
                    return this.logger.error('dynamicDetect getUserSpaceDynamic() 发生了错误，错误为：' + e.message)
                }
                // 判断获取动态内容是否成功
                if (content.code !== 0) {
                    switch (content.code) {
                        case -101: { // 账号未登录
                            // 输出日志
                            this.logger.error('账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件')
                            // 发送私聊消息
                            await this.sendPrivateMsg('账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件')
                            // 停止服务
                            await ctx.sm.disposePlugin()
                            // 结束循环
                            break
                        }
                        case -352: { // 风控
                            // 输出日志
                            this.logger.error('账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件')
                            // 发送私聊消息
                            await this.sendPrivateMsg('账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件')
                            // 停止服务
                            await ctx.sm.disposePlugin()
                            // 结束循环
                            break
                        }
                        case 4101128:
                        case 4101129: { // 获取动态信息错误
                            // 输出日志
                            this.logger.error('获取动态信息错误，错误码为：' + content.code + '，错误为：' + content.message);
                            // 发送私聊消息
                            await this.sendPrivateMsg('获取动态信息错误，错误码为：' + content.code + '，错误为：' + content.message); // 未知错误
                            // 结束循环
                            break;
                        }
                        default: { // 未知错误
                            // 发送私聊消息
                            await this.sendPrivateMsg('获取动态信息错误，错误码为：' + content.code + '，错误为：' + content.message) // 未知错误
                            // 结束循环
                            break
                        }
                    }
                }
                // 获取数据内容
                const data = content.data
                // 更新基线
                updateBaseline = data.update_baseline
                // 有新动态内容
                const items = data.items
                // 检查更新的动态
                for (let num = updateNum - 1; num >= 0; num--) {
                    // 没有动态内容则直接跳过
                    if (!items[num]) continue
                    // 从动态数据中取出UP主名称、UID和动态ID
                    const upUID = items[num].modules.module_author.mid
                    // 寻找关注的UP主的动态
                    this.subManager.forEach(async (sub) => {
                        // 判断是否是订阅的UP主
                        if (sub.uid == upUID) {
                            // 订阅该UP主，推送该动态
                            // 定义变量
                            let pic: string
                            let buffer: Buffer
                            // 从动态数据中取出UP主名称和动态ID
                            const upName = content.data.items[num].modules.module_author.name
                            const dynamicId = content.data.items[num].id_str
                            // 推送该条动态
                            const attempts = 3;
                            for (let i = 0; i < attempts; i++) {
                                // 获取动态推送图片
                                try {
                                    // 渲染图片
                                    const { pic: gimgPic, buffer: gimgBuffer } = await ctx.gi.generateDynamicImg(items[num])
                                    // 赋值
                                    pic = gimgPic
                                    buffer = gimgBuffer
                                    // 成功则跳出循环
                                    break
                                } catch (e) {
                                    // 直播开播动态，不做处理
                                    if (e.message === '直播开播动态，不做处理') return
                                    if (e.message === '出现关键词，屏蔽该动态') {
                                        // 如果需要发送才发送
                                        if (this.config.filter.notify) {
                                            await this.sendMsg(ctx, sub.target, `${upName}发布了一条含有屏蔽关键字的动态`)
                                        }
                                        return
                                    }
                                    if (e.message === '已屏蔽转发动态') {
                                        if (this.config.filter.notify) {
                                            await this.sendMsg(ctx, sub.target, `${upName}发布了一条转发动态，已屏蔽`)
                                        }
                                        return
                                    }
                                    // 未知错误
                                    if (i === attempts - 1) {
                                        this.logger.error('dynamicDetect generateDynamicImg() 推送卡片发送失败，原因：' + e.message)
                                        // 发送私聊消息并重启服务
                                        return await this.sendPrivateMsgAndStopService(ctx)
                                    }
                                }
                            }
                            // 判断是否需要发送URL
                            const dUrl = this.config.dynamicUrl ? `${upName}发布了一条动态：https://t.bilibili.com/${dynamicId}` : ''
                            // 如果pic存在，则直接返回pic
                            if (pic) {
                                this.logger.info('推送动态中，使用render模式');
                                // pic存在，使用的是render模式
                                await this.sendMsg(ctx, sub.target, pic + <>{dUrl}</>)
                            } else if (buffer) {
                                this.logger.info('推送动态中，使用page模式');
                                // pic不存在，说明使用的是page模式
                                await this.sendMsg(ctx, sub.target, <>{h.image(buffer, 'image/png')}{dUrl}</>)
                            } else {
                                this.logger.info(items[num].modules.module_author.name + '发布了一条动态，但是推送失败');
                            }
                        }
                    })
                }
            }
            finally {
                flag = true
            }
        }
    }

    debug_dynamicDetect(ctx: Context) {
        let detectSetup: boolean = true
        let updateBaseline: string
        // 相当于锁的作用，防止上一个循环没处理完
        let flag: boolean = true
        // 返回一个闭包函数
        return async () => {
            // 判断上一个循环是否完成
            if (!flag) return
            flag = false
            // 无论是否执行成功都要释放锁
            try {
                console.log(`初始化状态：${detectSetup}`);
                // 检测启动初始化
                if (detectSetup) {
                    // 获取动态信息
                    const data = await ctx.ba.getAllDynamic() as { code: number, data: { has_more: boolean, items: [], offset: string, update_baseline: string, update_num: number } }
                    // 判断获取动态信息是否成功
                    if (data.code !== 0) return
                    console.log(`更新基线：${data.data.update_baseline}`);
                    // 设置更新基线
                    updateBaseline = data.data.update_baseline
                    // 设置初始化为false
                    detectSetup = false
                    // 初始化完成
                    return
                }
                // 获取用户所有动态数据
                let updateNum: number
                let content: any
                try {
                    // 查询是否有新动态
                    const data = await ctx.ba.hasNewDynamic(updateBaseline)
                    updateNum = data.data.update_num
                    console.log(`获取是否有新动态：`);
                    console.log(data);
                    // 没有新动态或获取动态信息失败直接返回
                    if (updateNum <= 0 || data.code !== 0) return
                    // 获取动态内容
                    content = await ctx.ba.getAllDynamic(updateBaseline) as { code: number, data: { has_more: boolean, items: [], offset: string, update_baseline: string, update_num: number } }
                    console.log('获取动态内容：');
                    console.log(content.data.items[0]);
                } catch (e) {
                    return this.logger.error('dynamicDetect getUserSpaceDynamic() 发生了错误，错误为：' + e.message)
                }
                // 判断获取动态内容是否成功
                if (content.code !== 0) {
                    switch (content.code) {
                        case -101: { // 账号未登录
                            // 输出日志
                            this.logger.error('账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件')
                            // 发送私聊消息
                            await this.sendPrivateMsg('账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件')
                            // 停止服务
                            await ctx.sm.disposePlugin()
                            // 结束循环
                            break
                        }
                        case -352: { // 风控
                            // 输出日志
                            this.logger.error('账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件')
                            // 发送私聊消息
                            await this.sendPrivateMsg('账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件')
                            // 停止服务
                            await ctx.sm.disposePlugin()
                            // 结束循环
                            break
                        }
                        case 4101128:
                        case 4101129: { // 获取动态信息错误
                            // 输出日志
                            this.logger.error('获取动态信息错误，错误码为：' + content.code + '，错误为：' + content.message);
                            // 发送私聊消息
                            await this.sendPrivateMsg('获取动态信息错误，错误码为：' + content.code + '，错误为：' + content.message); // 未知错误
                            // 结束循环
                            break;
                        }
                        default: { // 未知错误
                            // 发送私聊消息
                            await this.sendPrivateMsg('获取动态信息错误，错误码为：' + content.code + '，错误为：' + content.message) // 未知错误
                            // 结束循环
                            break
                        }
                    }
                }
                // 获取数据内容
                const data = content.data
                // 更新基线
                updateBaseline = data.update_baseline
                console.log(`更新基线：${updateBaseline}`);
                // 有新动态内容
                const items = data.items
                // 检查更新的动态
                for (let num = updateNum - 1; num >= 0; num--) {
                    // 有更新动态
                    console.log('有更新动态');
                    // 没有动态内容则直接跳过
                    if (!items[num]) continue
                    // 从动态数据中取出UP主名称、UID和动态ID
                    const upName = content.data.items[num].modules.module_author.name
                    const upUID = items[num].modules.module_author.mid
                    const dynamicId = content.data.items[num].id_str
                    console.log(`寻找关注的UP主，当前动态UP主：${upName}，UID：${upUID}，动态ID：${dynamicId}`);
                    // 寻找关注的UP主的动态
                    this.subManager.forEach(async (sub) => {
                        console.log(`当前订阅UP主：${sub.uid}`);
                        // 判断是否是订阅的UP主
                        if (sub.uid == upUID) {
                            // 订阅该UP主，推送该动态
                            // 定义变量
                            let pic: string
                            let buffer: Buffer
                            // 从动态数据中取出UP主名称和动态ID
                            const upName = content.data.items[num].modules.module_author.name
                            const dynamicId = content.data.items[num].id_str
                            console.log(`UP主名称：${upName}，动态ID：${dynamicId}`);
                            // 推送该条动态
                            const attempts = 3;
                            for (let i = 0; i < attempts; i++) {
                                // 获取动态推送图片
                                try {
                                    // 渲染图片
                                    const { pic: gimgPic, buffer: gimgBuffer } = await ctx.gi.generateDynamicImg(items[num])
                                    // 赋值
                                    pic = gimgPic
                                    buffer = gimgBuffer
                                    // 成功则跳出循环
                                    break
                                } catch (e) {
                                    // 直播开播动态，不做处理
                                    if (e.message === '直播开播动态，不做处理') return
                                    if (e.message === '出现关键词，屏蔽该动态') {
                                        // 如果需要发送才发送
                                        if (this.config.filter.notify) {
                                            await this.sendMsg(ctx, sub.target, `${upName}发布了一条含有屏蔽关键字的动态`)
                                        }
                                        return
                                    }
                                    if (e.message === '已屏蔽转发动态') {
                                        if (this.config.filter.notify) {
                                            await this.sendMsg(ctx, sub.target, `${upName}发布了一条转发动态，已屏蔽`)
                                        }
                                        return
                                    }
                                    // 未知错误
                                    if (i === attempts - 1) {
                                        this.logger.error('dynamicDetect generateDynamicImg() 推送卡片发送失败，原因：' + e.message)
                                        // 发送私聊消息并重启服务
                                        return await this.sendPrivateMsgAndStopService(ctx)
                                    }
                                }
                            }
                            // 判断是否需要发送URL
                            const dUrl = this.config.dynamicUrl ? `${upName}发布了一条动态：https://t.bilibili.com/${dynamicId}` : ''
                            // 如果pic存在，则直接返回pic
                            if (pic) {
                                this.logger.info('推送动态中，使用render模式');
                                // pic存在，使用的是render模式
                                await this.sendMsg(ctx, sub.target, pic + <>{dUrl}</>)
                            } else if (buffer) {
                                this.logger.info('推送动态中，使用page模式');
                                // pic不存在，说明使用的是page模式
                                await this.sendMsg(ctx, sub.target, <>{h.image(buffer, 'image/png')}{dUrl}</>)
                            } else {
                                this.logger.info(items[num].modules.module_author.name + '发布了一条动态，但是推送失败');
                            }
                        }
                    })
                }
            }
            finally {
                flag = true
            }
        }
    }

    liveDetect(
        ctx: Context,
        roomId: string,
        target: Target
    ) {
        let firstSubscription: boolean = true;
        let timer: number = 0;
        let open: boolean = false;
        let liveTime: string;
        let username: string
        let userface: string
        // 相当于锁的作用，防止上一个循环没处理完
        let flag: boolean = true

        // 定义发送直播通知卡片方法
        const sendLiveNotifyCard = async (data: any, liveType: LiveType, liveNotifyMsg?: string) => {
            // 定义变量
            let pic: string
            let buffer: Buffer
            // 多次尝试生成图片
            const attempts = 3
            for (let i = 0; i < attempts; i++) {
                try {
                    // 获取直播通知卡片
                    const { pic: picv, buffer: bufferv } = await ctx.gi.generateLiveImg(data, username, userface, liveType)
                    // 赋值
                    pic = picv
                    buffer = bufferv
                    // 成功则跳出循环
                    break
                } catch (e) {
                    if (i === attempts - 1) { // 已尝试三次
                        this.logger.error('liveDetect generateLiveImg() 推送卡片生成失败，原因：' + e.message)
                        // 发送私聊消息并重启服务
                        return await this.sendPrivateMsgAndStopService(ctx)
                    }
                }
            }
            // 推送直播信息
            // pic 存在，使用的是render模式
            if (pic) {
                const msg = liveNotifyMsg ? liveNotifyMsg : ''
                // 只有在开播时才艾特全体成员
                if (liveType === LiveType.StartBroadcasting) {
                    return await this.sendMsg(ctx, target, pic + msg, true)
                }
                // 正常不需要艾特全体成员
                return await this.sendMsg(ctx, target, pic + msg)
            }
            // pic不存在，说明使用的是page模式
            const msg = <>{h.image(buffer, 'image/png')}{liveNotifyMsg && liveNotifyMsg}</>
            // 只有在开播时才艾特全体成员
            if (liveType === LiveType.StartBroadcasting) {
                return await this.sendMsg(ctx, target, msg, true)
            }
            // 正常不需要艾特全体成员
            return await this.sendMsg(ctx, target, msg)
        }

        // 定义获取主播信息方法
        let useMasterInfo: (uid: string) => Promise<void>
        if (this.config.changeMasterInfoApi) {
            useMasterInfo = async (uid: string) => {
                const { data } = await ctx.ba.getUserInfo(uid)
                username = data.name
                userface = data.face
            }
        } else {
            useMasterInfo = async (uid: string) => {
                const { data: { info } } = await ctx.ba.getMasterInfo(uid)
                username = info.uname
                userface = info.face
            }
        }

        return async () => {
            // 如果flag为false则说明前面的代码还未执行完，则直接返回
            if (!flag) return
            flag = false
            // 无论是否执行成功都要释放锁
            try {
                // 发送请求检测直播状态
                let content: any
                const attempts = 3
                for (let i = 0; i < attempts; i++) {
                    try {
                        // 发送请求获取room信息
                        content = await ctx.ba.getLiveRoomInfo(roomId)
                        // 成功则跳出循环
                        break
                    } catch (e) {
                        this.logger.error('liveDetect getLiveRoomInfo 发生了错误，错误为：' + e.message)
                        if (i === attempts - 1) { // 已尝试三次
                            // 发送私聊消息并重启服务
                            return await this.sendPrivateMsgAndStopService(ctx)
                        }
                    }
                }
                const { data } = content
                // 判断是否是第一次订阅
                if (firstSubscription) {
                    firstSubscription = false
                    // 获取主播信息
                    const attempts = 3
                    for (let i = 0; i < attempts; i++) {
                        try {
                            // 发送请求获取主播信息
                            await useMasterInfo(data.uid)
                            // 成功则跳出循环
                            break
                        } catch (e) {
                            this.logger.error('liveDetect getMasterInfo() 发生了错误，错误为：' + e.message)
                            if (i === attempts - 1) { // 已尝试三次
                                // 发送私聊消息并重启服务
                                return await this.sendPrivateMsgAndStopService(ctx)
                            }
                        }
                    }
                    // 判断直播状态
                    if (data.live_status === 1) { // 当前正在直播
                        // 设置开播时间
                        liveTime = data.live_time
                        // 发送直播通知卡片
                        if (this.config.restartPush) sendLiveNotifyCard(data, LiveType.LiveBroadcast)
                        // 改变开播状态
                        open = true
                    } // 未开播，直接返回
                    return
                }
                // 检查直播状态
                switch (data.live_status) {
                    case 0:
                    case 2: { // 状态 0 和 2 说明未开播
                        if (open) { // 之前开播，现在下播了
                            // 更改直播状态
                            open = false
                            // 下播了将定时器清零
                            timer = 0
                            // 定义下播通知消息
                            const liveEndMsg = this.config.customLiveEnd
                                .replace('-name', username)
                                .replace('-time', await ctx.gi.getTimeDifference(liveTime))
                            // 更改直播时长
                            data.live_time = liveTime
                            // 发送@全体成员通知
                            await sendLiveNotifyCard(data, LiveType.StopBroadcast, liveEndMsg)
                        }
                        // 未进循环，还未开播，继续循环
                        break
                    }
                    case 1: {
                        if (!open) { // 之前未开播，现在开播了
                            // 更改直播状态
                            open = true
                            // 设置开播时间
                            liveTime = data.live_time
                            // 获取主播信息
                            const attempts = 3
                            for (let i = 0; i < attempts; i++) {
                                try {
                                    // 主播信息不会变，开播时刷新一次即可
                                    // 发送请求获取主播信息
                                    await useMasterInfo(data.uid)
                                    // 成功则跳出循环
                                    break
                                } catch (e) {
                                    this.logger.error('liveDetect open getMasterInfo() 发生了错误，错误为：' + e.message)
                                    if (i === attempts - 1) { // 已尝试三次
                                        // 发送私聊消息并重启服务
                                        return await this.sendPrivateMsgAndStopService(ctx)
                                    }
                                }
                            }
                            // 定义开播通知语
                            const liveStartMsg = this.config.customLiveStart
                                .replace('-name', username)
                                .replace('-time', await ctx.gi.getTimeDifference(liveTime))
                                .replace('-link', `https://live.bilibili.com/${data.short_id === 0 ? data.room_id : data.short_id}`)
                            // 发送消息
                            await sendLiveNotifyCard(data, LiveType.StartBroadcasting, liveStartMsg)
                        } else { // 还在直播
                            if (this.config.pushTime > 0) {
                                timer++
                                // 开始记录时间
                                if (timer >= (6 * 60 * this.config.pushTime)) { // 到时间推送直播消息
                                    // 到时间重新计时
                                    timer = 0
                                    // 定义直播中通知消息
                                    const liveMsg = this.config.customLive ? this.config.customLive
                                        .replace('-name', username)
                                        .replace('-time', await ctx.gi.getTimeDifference(liveTime))
                                        .replace('-link', `https://live.bilibili.com/${data.short_id === 0 ? data.room_id : data.short_id}`) : ''
                                    // 发送直播通知卡片
                                    sendLiveNotifyCard(data, LiveType.LiveBroadcast, liveMsg)
                                }
                            }
                            // 否则继续循环
                        }
                    }
                }
            }
            finally {
                // 执行完方法体不论如何都把flag设置为true
                flag = true
            }
        }
    }

    subShow() {
        // 在控制台中显示订阅对象
        let table: string = ``
        this.subManager.forEach(sub => {
            table += `UID:${sub.uid}  ${sub.dynamic ? '已订阅动态' : ''}  ${sub.live ? '已订阅直播' : ''}` + '\n'
        })
        return table ? table : '没有订阅任何UP'
    }

    async checkIfNeedSub(liveSub: boolean, dynamicSub: boolean, session: Session, liveRoomData: any): Promise<Array<boolean>> {
        // 定义方法：用户直播间是否存在
        const liveRoom = async () => {
            if (!liveRoomData) {
                // 未开通直播间
                await session.send('该用户未开通直播间，无法订阅直播')
                // 返回false
                return true
            }
            return false
        }
        // 如果两者都为true或者都为false则直接返回
        if ((liveSub && dynamicSub) || (!liveSub && !dynamicSub)) {
            // 判断是否存在直播间
            if (await liveRoom()) return [false, true]
            // 返回
            return [true, true]
        }
        // 如果只订阅直播
        if (liveSub) {
            // 判断是否存在直播间
            if (await liveRoom()) return [false, false]
            // 返回
            return [true, false]
        }
        // 只订阅动态
        return [false, true]
    }

    updateSubNotifier(ctx: Context) {
        // 更新控制台提示
        if (this.subNotifier) this.subNotifier.dispose()
        // 获取订阅信息
        const subInfo = this.subShow()
        // 定义table
        let table = ''
        if (subInfo === '没有订阅任何UP') {
            table = subInfo
        } else {
            // 获取subTable
            const subTableArray = subInfo.split('\n')
            subTableArray.splice(subTableArray.length - 1, 1)
            // 定义Table
            table = <>
                <p>当前订阅对象：</p>
                <ul>
                    {
                        subTableArray.map(str => (
                            <li>{str}</li>
                        ))
                    }
                </ul>
            </>
        }
        // 设置更新后的提示
        this.subNotifier = ctx.notifier.create(table)
    }

    async checkIfLoginInfoIsLoaded(ctx: Context) {
        return new Promise(resolve => {
            const check = () => {
                if (!ctx.ba.getLoginInfoIsLoaded()) {
                    ctx.setTimeout(check, 500)
                } else {
                    resolve('success')
                }
            }
            check()
        })
    }

    async subUserInBili(ctx: Context, mid: string): Promise<{ flag: boolean, msg: string }> {
        // 获取关注分组信息
        const checkGroupIsReady = async (): Promise<boolean> => {
            // 判断是否有数据
            if (this.loginDBData.dynamic_group_id === '' || this.loginDBData.dynamic_group_id === null) {
                // 没有数据，没有创建分组，尝试创建分组
                const createGroupData = await ctx.ba.createGroup("订阅")
                // 如果分组已创建，则获取分组id
                if (createGroupData.code === 22106) {
                    // 分组已存在，拿到之前的分组id
                    const allGroupData = await ctx.ba.getAllGroup()
                    // 遍历所有分组
                    for (const group of allGroupData.data) {
                        // 找到订阅分组
                        if (group.name === '订阅') {
                            // 拿到分组id
                            this.loginDBData.dynamic_group_id = group.tagid
                            // 结束循环
                            break
                        }
                    }
                } else if (createGroupData.code !== 0) {
                    console.log(createGroupData);
                    // 创建分组失败
                    return false
                }
                // 创建成功，保存到数据库
                ctx.database.set('loginBili', 1, { dynamic_group_id: this.loginDBData.dynamic_group_id })
                // 创建成功
                return true
            }
            return true
        }
        // 判断分组是否准备好
        const flag = await checkGroupIsReady()
        // 判断是否创建成功
        if (!flag) {
            // 创建分组失败
            return { flag: false, msg: '创建分组失败，请尝试重启插件' }
        }
        // 获取分组明细
        const relationGroupDetailData = await ctx.ba.getRelationGroupDetail(this.loginDBData.dynamic_group_id)
        // 判断分组信息是否获取成功
        if (relationGroupDetailData.code !== 0) {
            if (relationGroupDetailData.code === 22104) {
                // 将原先的分组id置空
                this.loginDBData.dynamic_group_id = null
                // 分组不存在
                const flag = await checkGroupIsReady()
                // 判断是否创建成功
                if (!flag) {
                    // 创建分组失败
                    return { flag: false, msg: '创建分组失败，请尝试重启插件' }
                }
                return { flag: true, msg: '分组不存在，已重新创建分组' }
            }
            // 获取分组明细失败
            return { flag: false, msg: '获取分组明细失败' }
        }
        relationGroupDetailData.data.forEach(user => {
            if (user.mid === mid) {
                // 已关注订阅对象
                return { flag: true, msg: '订阅对象已存在于分组中' }
            }
        })
        // 订阅对象
        const subUserData = await ctx.ba.follow(mid)
        // 判断是否订阅成功
        switch (subUserData.code) {
            case -101: return { flag: false, msg: '账号未登录，请使用指令bili login登录后再进行订阅操作' }
            case -102: return { flag: false, msg: '账号被封停，无法进行订阅操作' }
            case 22002: return { flag: false, msg: '因对方隐私设置，无法进行订阅操作' }
            case 22003: return { flag: false, msg: '你已将对方拉黑，无法进行订阅操作' }
            case 22013: return { flag: false, msg: '账号已注销，无法进行订阅操作' }
            case 40061: return { flag: false, msg: '账号不存在，请检查uid输入是否正确或用户是否存在' }
            case 22001: break // 订阅对象为自己 无需添加到分组
            case 22014: // 已关注订阅对象 无需再次关注
            case 0: { // 执行订阅成功
                // 把订阅对象添加到分组中
                const copyUserToGroupData = await ctx.ba.copyUserToGroup(mid, this.loginDBData.dynamic_group_id)
                // 判断是否添加成功
                if (copyUserToGroupData.code !== 0) {
                    // 添加失败
                    return { flag: false, msg: '添加订阅对象到分组失败，请稍后重试' }
                }
            }
        }
        // 订阅成功
        return { flag: true, msg: '用户订阅成功' }
    }

    async getSubFromDatabase(ctx: Context) {
        // 判断登录信息是否已加载完毕
        await this.checkIfLoginInfoIsLoaded(ctx)
        // 如果未登录，则直接返回
        if (!(await this.checkIfIsLogin(ctx))) {
            // log
            this.logger.info(`账号未登录，请登录`)
            return
        }
        // 已存在订阅管理对象，不再进行订阅操作
        if (this.subManager.length !== 0) return
        // 从数据库中获取数据
        const subData = await ctx.database.get('bilibili', { id: { $gt: 0 } })
        // 定义变量：订阅直播数
        let liveSubNum: number = 0
        // 循环遍历
        for (const sub of subData) {
            // 判断是否存在没有任何订阅的数据
            if (!sub.dynamic && !sub.live) { // 存在未订阅任何项目的数据
                // 删除该条数据
                ctx.database.remove('bilibili', { id: sub.id })
                // log
                this.logger.warn(`UID:${sub.uid} 该条数据没有任何订阅数据，自动取消订阅`)
                // 跳过下面的步骤
                continue
            }
            // 判断用户是否在B站中订阅了
            const subUserData = await this.subUserInBili(ctx, sub.uid)
            // 判断是否订阅
            if (!subUserData.flag) {
                // log
                this.logger.warn(`UID:${sub.uid} ${subUserData.msg}，自动取消订阅`)
                // 发送私聊消息
                await this.sendPrivateMsg(`UID:${sub.uid} ${subUserData.msg}，自动取消订阅`)
                // 删除该条数据
                await ctx.database.remove('bilibili', { id: sub.id })
                // 跳过下面的步骤
                continue
            }
            // 获取推送目标数组
            const target = JSON.parse(sub.target)
            /* 判断数据库是否被篡改 */
            // 获取用户信息
            let content: any
            const attempts = 3
            for (let i = 0; i < attempts; i++) {
                try {
                    // 获取用户信息
                    content = await ctx.ba.getUserInfo(sub.uid)
                    // 成功则跳出循环
                    break
                } catch (e) {
                    this.logger.error('getSubFromDatabase() getUserInfo() 发生了错误，错误为：' + e.message)
                    if (i === attempts - 1) { // 已尝试三次
                        // 发送私聊消息并重启服务
                        return await this.sendPrivateMsgAndStopService(ctx)
                    }
                }
            }
            // 获取data
            const { data } = content
            // 定义函数删除数据和发送提示
            const deleteSub = async () => {
                // 从数据库删除该条数据
                await ctx.database.remove('bilibili', { id: sub.id })
                // 给用户发送提示
                await this.sendPrivateMsg(`UID:${sub.uid} 数据库内容被篡改，已取消对该UP主的订阅`)
            }
            // 判断是否有其他问题
            if (content.code !== 0) {
                switch (content.code) {
                    case -352:
                    case -403: {
                        await this.sendPrivateMsg('你的登录信息已过期，请重新登录Bilibili')
                        return
                    }
                    case -400:
                    case -404:
                    default: {
                        await deleteSub()
                        // PrivateMsg
                        await this.sendPrivateMsg(`UID:${sub.uid} 数据出现问题，自动取消订阅`)
                        // log
                        this.logger.info(`UID:${sub.uid} 数据出现问题，自动取消订阅`)
                        return
                    }
                }
            }
            // 检测房间号是否被篡改
            if (sub.live && (!data.live_room || data.live_room.roomid != sub.room_id)) {
                // 房间号被篡改，删除该订阅
                await deleteSub()
                // log
                this.logger.info(`UID:${sub.uid} 房间号被篡改，自动取消订阅`)
                // Send msg
                await this.sendPrivateMsg(`UID:${sub.uid} 房间号被篡改，自动取消订阅`)
                return
            }
            // 构建订阅对象
            const subManagerItem = {
                id: sub.id,
                uid: sub.uid,
                roomId: sub.room_id,
                target,
                platform: sub.platform,
                live: sub.live === 1 ? true : false,
                dynamic: sub.dynamic === 1 ? true : false,
                liveDispose: null
            }
            // 判断是否订阅直播
            if (sub.live) {
                // 判断订阅直播数是否超过限制
                if (!this.config.unlockSubLimits && liveSubNum >= 3) {
                    subManagerItem.live = false
                    // log
                    this.logger.warn(`UID:${sub.uid} 订阅直播数超过限制，自动取消订阅`)
                    // 发送错误消息
                    this.sendPrivateMsg(`UID:${sub.uid} 订阅直播数超过限制，自动取消订阅`)
                } else {
                    // 直播订阅数+1
                    liveSubNum++
                    // 订阅直播，开始循环检测
                    const dispose = ctx.setInterval(
                        this.liveDetect(ctx, sub.room_id, target),
                        this.config.liveLoopTime * 1000
                    )
                    // 保存销毁函数
                    subManagerItem.liveDispose = dispose
                }
            }
            // 保存新订阅对象
            this.subManager.push(subManagerItem)
        }
        // 检查是否有订阅对象需要动态监测
        if (this.subManager.some(sub => sub.dynamic)) {
            // 开始动态监测
            if (this.config.dynamicDebugMode) {
                this.dynamicDispose = ctx.setInterval(this.debug_dynamicDetect(ctx), 10000)
            } else {
                this.dynamicDispose = ctx.setInterval(this.dynamicDetect(ctx), 10000 /* this.config.dynamicLoopTime * 1000 */)
            }
        }
        // 在控制台中显示订阅对象
        this.updateSubNotifier(ctx)
    }

    unsubSingle(ctx: Context, id: string /* UID或RoomId */, type: number /* 0取消Live订阅，1取消Dynamic订阅 */): string {
        // 定义返回消息
        let msg: string
        // 定义方法：检查是否没有任何订阅
        const checkIfNoSubExist = (sub: SubItem) => !sub.dynamic && !sub.live
        // 定义方法：将订阅对象从订阅管理对象中移除
        const removeSub = (index: number) => {
            // 从管理对象中移除
            this.subManager.splice(index, 1)
            // 从数据库中删除
            ctx.database.remove('bilibili', [this.subManager[index].id])
            // num--
            this.num--
            // 判断是否还存在订阅了动态的对象，不存在则停止动态监测
            this.checkIfUserIsTheLastOneWhoSubDyn()
        }

        try {
            switch (type) {
                case 0: { // 取消Live订阅
                    // 获取订阅对象所在的索引
                    const index = this.subManager.findIndex(sub => sub.roomId === id)
                    // 获取订阅对象
                    const sub = this.subManager.find(sub => sub.roomId === id)
                    // 判断是否存在订阅对象
                    if (!sub) {
                        msg = '未订阅该用户，无需取消订阅'
                        return msg
                    }
                    // 取消订阅
                    if (sub.live) sub.liveDispose()
                    sub.liveDispose = null
                    sub.live = false
                    // 如果没有对这个UP的任何订阅，则移除
                    if (checkIfNoSubExist(sub)) {
                        // 从管理对象中移除
                        removeSub(index)
                        return '已取消订阅该用户'
                    }
                    // 更新数据库
                    ctx.database.upsert('bilibili', [{
                        id: +`${sub.id}`,
                        live: 0
                    }])
                    return '已取消订阅Live'
                }
                case 1: { // 取消Dynamic订阅
                    // 获取订阅对象所在的索引
                    const index = this.subManager.findIndex(sub => sub.uid === id)
                    // 获取订阅对象
                    const sub = this.subManager.find(sub => sub.uid === id)
                    // 判断是否存在订阅对象
                    if (!sub) {
                        msg = '未订阅该用户，无需取消订阅'
                        return msg
                    }
                    // 取消订阅
                    this.subManager[index].dynamic = false
                    // 判断是否还存在订阅了动态的对象，不存在则停止动态监测
                    this.checkIfUserIsTheLastOneWhoSubDyn()
                    // 如果没有对这个UP的任何订阅，则移除
                    if (checkIfNoSubExist(sub)) {
                        // 从管理对象中移除
                        removeSub(index)
                        return '已取消订阅该用户'
                    }
                    // 更新数据库
                    ctx.database.upsert('bilibili', [{
                        id: sub.id,
                        dynamic: 0
                    }])
                    return '已取消订阅Dynamic'
                }
            }
        } finally {
            // 执行完该方法后，保证执行一次updateSubNotifier()
            this.updateSubNotifier(ctx)
        }
    }

    checkIfUserIsTheLastOneWhoSubDyn() {
        if (this.subManager.some(sub => sub.dynamic)) {
            // 停止动态监测
            this.dynamicDispose()
            this.dynamicDispose = null
        }
    }

    unsubAll(ctx: Context, uid: string) {
        this.subManager.filter(sub => sub.uid === uid).map(async (sub, i) => {
            // 取消全部订阅 执行dispose方法，销毁定时器
            if (sub.live) await this.subManager[i].liveDispose()
            // 判断是否还存在订阅了动态的对象，不存在则停止动态监测
            this.checkIfUserIsTheLastOneWhoSubDyn()
            // 从数据库中删除订阅
            await ctx.database.remove('bilibili', { uid: this.subManager[i].uid })
            // 将该订阅对象从订阅管理对象中移除
            this.subManager.splice(i, 1)
            // id--
            this.num--
            // 发送成功通知
            this.sendPrivateMsg(`UID:${uid}，已取消订阅该用户`)
            // 更新控制台提示
            this.updateSubNotifier(ctx)
        })
    }

    async checkIfIsLogin(ctx: Context) {
        if ((await ctx.database.get('loginBili', 1)).length !== 0) { // 数据库中有数据
            // 检查cookie中是否有值
            if (ctx.ba.getCookies() !== '[]') { // 有值说明已登录
                return true
            }
        }
        return false
    }
}

namespace ComRegister {
    export interface Config {
        master: {
            enable: boolean,
            platform: string,
            masterAccount: string,
            masterAccountGuildId: string
        },
        unlockSubLimits: boolean,
        automaticResend: boolean,
        changeMasterInfoApi: boolean,
        restartPush: boolean,
        pushTime: number,
        liveLoopTime: number,
        customLiveStart: string,
        customLive: string,
        customLiveEnd: string,
        dynamicUrl: boolean,
        dynamicLoopTime: number,
        dynamicCheckNumber: number,
        filter: {
            enable: boolean,
            notify: boolean
            regex: string,
            keywords: Array<string>,
        },
        dynamicDebugMode: boolean
    }

    export const Config: Schema<Config> = Schema.object({
        master: Schema.object({
            enable: Schema.boolean(),
            platform: Schema.string(),
            masterAccount: Schema.string(),
            masterAccountGuildId: Schema.string()
        }),
        unlockSubLimits: Schema.boolean().required(),
        automaticResend: Schema.boolean().required(),
        changeMasterInfoApi: Schema.boolean().required(),
        restartPush: Schema.boolean().required(),
        pushTime: Schema.number().required(),
        liveLoopTime: Schema.number().default(10),
        customLiveStart: Schema.string().required(),
        customLive: Schema.string(),
        customLiveEnd: Schema.string().required(),
        dynamicUrl: Schema.boolean().required(),
        dynamicLoopTime: Schema.number().default(60),
        dynamicCheckNumber: Schema.number().required(),
        filter: Schema.object({
            enable: Schema.boolean(),
            notify: Schema.boolean(),
            regex: Schema.string(),
            keywords: Schema.array(String),
        }),
        dynamicDebugMode: Schema.boolean().required()
    })
}

export default ComRegister
