export interface TextDanmaku {
    author: string;
    face: string | null;
    content: string;
}

export interface ThreadDanmaku {
    type: 'thread';
    thread: number;
    text: string;
}

export interface FileDanmaku {
    type: 'file';
    leader: string;
    file: string;
    line?: number;
    text: string;
}

export interface NormalDanmaku {
    type: 'normal';
}

export type Danmaku =
    TextDanmaku
    & (ThreadDanmaku | FileDanmaku | NormalDanmaku);

const threadRegex = /^\/(\d+)\s+/;
const fileRegex = /^([=\/\^\$])([^\s:]+)(?::(\d+)?)?\s+/

export function parseDanmaku(line: string): Danmaku | null {
    try {
        const json = JSON.parse(line) as TextDanmaku;
        const threadMatch = json.content.match(threadRegex);
        if (threadMatch) {
            return {
                ...json,
                type: 'thread',
                thread: + threadMatch[1],
                text: json.content.slice(threadMatch[0].length)
            };
        }

        const fileMatch = json.content.match(fileRegex);
        if (fileMatch) {
            const line = fileMatch[3] ? (+ fileMatch[3] - 1) : undefined;

            return {
                ...json,
                leader: fileMatch[1],
                type: 'file',
                file: fileMatch[2],
                line,
                text: json.content.slice(fileMatch[0].length)
            };
        }
        return {
            author: json.author,
            face: json.face,
            content: json.content,
            type: 'normal'
        }
    } catch(err) {
        if (err instanceof SyntaxError) {
            return null;
        } else {
            throw err;
        }
    }
}
