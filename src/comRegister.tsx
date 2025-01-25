/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bot, Context, Logger, Schema, Session, h } from "koishi"
import { Notifier } from "@koishijs/plugin-notifier";
import { } from '@koishijs/plugin-help'
// 导入qrcode
import QRCode from 'qrcode'
import { Jimp, JimpMime } from 'jimp'

enum LiveType {
    NotLiveBroadcast,
    StartBroadcasting,
    LiveBroadcast
}

class ComRegister {
    static inject = ['ba', 'gi', 'database', 'sm'];
    logger: Logger;
    config: ComRegister.Config
    loginTimer: Function
    num: number = 0
    rebootCount: number = 0
    subNotifier: Notifier
    subManager: {
        id: number,
        uid: string,
        roomId: string,
        targetId: string,
        platform: string,
        live: boolean,
        dynamic: boolean,
        liveDispose: Function,
        dynamicDispose: Function
    }[] = []
    // 机器人实例
    bot: Bot<Context>
    // 动态销毁函数
    dynamicDispose: () => void
    // 发送消息方式
    sendMsgFunc: (guild: string, content: any) => Promise<void>
    // 构造函数
    constructor(ctx: Context, config: ComRegister.Config) {
        this.logger = ctx.logger('cr')
        this.config = config
        // 拿到机器人实例
        if (ctx.bots[0].platform === config.platform) {
            this.bot = ctx.bots[0]
        } else {
            this.logger.error('未找到对应机器人实例，请检查配置是否正确或重新配置适配器！')
        }
        // 从数据库获取订阅
        this.getSubFromDatabase(ctx)
        // 判断消息发送方式
        if (config.automaticResend) {
            this.sendMsgFunc = async (guild: string, content: any) => {
                // 多次尝试发送消息
                const attempts = 3
                for (let i = 0; i < attempts; i++) {
                    try {
                        // 发送消息
                        await this.bot.sendMessage(guild, content)
                        // 防止消息发送速度过快被忽略
                        await ctx.sleep(500)
                        // 成功发送消息，跳出循环
                        break
                    } catch (e) {
                        if (i === attempts - 1) { // 已尝试三次
                            this.logger.error(`发送群组ID:${guild}消息失败！原因: ` + e.message)
                            this.sendPrivateMsg(`发送群组ID:${guild}消息失败，请查看日志`)
                        }
                    }
                }
            }
        } else {
            this.sendMsgFunc = async (guild: string, content: any) => {
                try {
                    // 发送消息
                    await this.bot.sendMessage(guild, content)
                } catch (e) {
                    this.logger.error(`发送群组ID:${guild}消息失败！原因: ` + e.message)
                    await this.sendPrivateMsg(`发送群组ID:${guild}消息失败，请查看日志`)
                }
            }
        }

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
                            return
                        }
                        // 取消全部订阅 执行dispose方法，销毁定时器
                        if (sub.dynamic) this.subManager[i].dynamicDispose()
                        if (sub.live) this.subManager[i].liveDispose()
                        // 从数据库中删除订阅
                        await ctx.database.remove('bilibili', { uid: this.subManager[i].uid })
                        // 将该订阅对象从订阅管理对象中移除
                        this.subManager.splice(i, 1)
                        // id--
                        this.num--
                        // 发送成功通知
                        session.send('已取消订阅该用户')
                        // 更新控制台提示
                        this.updateSubNotifier(ctx)
                        // 将存在flag设置为true
                        exist = true
                    }
                }))
                // 未订阅该用户，无需取消订阅
                if (!exist) session.send('未订阅该用户，无需取消订阅')
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
            .subcommand('.sub <mid:string> [...guildId:string]', '订阅用户动态和直播通知')
            .option('live', '-l')
            .option('dynamic', '-d')
            .usage('订阅用户动态和直播通知，若需要订阅直播请加上-l，需要订阅动态则加上-d。若没有加任何参数，之后会向你单独询问，尖括号中为必选参数，中括号为可选参数，目标群号若不填，则默认为当前群聊')
            .example('bili sub 1194210119 目标QQ群号(实验性) -l -d 订阅UID为1194210119的UP主的动态和直播')
            .action(async ({ session, options }, mid, ...guildId) => {
                this.logger.info('调用bili.sub指令')
                // 检查是否是不支持的平台
                switch (session.event.platform) {
                    case 'lark':
                    case 'red':
                    case 'onebot':
                    case 'telegram':
                    case 'satori':
                    case 'chronocat':
                    case 'qq':
                    case 'qqguild': break
                    default: return '暂不支持该平台'
                }
                // 检查是否登录
                if (!(await this.checkIfIsLogin(ctx))) {
                    // 未登录直接返回
                    return '请使用指令bili login登录后再进行订阅操作'
                }
                // 如果订阅人数超过三个则直接返回
                if (!config.unlockSubLimits && this.num >= 3) return '目前最多只能订阅三个人'
                // 检查必选参数是否有值
                if (!mid) return '请输入用户uid'
                // 判断要订阅的用户是否已经存在于订阅管理对象中
                if (this.subManager && this.subManager.some(sub => sub.uid === mid)) {
                    return '已订阅该用户，请勿重复订阅'
                }
                // 获取用户信息
                let content: any
                try {
                    content = await ctx.ba.getUserInfo(mid)
                } catch (e) {
                    return 'bili sub getUserInfo() 发生了错误，错误为：' + e.message
                }
                // 判断是否有其他问题
                if (content.code !== 0) {
                    let msg: string
                    switch (content.code) {
                        case -400: msg = '请求错误'; break;
                        case -403: msg = '访问权限不足，请尝试重新登录'; break;
                        case -404: msg = '用户不存在'; break;
                        case -352: msg = '风控校验失败，请尝试更换UA'; break;
                        default: msg = '未知错误，错误信息：' + content.message; break;
                    }
                    return msg
                }
                // 设置目标ID
                let targetId: string
                // 判断是否输入了QQ群号
                if (guildId.length > 0) { // 输入了QQ群号
                    // 定义方法
                    const checkIfGuildHasJoined = async (bot: Bot<Context>): Promise<Array<string>> => {
                        // 获取机器人加入的群组
                        const guildList = await bot.getGuildList()
                        // 定义满足条件的群组数组
                        const targetArr = []
                        // 判断群号是否符合条件
                        for (const guild of guildId) {
                            if (guildList.data.some(cv => cv.id === guild)) { // 机器人加入了该群
                                // 保存到数组
                                targetArr.push(guild)
                                // 继续下一个循环
                                continue
                            }
                            // 不满足条件发送错误提示
                            session.send(`您的机器未加入${guild}，无法对该群进行推送`)
                        }
                        // 返回数组
                        return targetArr
                    }
                    // 定义可用的群组数组
                    let okGuild: string[] = []
                    // 判断是否需要加入的群全部推送
                    if (guildId[0] === 'all') {
                        // 判断是否有群机器人相关Bot
                        if (['qq', 'onebot', 'red', 'satori', 'chronocat'].includes(session.event.platform)) {
                            okGuild.push('all')
                        } else {
                            // 发送错误提示并返回
                            session.send('您尚未配置任何QQ群相关机器人，不能对QQ群进行操作')
                            // 直接返回
                            return
                        }
                    } else {
                        // 判断是否有群机器人相关Bot
                        switch (session.event.platform) {
                            case 'qq':
                            case 'onebot':
                            case 'red':
                            case 'satori':
                            case 'chronocat': {
                                okGuild = await checkIfGuildHasJoined(this.bot)
                                break
                            }
                            default: {
                                // 发送错误提示并返回
                                session.send('您尚未配置任何QQ群相关机器人，不能对QQ群进行操作')
                                // 直接返回
                                return
                            }
                        }
                    }
                    // 将群号用空格进行分割
                    targetId = okGuild.join(' ')
                } else { // 没有输入QQ群号
                    // 为当前群聊环境进行推送
                    targetId = session.event.channel.id
                }
                // 获取data
                const { data } = content
                // 判断是否需要订阅直播
                const liveMsg = await this.checkIfNeedSub(options.live, '直播', session, data)
                // 判断是否需要订阅动态
                const dynamicMsg = await this.checkIfNeedSub(options.dynamic, '动态', session)
                // 判断是否未订阅任何消息
                if (!liveMsg && !dynamicMsg) {
                    return '您未订阅该UP的任何消息'
                }
                // 获取直播房间号
                const roomId = data.live_room?.roomid.toString()
                // 保存到数据库中
                const sub = await ctx.database.create('bilibili', {
                    uid: mid,
                    room_id: roomId,
                    dynamic: dynamicMsg ? 1 : 0,
                    video: 1,
                    live: liveMsg ? 1 : 0,
                    targetId,
                    platform: session.event.platform,
                    time: new Date()
                })
                // 订阅数+1
                this.num++
                // 开始订阅
                // 保存新订阅对象
                this.subManager.push({
                    id: sub.id,
                    uid: mid,
                    targetId,
                    roomId,
                    platform: session.event.platform,
                    live: liveMsg,
                    dynamic: dynamicMsg,
                    liveDispose: null,
                    dynamicDispose: null
                })
                // 获取用户信息
                let userData: any
                try {
                    const { data } = await ctx.ba.getMasterInfo(sub.uid)
                    userData = data
                } catch (e) {
                    this.logger.error('bili sub指令 getMasterInfo() 发生了错误，错误为：' + e.message)
                    return '订阅出错啦，请重试'
                }
                // 需要订阅直播
                if (liveMsg) {
                    await session.execute(`bili live ${roomId} ${targetId.split(',').join(' ')}`)
                    // 发送订阅消息通知
                    await session.send(`订阅${userData.info.uname}直播通知`)
                }
                // 需要订阅动态
                if (dynamicMsg) {
                    await session.execute(`bili dynamic ${mid} ${targetId.split(',').join(' ')}`)
                    // 发送订阅消息通知
                    await session.send(`订阅${userData.info.uname}动态通知`)
                }
                // 新增订阅展示到控制台
                this.updateSubNotifier(ctx)
            })

        biliCom
            .subcommand('.dynamic <uid:string> <...guildId:string>', '订阅用户动态推送', { hidden: true })
            .usage('订阅用户动态推送')
            .example('bili dynamic 1194210119 订阅UID为1194210119的动态')
            .action(async (_, uid, ...guildId) => {
                this.logger.info('调用bili.dynamic指令')
                // 如果uid为空则返回
                if (!uid) return `${uid}非法调用 dynamic 指令` // 用户uid不能为空
                if (!guildId) return `${uid}非法调用 dynamic 指令` // 目标群组或频道不能为空
                // 寻找对应订阅管理对象
                const index = this.subManager.findIndex(sub => sub.uid === uid)
                // 不存在则直接返回
                if (index === -1) return '请勿直接调用该指令'
                // 开始循环检测
                if (this.config.dynamicDebugMode) {
                    this.dynamicDispose = ctx.setInterval(this.debug_dynamicDetect(ctx, this.bot, uid, guildId), config.dynamicLoopTime * 1000)
                } else {
                    this.dynamicDispose = ctx.setInterval(this.dynamicDetect(ctx, guildId), config.dynamicLoopTime * 1000)
                }
            })

        biliCom
            .subcommand('.live <roomId:string> <...guildId:string>', '订阅主播开播通知', { hidden: true })
            .usage('订阅主播开播通知')
            .example('bili live 26316137 订阅房间号为26316137的直播间')
            .action(async (_, roomId, ...guildId) => {
                this.logger.info('调用bili.live指令')
                // 如果room_id为空则返回
                if (!roomId) return `${roomId}非法调用 dynamic 指令` // 订阅主播房间号不能为空
                if (!guildId) return `${roomId}非法调用 dynamic 指令` // 目标群组或频道不能为空
                // 要订阅的对象不在订阅管理对象中，直接返回
                const index = this.subManager.findIndex(sub => sub.roomId === roomId)
                if (index === -1) return '请勿直接调用该指令'
                // 开始循环检测
                const dispose = ctx.setInterval(this.liveDetect(ctx, roomId, guildId), config.liveLoopTime * 1000)
                // 保存销毁函数
                this.subManager[index].liveDispose = dispose
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
            .subcommand('.bot', '查询当前拥有的机器人信息', { hidden: true })
            .usage('查询当前拥有的机器人信息')
            .example('bili bot 查询当前拥有的机器人信息')
            .action(() => {
                this.logger.info('开始输出BOT信息')
                ctx.bots.forEach(bot => {
                    this.logger.info('--------------------------------')
                    this.logger.info('平台：' + bot.platform)
                    this.logger.info('名称：' + bot.user.name)
                    this.logger.info('--------------------------------')
                })
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

    async sendPrivateMsg(content: string) {
        if (this.config.master.enable) {
            if (this.config.master.masterAccountGuildId) {
                // 向机器人主人发送消息
                await this.bot.sendPrivateMessage(
                    this.config.master.masterAccount,
                    content,
                    this.config.master.masterAccountGuildId
                )
            } else {
                // 向机器人主人发送消息
                await this.bot.sendPrivateMessage(
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

    async sendMsg(targets: Array<string>, content: any) {
        // 定义需要发送的数组
        let sendArr = []
        // 判断是否需要推送所有机器人加入的群
        if (targets[0] === 'all') {
            // 获取所有guild
            for (const guild of (await this.bot.getGuildList()).data) {
                sendArr.push(guild.id)
            }
        } else {
            sendArr = targets
        }
        // 循环给每个群组发送
        for (const guild of sendArr) {
            await this.sendMsgFunc(guild, content)
        }
    }

    dynamicDetect(
        ctx: Context,
        guildId: Array<string>
    ) {
        let firstSubscription: boolean = true
        let updateBaseline: string
        // 相当于锁的作用，防止上一个循环没处理完
        let flag: boolean = true
        // 获取机器人实例

        // 返回一个闭包函数
        return async () => {
            // 判断上一个循环是否完成
            if (!flag) return
            flag = false
            // 无论是否执行成功都要释放锁
            try {
                // 第一次订阅判断
                if (firstSubscription) {
                    // 设置第一次的时间点
                    const data = await ctx.ba.getAllDynamic() as { code: number, data: { has_more: boolean, items: [], offset: string, update_baseline: string, update_num: number } }
                    // 判断是否出现其他问题
                    if (data.code !== 0) {
                        return
                    }
                    // 设置更新基线
                    updateBaseline = data.data.update_baseline
                    // 设置第一次为false
                    firstSubscription = false
                    return
                }
                // 获取用户空间动态数据
                let content: any
                try {
                    // 查询是否有新动态
                    const data = await ctx.ba.hasNewDynamic(updateBaseline)
                    // 没有新动态或出现其他问题直接返回
                    if (data.data.update_num <= 0 || data.code !== 0) {
                        return
                    }
                    // 获取动态内容
                    content = await ctx.ba.getAllDynamic(updateBaseline) as { code: number, data: { has_more: boolean, items: [], offset: string, update_baseline: string, update_num: number } }
                } catch (e) {
                    return this.logger.error('dynamicDetect getUserSpaceDynamic() 发生了错误，错误为：' + e.message)
                }
                // 判断是否出现其他问题
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
                for (let num = data.update_num - 1; num >= 0; num--) {
                    // 没有动态内容则直接跳过
                    if (!items[num]) continue
                    // 寻找关注的UP主的动态
                    this.subManager.forEach(async (sub) => {
                        // 判断是否是订阅的UP主
                        if (sub.uid === items[num].modules.module_author.mid) {
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
                                            await this.sendMsg(guildId, `${upName}发布了一条含有屏蔽关键字的动态`)
                                        }
                                        return
                                    }
                                    if (e.message === '已屏蔽转发动态') {
                                        if (this.config.filter.notify) {
                                            await this.sendMsg(guildId, `${upName}发布了一条转发动态，已屏蔽`)
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
                                await this.sendMsg(guildId, pic + <>{dUrl}</>)
                            } else if (buffer) {
                                this.logger.info('推送动态中，使用page模式');
                                // pic不存在，说明使用的是page模式
                                await this.sendMsg(guildId, <>{h.image(buffer, 'image/png')}{dUrl}</>)
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

    debug_dynamicDetect(
        ctx: Context,
        bot: Bot<Context>,
        uid: string,
        guildId: Array<string>
    ) {
        let firstSubscription: boolean = true
        let timePoint: number
        // 相当于锁的作用，防止上一个循环没处理完
        let flag: boolean = true

        return async () => {
            // 判断上一个循环是否完成
            if (!flag) return
            flag = false
            // 无论是否执行成功都要释放锁
            try {
                // 第一次订阅判断
                if (firstSubscription) {
                    this.logger.info(`UID：${uid}-动态监测开始`)
                    // 设置第一次的时间点
                    timePoint = ctx.ba.getTimeOfUTC8()
                    // 设置第一次为false
                    firstSubscription = false
                    return
                }
                this.logger.info(`UID：${uid}-获取动态信息中`)
                // 获取用户空间动态数据
                let content: any
                try {
                    content = await ctx.ba.getUserSpaceDynamic(uid)
                } catch (e) {
                    return this.logger.error(`UID：${uid}-dynamicDetect getUserSpaceDynamic() 发生了错误，错误为：${e.message}`)
                }
                this.logger.info(`UID：${uid}-判断动态信息是否正确`)
                // 判断是否出现其他问题
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
                            break
                        }
                        default: { // 未知错误
                            // 发送私聊消息
                            await this.sendPrivateMsg('获取动态信息错误，错误码为：' + content.code + '，错误为：' + content.message) // 未知错误
                            // 取消订阅
                            this.unsubAll(ctx, uid)
                            // 结束循环
                            break
                        }
                    }
                }
                // 获取数据内容
                const items = content.data.items
                this.logger.info(`UID：${uid}-获取到的动态信息：${items.map(v => v.basic.rid_str).join('、')}`)
                // 定义方法：更新时间点为最新发布动态的发布时间
                const updatePoint = (num: number) => {
                    switch (num) {
                        case 1: {
                            if (items[0].modules.module_tag) { // 存在置顶动态
                                timePoint = items[num].modules.module_author.pub_ts
                            }
                            break
                        }
                        case 0: timePoint = items[num].modules.module_author.pub_ts
                    }
                }
                // 发送请求 默认只查看配置文件规定数量的数据
                for (let num = this.config.dynamicCheckNumber - 1; num >= 0; num--) {
                    // 没有动态内容则直接跳过
                    if (!items[num]) continue
                    // 寻找发布时间比时间点更晚的动态
                    if (items[num].modules.module_author.pub_ts > timePoint) {
                        this.logger.info(`UID：${uid}-即将推送的动态：${items[num].basic.rid_str}`)
                        // 定义变量
                        let pic: string
                        let buffer: Buffer
                        // 从动态数据中取出UP主名称和动态ID
                        const upName = content.data.items[num].modules.module_author.name
                        const dynamicId = content.data.items[num].id_str
                        // 推送该条动态
                        const attempts = 3;
                        this.logger.info(`UID：${uid}-尝试渲染推送图片`)
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
                                if (e.message === '直播开播动态，不做处理') return updatePoint(num)
                                if (e.message === '出现关键词，屏蔽该动态') {
                                    // 如果需要发送才发送
                                    if (this.config.filter.notify) {
                                        await this.sendMsg(guildId, `${upName}发布了一条含有屏蔽关键字的动态`)
                                    }
                                    return updatePoint(num)
                                }
                                if (e.message === '已屏蔽转发动态') {
                                    if (this.config.filter.notify) {
                                        await this.sendMsg(guildId, `${upName}发布了一条转发动态，已屏蔽`)
                                    }
                                    return updatePoint(num)
                                }
                                // 未知错误
                                if (i === attempts - 1) {
                                    this.logger.error('dynamicDetect generateDynamicImg() 推送卡片发送失败，原因：' + e.message)
                                    // 发送私聊消息并重启服务
                                    return await this.sendPrivateMsgAndStopService(ctx)
                                }
                            }
                        }
                        this.logger.info(`UID：${uid}-尝试推送动态卡片`)
                        // 判断是否需要发送URL
                        const dUrl = this.config.dynamicUrl ? `${upName}发布了一条动态：https://t.bilibili.com/${dynamicId}` : ''
                        // 如果pic存在，则直接返回pic
                        if (pic) {
                            this.logger.info(`UID：${uid}-推送动态中，使用render模式`);
                            // pic存在，使用的是render模式
                            await this.sendMsg(guildId, pic + <>{dUrl}</>)
                        } else if (buffer) {
                            this.logger.info(`UID：${uid}-推送动态中，使用page模式`);
                            // pic不存在，说明使用的是page模式
                            await this.sendMsg(guildId, <>{h.image(buffer, 'image/png')}{dUrl}</>)
                        } else {
                            this.logger.info(items[num].modules.module_author.name + '发布了一条动态，但是推送失败');
                        }
                        // 更新时间点
                        updatePoint(num)
                        this.logger.info(`UID：${uid}-推送动态完成`)
                    }
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
        guildId: Array<string>
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
        let sendLiveNotifyCard: (data: any, liveType: LiveType, liveStartMsg?: string, atAll?: boolean) => Promise<void>
        // 判断直播是否需要@全体成员
        if (this.config.pushUrl) {
            sendLiveNotifyCard = async (data: any, liveType: LiveType, liveStartMsg?: string, atAll?: boolean) => {
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
                    const msg = <>{atAll && <at type="all" />}{liveStartMsg && liveStartMsg}{liveType !== LiveType.StartBroadcasting ? `https://live.bilibili.com/${roomId}` : ''}</>
                    return await this.sendMsg(guildId, pic + msg)
                }
                // pic不存在，说明使用的是page模式
                const msg = <>{h.image(buffer, 'image/png')}{atAll && <at type="all" />}{liveStartMsg && liveStartMsg}{liveType !== LiveType.StartBroadcasting ? `https://live.bilibili.com/${roomId}` : ''}</>
                await this.sendMsg(guildId, msg)
            }
        } else {
            sendLiveNotifyCard = async (data: any, liveType: LiveType, liveStartMsg?: string, atAll?: boolean) => {
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
                    const msg = <>{atAll && <at type="all" />}{liveStartMsg && liveStartMsg}</>
                    return await this.sendMsg(guildId, pic + msg)
                }
                // pic不存在，说明使用的是page模式
                const msg = <>{h.image(buffer, 'image/png')}{atAll && <at type="all" />}{liveStartMsg && liveStartMsg}</>
                await this.sendMsg(guildId, msg)
            }
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
                            // 获取头像并缩放
                            let resizedImage: Buffer
                            // Jimp无法处理Webp格式，直接跳过
                            try {
                                resizedImage = await Jimp.read(userface).then(async image => {
                                    return await image.resize({ w: 100, h: 100 }).getBuffer(JimpMime.png)
                                })
                            } catch (e) {
                                if (e.message === 'Unsupported MIME type: image/webp')
                                    console.log('主播使用的是webp格式头像，无法进行渲染')
                                else
                                    console.log(e)
                            }
                            // 发送下播通知
                            await this.sendMsg(guildId, <>{resizedImage && h.image(resizedImage, 'image/png')} {liveEndMsg}</>)
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
                            // 判断是否需要@全体成员
                            if (this.config.liveStartAtAll) {
                                // 发送@全体成员通知
                                await sendLiveNotifyCard(data, LiveType.StartBroadcasting, liveStartMsg, true)
                            } else {
                                // 发送直播通知卡片
                                await sendLiveNotifyCard(data, LiveType.StartBroadcasting, liveStartMsg)
                            }
                        } else { // 还在直播
                            if (this.config.pushTime > 0) {
                                timer++
                                // 开始记录时间
                                if (timer >= (6 * 60 * this.config.pushTime)) { // 到时间推送直播消息
                                    // 到时间重新计时
                                    timer = 0
                                    // 发送直播通知卡片
                                    sendLiveNotifyCard(data, LiveType.LiveBroadcast)
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

    async checkIfNeedSub(comNeed: boolean, subType: string, session: Session, data?: any): Promise<boolean> {
        if (comNeed) {
            if (subType === '直播' && !data.live_room) {
                await session.send('该用户未开通直播间，无法订阅直播')
                return false
            }
            return true
        }
        let input: string // 用户输入
        // 询问用户是否需要订阅直播
        while (true) {
            session.send(`是否需要订阅${subType}？需要输入 y 不需要输入 n `)
            input = await session.prompt()
            if (!input) {
                await session.send('输入超时请重新订阅')
                continue
            }
            switch (input) {
                case 'y': { // 需要订阅直播
                    // 如果用户没有开通直播间则无法订阅
                    if (subType === '直播' && !data.live_room) {
                        await session.send('该用户未开通直播间，无法订阅直播')
                        return false
                    }
                    // 开启直播订阅
                    return true
                }
                // 不需要
                case 'n': return false
                default: { // 输入了其他的内容
                    session.send('输入有误，请输入 y 或 n')
                }
            }
        }
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
            // 获取推送目标数组
            const targetArr = sub.targetId.split(' ')
            // 判断数据库是否被篡改
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
            if (sub.live && (!data.live_room || data.live_room.roomid.toString() !== sub.room_id)) {
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
                targetId: sub.targetId,
                platform: sub.platform,
                live: +sub.live === 1 ? true : false,
                dynamic: +sub.dynamic === 1 ? true : false,
                liveDispose: null,
                dynamicDispose: null
            }
            if (sub.live) { // 需要订阅直播
                // 开始循环检测
                const dispose = ctx.setInterval(
                    this.liveDetect(ctx, sub.room_id, targetArr),
                    this.config.liveLoopTime * 1000
                )
                // 保存销毁函数
                subManagerItem.liveDispose = dispose
            }
            // 保存新订阅对象
            this.subManager.push(subManagerItem)
        }
        // 在控制台中显示订阅对象
        this.updateSubNotifier(ctx)
    }

    unsubSingle(ctx: Context, id: string /* UID或RoomId */, type: number /* 0取消Live订阅，1取消Dynamic订阅 */): string {
        let index: number
        // 定义方法：检查是否没有任何订阅
        const checkIfNoSubExist = (index: number) => {
            if (!this.subManager[index].dynamic && !this.subManager[index].live) {
                // 获取要删除行的id
                const id = this.subManager[index].id
                // 从管理对象中移除
                this.subManager.splice(index, 1)
                // 从数据库中删除
                ctx.database.remove('bilibili', [id])
                // num--
                this.num--
                return '已取消订阅该用户'
            }
            return null
        }

        try {
            switch (type) {
                case 0: { // 取消Live订阅
                    index = this.subManager.findIndex(sub => sub.roomId === id)
                    if (index === -1) return '未订阅该用户，无需取消订阅'
                    // 取消订阅
                    if (this.subManager[index].live) this.subManager[index].liveDispose()
                    this.subManager[index].liveDispose = null
                    this.subManager[index].live = false
                    // 如果没有对这个UP的任何订阅，则移除
                    const info = checkIfNoSubExist(index)
                    if (info) return info
                    // 更新数据库
                    ctx.database.upsert('bilibili', [{
                        id: +`${this.subManager[index].id}`,
                        live: 0
                    }])
                    return '已取消订阅Live'
                }
                case 1: { // 取消Dynamic订阅
                    index = this.subManager.findIndex(sub => sub.uid === id)
                    if (index === -1) return '未订阅该用户，无需取消订阅'
                    // 取消订阅
                    this.subManager[index].dynamic = false
                    // 如果没有对这个UP的任何订阅，则移除
                    const info = checkIfNoSubExist(index)
                    if (info) return
                    // 更新数据库
                    ctx.database.upsert('bilibili', [{
                        id: +`${this.subManager[index].id}`,
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

    unsubAll(ctx: Context, uid: string) {
        this.subManager.filter(sub => sub.uid === uid).map(async (sub, i) => {
            // 取消全部订阅 执行dispose方法，销毁定时器
            if (sub.live) await this.subManager[i].liveDispose()
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
        platform: string,
        master: {
            enable: boolean
            masterAccount: string,
            masterAccountGuildId: string
        },
        unlockSubLimits: boolean,
        automaticResend: boolean,
        changeMasterInfoApi: boolean,
        liveStartAtAll: boolean,
        restartPush: boolean,
        pushUrl: boolean,
        pushTime: number,
        liveLoopTime: number,
        customLiveStart: string,
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
        platform: Schema.string(),
        master: Schema.object({
            enable: Schema.boolean(),
            masterAccount: Schema.string(),
            masterAccountGuildId: Schema.string()
        }),
        unlockSubLimits: Schema.boolean().required(),
        automaticResend: Schema.boolean().required(),
        changeMasterInfoApi: Schema.boolean().required(),
        liveStartAtAll: Schema.boolean().required(),
        restartPush: Schema.boolean().required(),
        pushUrl: Schema.boolean().required(),
        pushTime: Schema.number().required(),
        liveLoopTime: Schema.number().default(10),
        customLiveStart: Schema.string().required(),
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