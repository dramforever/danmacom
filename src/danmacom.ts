import * as vscode from 'vscode';
import { ProcessManager } from "./process";
import { CommentManager, DComment, DThread } from './comment';
import { DocumentFinder } from './document';
import { parseDanmaku } from './danmaku';
import { OutputTerminal } from './terminal';

export class Danmacom implements vscode.CodeLensProvider {
    process: ProcessManager;
    commentController: vscode.CommentController;
    commentManager: CommentManager;
    documentFinder: DocumentFinder;
    disposables: vscode.Disposable[];
    running: boolean;
    unread: number;
    status: vscode.StatusBarItem;

    codeLensesEmitter: vscode.EventEmitter<void>;
    onDidChangeCodeLenses: vscode.Event<void>;

    constructor(
        cmd: string,
        public outputTerminal: OutputTerminal,
        public terminal: vscode.Terminal
    ) {
        this.commentController =
            vscode.comments.createCommentController('danmacom', 'Danmacom');
        this.process = new ProcessManager(cmd);
        this.commentManager = new CommentManager(this.commentController);
        this.documentFinder = new DocumentFinder;
        this.running = true;
        this.unread = 0;

        this.status = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );

        this.status.tooltip = 'Danmacom - Click to show terminal'
        this.status.command = 'danmacom.statusBar';
        this.updateStatus();
        this.status.show();

        this.codeLensesEmitter = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this.codeLensesEmitter.event;

        this.disposables = [
            this.commentController,
            this.process,
            this.commentManager,
            this.documentFinder,
            this.status,
            this.codeLensesEmitter,

            vscode.languages.registerCodeLensProvider(
                { scheme: 'file' },
                this
            ),

            vscode.window.onDidChangeActiveTerminal((term) => {
                if (term === this.terminal) {
                    this.unread = 0;
                    this.updateStatus();
                }
            }),

            this.commentManager.onCommentChange(() => {
                this.codeLensesEmitter.fire();
            }),

            this.process.onStderr(data => {
                this.printRGB(data.replace(/\n/g, '\r\n'), [128, 128, 128])
            }),

            this.process.onLine(this.handleLine.bind(this)),
            this.process.onStop(this.dispose.bind(this)),
            this.outputTerminal.onClose(this.dispose.bind(this)),
            this.outputTerminal.onInput((data) => {
                if (data === '\x03') {
                    this.error('Interrupted');
                    this.dispose();
                } else if (data === '\r' || data === ' ') {
                    this.unread = 0;
                    this.updateStatus();
                }
            })
        ];

        this.trace(`[Starting ${cmd}]`);
        terminal.show();
    }

    clickStatusBar() {
        this.terminal.show();
        this.unread = 0;
        this.updateStatus();
    }

    updateStatus() {
        this.status.text = '$(comment-discussion)$(arrow-right)$(file-code)';
        if (this.unread > 0)
            this.status.text += ` ($(bell)${this.unread})`;
    }

    handleReply(reply: vscode.CommentReply) {
        const text = reply.text.trim();
        const thread =
            ('refId' in reply.thread)
            ? (reply.thread as DThread)
            : this.commentManager.addThread(reply.thread);
        new DComment(
            'Host', null, text, thread, this.commentManager
        );

        this.trace(`[Host]: /${thread.refId} ${text}`);
        this.codeLensesEmitter.fire();
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] {
        return this.commentManager.listThreads(document.uri)
            .map(thread => {
                const pre = thread.line === null ? 'File: ' : '';

                return new vscode.CodeLens(thread.range, {
                    title: `${pre}/${thread.refId}: ${thread.comments.length} comment(s)`,
                    command: 'danmacom.showThread',
                    arguments: [thread],
                });
            })
    }

    resolveCodeLens(
        codeLens: vscode.CodeLens,
        _token: vscode.CancellationToken
    ): vscode.CodeLens {
        return codeLens;
    }

    handleLine(line: string) {
        const danmaku = parseDanmaku(line);
        if (danmaku === null) {
            this.error(`  -> Error: Cannot parse json: ${line}`);
            return;
        }

        this.trace(`${danmaku.author}: ${danmaku.content}`);

        if (danmaku.type === 'thread') {
            const threadResult =
                this.commentManager.getThreadById(danmaku.thread)

            if (threadResult.type === 'error') {
                this.error(`  -> Error: ${threadResult.message}`);
            } else {
                new DComment(
                    danmaku.author, danmaku.face, danmaku.text,
                    threadResult.thread, this.commentManager
                );
            }
        } else if (danmaku.type === 'file') {
            const uriResult = this.documentFinder.findDocument(danmaku.file);

            if (uriResult.type === 'not_found') {
                this.error(`  -> Error: ${JSON.stringify(danmaku.file)} not found`)
            } else if (uriResult.type === 'multiple_found') {
                this.error(`  -> Error: ${JSON.stringify(danmaku.file)} is ambiguous: ${uriResult.paths.join(', ')}`)
            } else if (danmaku.line
                && (danmaku.line < 0
                    || danmaku.line >= uriResult.result.lineCount)) {
                this.error(`  -> Error: Line number ${danmaku.line + 1} out of range`);
            } else {
                const thread =
                    this.commentManager.getThread(
                        uriResult.result.uri, danmaku.line ?? null);

                new DComment(
                    danmaku.author, danmaku.face, danmaku.text,
                    thread, this.commentManager
                );
                this.trace(`  -> Thread id is ${thread.refId}, reply using '/${thread.refId} comment'`)
            }
        }

        this.codeLensesEmitter.fire();

        this.unread ++;
        this.updateStatus();
    }

    printRGB(data: string, [r, g, b]: [number, number, number]) {
        this.outputTerminal.write(
            `\x1b[38;2;${r};${g};${b}m${data}\x1b[0m`
        )
    }

    error(line: string) {
        this.printRGB(line + '\r\n', [255, 0, 0]);
    }

    notice(line: string) {
        this.printRGB(line + '\r\n', [0, 0, 255]);
    }

    trace(line: string) {
        this.printRGB(line + '\r\n', [0, 0, 0]);
    }

    dispose() {
        this.trace('[Stopping]');

        if (this.running) {
            this.running = false;
            this.disposables.forEach(x => x.dispose());
        }
    }
}
