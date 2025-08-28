import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

import {
	GitObjectTypeEnum,
	type TreeObjectEntry,
	type CommitInfo
} from './types';

export function createBlobObject(file: string) {
	// pack content with "blob <size>\0"
	const raw = fs.readFileSync(file);
	const header = Buffer.from(`${GitObjectTypeEnum.BLOB} ${raw.length}\0`);

	return createRawObject(header, raw);
}

export function createTreeObject(entries: TreeObjectEntry[]) {
	// 1. generate tree parts
	const parts = entries.map(({ mode, name, hash }) => {
		return Buffer.concat([
			Buffer.from(`${mode} ${name}\0`),
			Buffer.from(hash, 'hex')
		]);
	});

	// 2. calculate tree size
	const size = parts.map((part) => part.length).reduce((a, b) => a + b);
	const header = Buffer.from(`${GitObjectTypeEnum.TREE} ${size}\0`);

	return createRawObject(header, Buffer.concat(parts));
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
	const header = Buffer.from(`${GitObjectTypeEnum.COMMIT} ${raw.length}\0`);

	return createRawObject(header, raw);
}

export function createRawObject(...buffers: Buffer[]) {
	const buffer = Buffer.concat(buffers);
	// use zlib to compress the packed content
	const compressed = zlib.deflateSync(buffer);

	// use crypto to calculate SHA-1 hash
	const shasum = crypto.createHash('sha1');
	const hash = shasum.update(buffer).digest('hex');

	return { compressed, hash };
}
