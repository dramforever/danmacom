import * as vscode from 'vscode';

export type FindDocumentResult =
    { type: 'success', result: vscode.TextDocument }
    | { type: 'not_found' }
    | { type: 'multiple_found', paths: string[] }

export class DocumentFinder {
    documents: Map<vscode.TextDocument, string>;

    disposables: vscode.Disposable[];

    constructor() {
        this.documents = new Map();

        const update = this.update.bind(this);
        this.disposables = [
            vscode.workspace.onDidOpenTextDocument(update),
            vscode.workspace.onDidCloseTextDocument(update)
        ]

        vscode.workspace.textDocuments.forEach(this.update.bind(this));
    }

    update(doc: vscode.TextDocument) {
        const uri = doc.uri;

        if (doc.isClosed) {
            this.documents.delete(doc);
        } else {
            if (uri.scheme !== 'file') return;
            const path = vscode.workspace.asRelativePath(uri);
            this.documents.set(doc, path);
        }
    }

    findDocument(pred: (s: string) => boolean): FindDocumentResult {
        const res: [vscode.TextDocument, string][] = [];

        for (const [doc, path] of this.documents) {
            if (pred(path)) {
                res.push([doc, path]);
            }
        }

        if (res.length == 0) {
            return {
                type: 'not_found'
            };
        } else if (res.length > 1) {
            return {
                type: 'multiple_found',
                paths: res.map(x => x[1])
            };
        } else {
            return {
                type: 'success',
                result: res[0][0]
            }
        }
    }

    dispose() {
        this.disposables.forEach(x => x.dispose());
    }
}
