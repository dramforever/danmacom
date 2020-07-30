import * as vscode from 'vscode';
import * as zlib from 'zlib';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import { Backend, BackendConfigError } from '.';
import { TextDanmaku } from '../danmaku';

interface FaceCacheElement {
    time: number;
    face: string;
}

const faceCache: Map<number, FaceCacheElement> = new Map();

// https://stackoverflow.com/a/46964780/

async function getFace(uid: number): Promise<string> {
    const FACE_CACHE_VALID = 3600 * 1000;

    const [seconds, nanos] = process.hrtime();
    const now = seconds * 1000 + nanos / 1000000;

    if (! faceCache.has(uid)
        || faceCache.get(uid)!.time + FACE_CACHE_VALID < now) {
        const BASE = 'https://api.bilibili.com/x/space/app/index?mid=';
        const response = await fetch(`${BASE}${uid}`);
        const face = (await response.json() as any).data.info.face;
        faceCache.set(uid, { time: now, face });
        return face;
    } else {
        return faceCache.get(uid)!.face;
    }
}

async function real_id(id: number): Promise<number> {
    const BASE = 'https://api.live.bilibili.com/room/v1/Room/room_init?id=';
    const response = await fetch(`${BASE}${id}`);
    return (await response.json() as any).data.room_id;
}

function makePacket(op: number, body: Buffer | string) {
    if (typeof body === 'string') {
        body = Buffer.from(body);
    }

    const len = body.byteLength;
    const header = Buffer.alloc(16);
    header.writeUInt32BE(16 + len, 0);
    header.writeUInt16BE(16, 4);
    header.writeUInt16BE(1, 6);
    header.writeUInt32BE(op, 8);
    header.writeUInt32BE(1, 12);

    return Buffer.concat([header, body]);
}

function makeAuth(liveId: number) {
    return makePacket(7, JSON.stringify({
        uid: 0,
        roomid: liveId
    }));
}

function makeHeartbeat() {
    return makePacket(2, '{}');
}

function parsePacket(packet: Buffer) {
    const head_len = packet.readUInt16BE(4);
    const ver = packet.readUInt16BE(6);
    const op = packet.readUInt32BE(8);

    packet = packet.slice(head_len);

    if (op === 3) {
        const activity = packet.readUInt32BE(0);
        return {
            type: 'activity',
            activity
        }
    } else if (op === 5) {
        if (ver === 2) {
            packet = zlib.inflateSync(packet);
            const next_head_len = packet.readUInt16BE(4);
            packet = packet.slice(next_head_len);
        }
        const action = JSON.parse(packet.toString());
        return {
            type: 'action',
            action
        }
    } else if (op === 8) {
        return {
            type: 'heartbeat'
        };
    } else {
        return {
            type: 'unknown',
            op
        };
    }
}

const WebSocketURI = 'wss://broadcastlv.chat.bilibili.com:2245/sub'

export class BilibiliBackend implements Backend {
    logEmitter: vscode.EventEmitter<string>;
    onLogMessage: vscode.Event<string>;

    danmakuEmitter: vscode.EventEmitter<TextDanmaku>;
    onDanmaku: vscode.Event<TextDanmaku>;

    closeEmitter: vscode.EventEmitter<void>;
    onClose: vscode.Event<void>;

    liveId: number;
    realIdPromise: Promise<number>;

    ws: WebSocket;
    timeout: NodeJS.Timeout | null

    constructor(config: object) {
        if ('liveId' in config && typeof (config as any).liveId === 'number') {
            this.liveId = (config as any).liveId;
        } else {
            throw new BackendConfigError('Required: liveId: number');
        }
        this.logEmitter = new vscode.EventEmitter();
        this.onLogMessage = this.logEmitter.event;
        this.danmakuEmitter = new vscode.EventEmitter();
        this.onDanmaku = this.danmakuEmitter.event;
        this.closeEmitter = new vscode.EventEmitter();
        this.onClose = this.closeEmitter.event;
        this.ws = new WebSocket(WebSocketURI);
        this.timeout = null;

        this.realIdPromise = real_id(this.liveId);
        this.start();
    }

    start() {
        const hb = makeHeartbeat();

        const heartBeat = () => {
            this.ws.send(hb, (err) => {
                if (err) {
                    console.error('Heartbeat error: ', err);
                } else {
                    this.timeout = setTimeout(heartBeat, 10 * 1000);
                }
            });
        }

        this.ws.on('open', () => {
            this.realIdPromise.then(
                (realId) => this.ws.send(makeAuth(realId)),
                (err) => this.logEmitter.fire(err.toString())
            ).then(() => heartBeat());
            this.logEmitter.fire('Connected');
        });

        this.ws.on('message', (data) => {
            if (Array.isArray(data)) {
                data = Buffer.concat(data);
            }
            const buffer = Buffer.from(data);
            try {
                const event = parsePacket(buffer);
                if (event.type == 'action'
                    && event.action.cmd == 'DANMU_MSG') {
                    const info = event.action.info;
                    const uid = info[2][0];
                    const author = info[2][1];
                    const content = info[1];
                    getFace(uid).then(
                        (face) => this.danmakuEmitter.fire({ author, face, content }),
                        (err) => console.error(err)
                    );
                }
            } catch(err) {
                this.logEmitter.fire(`Error: ${err}`);
            }
        })

        this.ws.on('close', () => {
            if (this.timeout !== null) {
                clearTimeout(this.timeout);
                this.timeout = null;
            }
            setTimeout(() => {
                this.ws = new WebSocket(WebSocketURI);
                this.start();
            }, 3000);
            this.logEmitter.fire('Disconnected');
        });
    }

    toString() {
        return `Bilibili ${this.liveId}`
    }

    dispose() {
        this.logEmitter.dispose();
        this.danmakuEmitter.dispose();
        this.closeEmitter.dispose();
        if (this.timeout) clearTimeout(this.timeout);
    }
}
