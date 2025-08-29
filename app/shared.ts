import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import {
	GitObjectTypeEnum,
	type TreeObjectEntry,
	type CommitInfo
} from './types';

export function print(str: string) {
	return process.stdout.write(str, 'utf-8');
}

interface GitObjectBaseShape<T extends GitObjectTypeEnum> {
	type: T;
	size: number;
	buffer: Buffer;
}

interface GitObjectExtShape {
	[GitObjectTypeEnum.BLOB]: {};
	[GitObjectTypeEnum.COMMIT]: { commitInfo: CommitInfo };
	[GitObjectTypeEnum.TREE]: { entries: TreeObjectEntry[] };
}

export class GitObjectReader {
	constructor(private directory = '.') {}

	readRaw(hash: string) {
		const dir = hash.slice(0, 2);
		const blob = hash.slice(2);
		const buffer = fs.readFileSync(
			path.resolve(this.directory, '.git/objects', dir, blob)
		);

		return zlib.unzipSync(buffer);
	}

	read<T extends GitObjectTypeEnum>(
		hash: string
	): GitObjectBaseShape<T> & GitObjectExtShape[T] {
		const decompressed = this.readRaw(hash);
		const type = decompressed.toString(
			'utf-8',
			0,
			decompressed.indexOf(0x20)
		) as T;
		const buffer = decompressed.subarray(decompressed.indexOf(0x00) + 1);
		const size = buffer.length;

		switch (type) {
			case GitObjectTypeEnum.BLOB:
				return { type, size, buffer } as any;
			case GitObjectTypeEnum.COMMIT:
				const commitInfo = this.#getCommit(buffer);
				return { type, size, buffer, commitInfo } as any;
			case GitObjectTypeEnum.TREE:
				const entries = this.#getTree(buffer);
				return { type, size, buffer, entries } as any;
		}
	}

	write(buffer: Buffer, hash: string) {
		const dir = hash.slice(0, 2);
		const blob = hash.slice(2);
		const dirPath = path.resolve(this.directory, '.git/objects', dir);
		const blobPath = path.resolve(this.directory, dirPath, blob);

		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath);
		}

		if (!fs.existsSync(blobPath)) {
			fs.writeFileSync(blobPath, buffer);
		}
	}

	#getCommit(buffer: Buffer) {
		const [tree, parent, author, committer, ...message] = buffer
			.toString()
			.split('\n')
			.filter(Boolean);
		const [, treeHash] = tree.split(' ');
		const [, parentHash] = parent.split(' ');
		const [, authorName, authorEmail] =
			author.match(/author (.*) <(.*)> (.*) (.*)/) || [];
		const [, committerName, committerEmail, commitTime, commitTz] =
			committer.match(/committer (.*) <(.*)> (.*) (.*)/) || [];

		return {
			tree: treeHash,
			parent: parentHash,
			author: { name: authorName, email: authorEmail },
			committer: { name: committerName, email: committerEmail },
			time: `${commitTime} ${commitTz}`,
			message: message.join('\n')
		} as CommitInfo;
	}

	#getTree(buffer: Buffer) {
		const entries: TreeObjectEntry[] = [];
		let offset = 0;
		while (offset < buffer.length) {
			// 1. search mode type --> 0x20
			const modeStart = offset;
			const modeEnd = buffer.indexOf(0x20, modeStart);
			const mode = buffer.toString('utf-8', modeStart, modeEnd);

			// 2. search file/dir name --> 0x00
			const nameStart = modeEnd + 1;
			const nameEnd = buffer.indexOf(0x00, modeEnd);
			const name = buffer.toString('utf-8', nameStart, nameEnd);

			// 3. search SHA-1 hash (20 bytes)
			const hashStart = nameEnd + 1;
			const hashEnd = hashStart + 20;
			const hash = buffer.toString('hex', hashStart, hashEnd);

			entries.push({ mode: +mode, hash, name });
			offset = hashEnd;
		}

		return entries;
	}
}
