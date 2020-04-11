#!/usr/bin/env python3 -u

import aiohttp
import asyncio
import json
import struct
import sys
import time
import websockets
import zlib

FACE_TTL = 3600

face_cache = dict()

async def get_face(uid, session):
    if uid not in face_cache \
            or face_cache[uid][0] + FACE_TTL < time.monotonic():
        base = 'https://api.bilibili.com/x/space/app/index?mid='
        async with session.get(base + str(uid)) as response:
            face =(await response.json())['data']['info']['face']
        face_cache[uid] = (time.monotonic(), face)
        return face
    else:
        return face_cache[uid][1]

async def real_id(live_id, session):
    base = 'https://api.live.bilibili.com/room/v1/Room/room_init?id='
    async with session.get(base + str(live_id)) as response:
        return (await response.json())['data']['room_id']

def make_packet(op, body):
    if type(body) == str:
        body = body.encode()
    head = struct.pack('>HLL', 1, op, 1)
    head_len = struct.pack('>H', 6 + len(head))
    total_len = struct.pack('>L', 4 + len(head_len + head + body))
    return total_len + head_len + head + body

def make_auth(live_id):
    body = json.dumps({
        "uid": 0,
        "roomid": live_id
    })
    return make_packet(7, body)

def make_heartbeat():
    return make_packet(2, b'{}')

def parse_packet(packet):
    try:
        _packet_len, head_len, ver, op, _seq = \
            struct.unpack('>LHHLL', packet[:16])
        packet = packet[head_len:]
        if op == 3:
            activity, = struct.unpack('>L', packet)
            return {
                'type': 'activity',
                'activity': activity
            }
        elif op == 5:
            if ver == 2:
                packet = zlib.decompress(packet)
                _packet_len_1, head_len_1, _ver_1, _op_1, _seq_1 = \
                    struct.unpack('>LHHLL', packet[:16])
                packet = packet[head_len_1:]
            body = json.loads(packet)
            return {
                'type': 'action',
                'action': body
            }
        elif op == 8:
            return {
                'type': 'heartbeat'
            }
        else:
            return {
                'type': 'unknown',
                'op': op
            }
    except Exception as e:
        return {
            'type': 'error',
            'error': e
        }

uri = 'wss://broadcastlv.chat.bilibili.com:2245/sub'

async def heartbeat(ws):
    hb = make_heartbeat()
    while True:
        await ws.send(hb)
        await asyncio.sleep(30)

async def subscribe(live_id, handler):
    async with aiohttp.ClientSession() as session:
        live_id = await real_id(live_id, session)

        async with websockets.connect(uri) as ws:
            await ws.send(make_auth(live_id)) # Closed after here?

            print('Connected', file=sys.stderr)

            heartbeat_task = asyncio.create_task(heartbeat(ws))

            try:
                while True:
                    msg = await ws.recv()
                    event = parse_packet(msg)
                    await handler(event, session)
            except websockets.ConnectionClosed as err:
                print(err, file=sys.stderr)
                print('Connection closed', file=sys.stderr)
            finally:
                heartbeat_task.cancel()

async def handle(event, session):
    if event['type'] == 'action' \
        and event['action']['cmd'] == 'DANMU_MSG':
        info = event['action']['info']
        uid = info[2][0]
        author = info[2][1]
        content = info[1]
        face = await get_face(uid, session)
        print(json.dumps({'author': author, 'face': face, 'content': content}))

async def main():
    await subscribe(int(sys.argv[1]), handle)

if __name__ == '__main__':
    asyncio.run(main())
