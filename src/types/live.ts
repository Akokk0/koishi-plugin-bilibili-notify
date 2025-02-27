export type LiveInfoStreamKey = {
    code: number,
    message: string,
    ttl: number,
    data: {
        group: string,
        business_id: number,
        refresh_row_factor: number,
        refresh_rate: number,
        max_delay: number,
        token: string,
        host_list: [{
            host: string,
            port: number,
            wss_port: number,
            ws_port: number
        }]
    }
}