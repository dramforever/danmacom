import * as vscode from 'vscode';
import { TextDanmaku } from '../danmaku';

export interface Backend extends vscode.Disposable {
    onLogMessage: vscode.Event<string>;
    onDanmaku: vscode.Event<TextDanmaku>;
    onClose: vscode.Event<void>;
}

export type BackendMaker = { new (config: object): Backend; };

export class BackendConfigError extends Error {
    constructor(message?: string) {
        super(message);
    }
}
