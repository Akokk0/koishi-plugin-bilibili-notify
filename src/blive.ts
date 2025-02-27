import { Context, Logger } from "koishi";
import { LiveInfoStreamKey } from "./types/live";

class BLive {
    // 必须服务
    static inject = ['ba']
    // 定义类属性
    static sequence: number = 1
    ctx: Context
    logger: Logger
    private liveServer: WebSocket | null = null
    private heartbeatTimer: NodeJS.Timeout | null = null
    private reconnectTimer: NodeJS.Timeout | null = null
    private roomId: string | null = null
    private roomData: LiveInfoStreamKey['data'] | null = null

    // 构造函数
    constructor(ctx: Context) {
        this.ctx = ctx
        this.logger = ctx.logger('bl')
        this.connectToLiveBroadcastRoom('22908869')
    }

    async connectToLiveBroadcastRoom(roomId: string) {
        this.roomId = roomId
        try {
            const { data } = await this.ctx.ba.getLiveRoomInfoStreamKey(roomId) as { data: LiveInfoStreamKey['data'] }
            this.roomData = data
            const hostObj = data.host_list[0]
            const url = `ws://${hostObj.host}:${hostObj.ws_port}/sub`
            this.liveServer = this.ctx.http.ws(url)
            this.setupConnection()
        } catch (error) {
            this.logger.error('连接失败:', error)
            this.scheduleReconnect()
        }
    }

    private setupConnection() {
        if (!this.liveServer || !this.roomId || !this.roomData) return

        this.liveServer.onopen = () => {
            const body = {
                // uid: 0,
                roomid: this.roomId,
                // protover: 3,
                // platform: "web",
                // type: 2,
                // key: this.roomData.token
            };

            const jsonBody = JSON.stringify(body)
            const headerSize = 16
            const bodySize = jsonBody.length
            const totalSize = headerSize + bodySize

            const header = new ArrayBuffer(headerSize);
            const headerView = new DataView(header);
            headerView.setUint32(0, totalSize);
            headerView.setUint16(4, headerSize);
            headerView.setUint16(6, 1);
            headerView.setUint32(8, 7);
            headerView.setUint32(12, BLive.sequence++);

            const fullMessage = new Uint8Array(totalSize);
            fullMessage.set(new Uint8Array(header), 0);
            for (let i = 0; i < bodySize; i++) {
                fullMessage[headerSize + i] = jsonBody.charCodeAt(i);
            }

            this.liveServer.send(fullMessage);
            this.logger.info('认证包已发送');
            this.startHeartbeat()
        }

        this.liveServer.onerror = (ev) => {
            this.logger.info('连接发生了错误')
            console.log(ev);
        }

        this.liveServer.onmessage = (event) => {
            this.handleMessage(event.data);
        }

        this.liveServer.onerror = (error) => {
            this.logger.error('连接错误:', error);
            this.cleanup();
            this.scheduleReconnect();
        }

        this.liveServer.onclose = () => {
            this.logger.info('连接关闭');
            this.cleanup();
            this.scheduleReconnect();
        }
    }

    private startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (!this.liveServer) return

            const header = new ArrayBuffer(16);
            const headerView = new DataView(header);
            headerView.setUint32(0, 16);
            headerView.setUint16(4, 16);
            headerView.setUint16(6, 1);
            headerView.setUint32(8, 2);
            headerView.setUint32(12, BLive.sequence++);

            this.liveServer.send(header);
            this.logger.debug('心跳包已发送');
        }, 30000);
    }

    private handleMessage(packet: ArrayBuffer | string) {
        if (typeof packet === 'string') {
            this.logger.debug('收到文本消息:', packet);
            return;
        }

        const view = new DataView(packet);
        const headerLength = view.getUint16(4);
        const protocolVersion = view.getUint16(6);
        const operation = view.getUint32(8);

        // 处理不同协议版本
        let payload: ArrayBuffer = packet.slice(headerLength);
        if (protocolVersion === 2) {
            // zlib压缩
            payload = this.decompressZlib(payload);
        } else if (protocolVersion === 3) {
            // brotli压缩
            payload = this.decompressBrotli(payload);
        }

        let popularity: number;
        switch (operation) {
            case 3: // 心跳回复
                popularity = new DataView(payload).getUint32(0);
                this.logger.debug(`收到心跳回复，人气值: ${popularity}`);
                break;
            case 5: // 普通包
                this.handleNormalPacket(payload);
                break;
            case 8: // 认证回复
                this.logger.info('认证成功');
                break;
            default:
                this.logger.warn(`未知操作码: ${operation}`);
        }
    }

    private decompressZlib(data: ArrayBuffer): ArrayBuffer {
        // TODO: 实现zlib解压
        this.logger.warn('zlib解压未实现');
        return data;
    }

    private decompressBrotli(data: ArrayBuffer): ArrayBuffer {
        // TODO: 实现brotli解压
        this.logger.warn('brotli解压未实现');
        return data;
    }

    private handleNormalPacket(payload: ArrayBuffer) {
        this.logger.debug('收到普通包');
        try {
            const decoder = new TextDecoder();
            const jsonStr = decoder.decode(payload);
            const message = JSON.parse(jsonStr);
            this.logger.debug('解析普通包内容:', message);
            // TODO: 实现普通包处理逻辑
        } catch (error) {
            this.logger.error('解析普通包失败:', error);
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer || !this.roomId) return

        this.reconnectTimer = setTimeout(() => {
            this.connectToLiveBroadcastRoom(this.roomId);
            this.reconnectTimer = null;
        }, 5000);
    }

    private cleanup() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }
    }

}

export default BLive
