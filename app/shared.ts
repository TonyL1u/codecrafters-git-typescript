import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import type { TreeObjectEntry, CommitInfo } from './types';

export function print(str: string) {
	return process.stdout.write(str, 'utf-8');
}

export function readRawGitObjects(hash: string, base = '.') {
	const dir = hash.slice(0, 2);
	const blob = hash.slice(2);
	const buffer = fs.readFileSync(
		path.resolve(base, '.git/objects', dir, blob)
	);

	return zlib.unzipSync(buffer);
}

export function readGitObjects(hash: string, base = '.') {
	const decompressed = readRawGitObjects(hash, base);
	const type = decompressed.toString('utf-8', 0, decompressed.indexOf(0x20));
	const buffer = decompressed.subarray(decompressed.indexOf(0x00) + 1);

	return { type, size: buffer.length, buffer };
}

export function readGitCommitObjects(hash: string, base = '.') {
	const { buffer, ...others } = readGitObjects(hash, base);
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
	const commitInfo: CommitInfo = {
		tree: treeHash,
		parent: parentHash,
		author: { name: authorName, email: authorEmail },
		committer: { name: committerName, email: committerEmail },
		time: `${commitTime} ${commitTz}`,
		message: message.join('\n')
	};

	return { buffer, commitInfo, ...others };
}

export function readGitTreeObjects(hash: string, base = '.') {
	const { buffer, ...others } = readGitObjects(hash, base);

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

	return { buffer, entries, ...others };
}

export function writeGitObjects(buffer: Buffer, hash: string, base = '.') {
	const dir = hash.slice(0, 2);
	const blob = hash.slice(2);
	const dirPath = path.resolve(base, '.git/objects', dir);
	const blobPath = path.resolve(base, dirPath, blob);

	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath);
	}

	if (!fs.existsSync(blobPath)) {
		fs.writeFileSync(blobPath, buffer);
	}
}
