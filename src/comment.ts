import * as vscode from 'vscode';

export class DComment implements vscode.Comment {
    mode: vscode.CommentMode;
    author: vscode.CommentAuthorInformation;

    constructor(
        author: string,
        face: string | null,
        public body: string,
        public thread: DThread,
        public manager: CommentManager
    ) {
        this.author = {
            name: author,
            iconPath: face
                ? vscode.Uri.parse(face).with({ scheme: 'https' })
                : undefined
        }
        this.mode = vscode.CommentMode.Preview;
        this.thread.comments = [... this.thread.comments, this];
    }

    dispose() {
        this.thread.comments = this.thread.comments.filter(c => c !== this);
        this.manager.removeComment(this);

        if (this.thread.comments.length === 0) {
            this.manager.removeThread(this.thread);
            this.thread.dispose();
        }
    }
}

export interface DThread extends vscode.CommentThread {
    refId: number;
    line: number | null;
    manager: CommentManager;
}

export function showThread(thread: vscode.CommentThread) {
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded
    vscode.window.showTextDocument(thread.uri).then(
        (editor) => {
            editor.revealRange(thread.range);
        }, (err) => console.error(err)
    );
}

export type FindThreadResult =
    { type: 'success', thread: DThread }
    | { type: 'error', message: string }

export class CommentManager
    implements vscode.CommentingRangeProvider {
    threadCounter: number;
    locMap: Map<string, Map<number | null, number>>;
    threadMap: Map<number, DThread>;

    onCommentChange: vscode.Event<void>;
    commentEmitter: vscode.EventEmitter<void>

    constructor(public controller: vscode.CommentController) {
        this.threadCounter = 0;
        this.locMap = new Map();
        this.threadMap = new Map();

        this.commentEmitter = new vscode.EventEmitter();
        this.onCommentChange = this.commentEmitter.event;

        this.controller.commentingRangeProvider = this;
    }

    removeComment(_comment: DComment) {
        this.commentEmitter.fire();
    }

    removeThread(thread: DThread) {
        this.threadMap.delete(thread.refId);
        const uri = thread.uri.toString()
        this.locMap.get(uri)!.delete(thread.range.start.line);
        if (this.locMap.get(uri)!.size === 0) {
            this.locMap.delete(uri);
        }
        this.commentEmitter.fire();
    }

    getThreadById(thread: number): FindThreadResult {
        if (this.threadMap.has(thread)) {
            return { type: 'success', thread: this.threadMap.get(thread)! };
        } else {
            return { type: 'error', message: `No such thread ${thread}` }
        }
    }

    listThreads(uri: vscode.Uri): DThread[] {
        if (this.locMap.has(uri.toString()))
            return [... this.locMap.get(uri.toString())!.values()]
                .map(refId => this.threadMap.get(refId)!);
        else
            return [];
    }

    addThread(thread: vscode.CommentThread): DThread {
        this.threadCounter ++;
        const refId = this.threadCounter;
        (thread as any).refId = refId;
        const line = thread.range.start.line;
        thread.range = new vscode.Range(line, 0, line, 0);
        (thread as any).line = thread.range.start.line;
        (thread as any).manager = this;
        if (! this.locMap.has(thread.uri.toString()))
            this.locMap.set(thread.uri.toString(), new Map());
        this.locMap.get(thread.uri.toString())!.set(line, refId);
        this.threadMap.set(refId, thread as DThread);
        return thread as DThread;
    }

    getThread(uri: vscode.Uri, line: number | null): DThread {
        const uriString = uri.toString();
        if (! this.locMap.has(uriString))
            this.locMap.set(uriString, new Map());
        if (! this.locMap.get(uriString)!.has(line)) {
            this.threadCounter ++;
            const refId = this.threadCounter;
            const thread =
                this.controller.createCommentThread(
                    uri, new vscode.Range(line ?? 0, 0, line ?? 0, 0), []);

            const thType = line === null ? 'File thread' : 'Thread';

            thread.label = `${thType} ${refId} (Reply using '/${refId} comment')`;

            (thread as any).refId = refId;
            (thread as any).line = line;
            (thread as any).manager = this;

            this.threadMap.set(refId, thread as DThread);
            this.locMap.get(uriString)!.set(line, refId);
        }

        return this.threadMap.get(this.locMap.get(uriString)!.get(line)!)!;
    }

    provideCommentingRanges
        (document: vscode.TextDocument, _token: vscode.CancellationToken)
        : vscode.ProviderResult<vscode.Range[]> {
        return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
    }

    dispose() {
        for (const [, thread] of this.threadMap) {
            thread.dispose();
        }
    }
}
