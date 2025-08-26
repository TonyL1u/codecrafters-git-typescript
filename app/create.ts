import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

import type { TreeObjectEntry, CommitInfo } from './types';
import { GitObjectType } from './types';

const concatBuffer = (...buffers: Buffer[]) => {
	return Buffer.concat(buffers.map((buf) => new Uint8Array(buf)));
};

const compressAndHash = (buffer: Buffer) => {
	const uint8 = new Uint8Array(buffer);
	// use zlib to compress the packed content
	const compressed = zlib.deflateSync(uint8);

	// use crypto to calculate SHA-1 hash
	const shasum = crypto.createHash('sha1');
	const hash = shasum.update(uint8).digest('hex');

	return { compressed, hash };
};

export function createBlobObject(file: string) {
	// pack content with "blob <size>\0"
	const raw = fs.readFileSync(file);
	const header = Buffer.from(`${GitObjectType.BLOB} ${raw.length}\0`);
	const packed = concatBuffer(header, raw);

	return compressAndHash(packed);
}

export function createTreeObject(entries: TreeObjectEntry[]) {
	// 1. generate tree parts
	const parts = entries.map(({ mode, name, hash }) => {
		return concatBuffer(
			Buffer.from(`${mode} ${name}\0`),
			Buffer.from(hash, 'hex')
		);
	});

	// 2. calculate tree size
	const size = parts.map((part) => part.length).reduce((a, b) => a + b);
	const header = Buffer.from(`${GitObjectType.TREE} ${size}\0`);

	// 3. pack the entire tree
	const packed = concatBuffer(header, ...parts);

	return compressAndHash(packed);
}

export function createCommitObject(info: CommitInfo) {
	// extract & pack commit info
	const { tree, parent, author, committer, time, message } = info;
	const raw = Buffer.from(
		`tree ${tree}
parent ${parent}
author ${author.name} <${author.email}> ${time}
committer ${committer.name} <${committer.email}> ${time}

${message}\n`
	);
	const header = Buffer.from(`${GitObjectType.COMMIT} ${raw.length}\0`);
	const packed = concatBuffer(header, raw);

	return compressAndHash(packed);
}
