import * as path from 'node:path';
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

import { createRawObject } from '../create';
import {
	readGitObjects,
	readGitCommitObjects,
	readGitTreeObjects,
	writeGitObjects
} from '../shared';
import {
	PackFileObjectTypeEnum,
	GitObjectTypeEnum,
	UnixFileModeEnum
} from '../types';

const args = process.argv.slice(2);

const fetchRefs = async (gitUrl: string) => {
	try {
		const response = await fetch(
			`${gitUrl}/info/refs?service=git-upload-pack`,
			{ method: 'GET' }
		);

		if (response.ok) {
			const text = await response.text();
			const [additions, ...refs] = text.split('\n').slice(1, -1);
			const capabilities = additions.split('\0')[1].split(' ');
			const symref = capabilities.find((cap) =>
				cap.startsWith('symref=HEAD:')
			);

			return {
				capabilities,
				HEAD: symref?.split('symref=HEAD:')[1] || '',
				data: refs.map((ref) => {
					const [hash, name] = ref.split(' ');

					// the first 4 bytes represent the size of the entire string
					return { hash: hash.slice(4), ref: name };
				})
			};
		}
	} catch (error) {
		console.error(error);
	}

	return null;
};

const fetchPackFiles = async (gitUrl: string, wantLines: string[]) => {
	try {
		const response = await fetch(`${gitUrl}/git-upload-pack`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-git-upload-pack-request'
			},
			body: Buffer.concat([
				...wantLines.map(Buffer.from),
				Buffer.from('00000009done\n')
			])
		});

		if (response.ok) {
			const blob = await response.blob();

			return Buffer.from(await blob.arrayBuffer());
			// return (write: (chunk: Uint8Array) => void) => {
			// 	if (response.body) {
			// 		response.body.pipeTo(new WritableStream({ write }));
			// 	}
			// };
		}
	} catch (error) {
		console.error(error);
	}
};

class WantLine {
	#capabilities = '';

	constructor(private hash: string) {}

	get #wantStr() {
		return this.#capabilities
			? `want ${this.hash} ${this.#capabilities}\n`
			: `want ${this.hash}\n`;
	}

	get #length() {
		const length = this.#wantStr.length + 4;

		return length.toString(16).padStart(4, '0');
	}

	addCapabilities(str: string) {
		this.#capabilities = str;
	}

	toString() {
		return `${this.#length}${this.#wantStr}`;
	}

	toBuffer() {
		return Buffer.from(this.toString());
	}
}

class PackFile {
	VERSION: number;
	numOfObjects: number;

	constructor(private raw: Buffer) {
		const version = this.raw.toString('hex', 12, 16);
		const length = this.raw.toString('hex', 16, 20);

		this.VERSION = parseInt(version, 16);
		this.numOfObjects = parseInt(length, 16);
	}

	get objects() {
		const objs: {
			type: PackFileObjectTypeEnum;
			size: number;
			reference?: string;
			data: Buffer;
		}[] = [];

		let offset = 20;
		for (let i = 0; i < this.numOfObjects; i++) {
			let reference = '';
			const curByte = this.raw[offset];
			let size = curByte & 0x0f;
			const type: PackFileObjectTypeEnum = (curByte >> 4) & 0x07;
			for (
				let shift = 4, nextByte = curByte;
				nextByte & 0x80;
				shift += 7
			) {
				nextByte = this.raw[++offset];
				size |= (nextByte & 0x7f) << shift;
			}
			// move to next
			offset++;

			// there are 20 extra bytes represent the object name for the REF_DELTA object
			if (type === PackFileObjectTypeEnum.REF_DELTA) {
				reference = this.raw.toString('hex', offset, offset + 20);
				offset += 20;
			}

			const { buffer: decompressedData, engine } = zlib.inflateSync(
				this.raw.subarray(offset),
				{ info: true }
			) as Buffer & { engine: zlib.Inflate };
			offset += engine.bytesWritten;

			objs.push({
				type,
				size,
				reference,
				data: Buffer.from(decompressedData)
			});
		}

		return objs;
	}
}

class RefDelta {
	#offset = 0;

	#sourceBuffer: Buffer;
	#sourceSize = 0;

	#targetBuffer: Buffer;
	#targetSize = 0;

	#deltaBuffer: Buffer;
	#deltaSize = 0;

	constructor(deltaBuffer: Buffer, sourceBuffer: Buffer) {
		this.#deltaBuffer = deltaBuffer;
		this.#deltaSize = deltaBuffer.length;

		this.#sourceBuffer = sourceBuffer;
		this.#sourceSize = this.#calculateSize();

		this.#targetBuffer = Buffer.alloc(0);
		this.#targetSize = this.#calculateSize();

		while (this.#targetBuffer.length < this.#targetSize) {
			if (this.#curByte & 0x80) {
				this.#COPY(); // MSB = 1 indicates copy command
			} else {
				this.#ADD(); // MSB = 0 indicates add command
			}
		}
	}

	get buffer() {
		return this.#targetBuffer;
	}

	get size() {
		return this.#targetSize;
	}

	get #curByte() {
		return this.#deltaBuffer[this.#offset];
	}

	#COPY() {
		const curByte = this.#deltaBuffer[this.#offset];
		const offset = this.#deltaEncoding(curByte, [0x01, 0x02, 0x04, 0x08]);
		const size = this.#deltaEncoding(curByte, [0x10, 0x20, 0x40]);
		this.#writeToTarget(offset, size);
		this.#offset++;
	}

	#ADD() {
		const size = this.#deltaBuffer[this.#offset++];
		this.#writeToTarget(this.#offset, size, this.#deltaBuffer);
		this.#offset += size;
	}

	#calculateSize() {
		let size = this.#curByte & 0x7f;
		for (
			let shift = 7, nextByte = this.#curByte;
			nextByte & 0x80;
			shift += 7
		) {
			nextByte = this.#deltaBuffer[++this.#offset];
			size |= (nextByte & 0x7f) << shift;
		}
		this.#offset++;

		return size;
	}

	/**
	 *
	 * @param curByte
	 * @param mask
	 * @returns
	 * @see https://stefan.saasen.me/articles/git-clone-in-haskell-from-the-bottom-up/#format-of-the-delta-representation
	 */
	#deltaEncoding(curByte: number, mask: number[]) {
		let value = 0;
		mask.forEach((seed, index) => {
			if ((curByte & seed) !== 0) {
				value |= this.#deltaBuffer[++this.#offset] << (index * 8);
			}
		});

		return value;
	}

	#writeToTarget(
		offset: number,
		size: number,
		readFrom = this.#sourceBuffer
	) {
		this.#targetBuffer = Buffer.concat([
			this.#targetBuffer,
			readFrom.subarray(offset, offset + size)
		]);
	}
}

export async function Clone() {
	const [_, gitUrl, directory = '.'] = args;

	// request the refs info from remote
	const refs = await fetchRefs(gitUrl);
	if (!refs) return;

	const { data, HEAD } = refs;
	// git init & save HEAD
	fs.mkdirSync(path.resolve(directory, '.git'), { recursive: true });
	fs.mkdirSync(path.resolve(directory, '.git/objects'), { recursive: true });
	fs.mkdirSync(path.resolve(directory, '.git/refs'), { recursive: true });
	fs.writeFileSync(path.resolve(directory, '.git/HEAD'), `ref: ${HEAD}`);

	// request pack files from remote
	const buffer = await fetchPackFiles(
		gitUrl,
		data.map(({ hash }) => {
			const wantLine = new WantLine(hash);
			// if (index === 0) wantLine.addCapabilities(capabilities);

			return wantLine.toString();
		})
	);
	if (!buffer) return;

	const packFile = new PackFile(buffer);
	for (const { type, reference, data } of packFile.objects) {
		switch (type) {
			case PackFileObjectTypeEnum.COMMIT: {
				const { compressed, hash } = createRawObject(
					Buffer.from(`${GitObjectTypeEnum.COMMIT} ${data.length}\0`),
					data
				);

				writeGitObjects(compressed, hash, directory);
				break;
			}
			case PackFileObjectTypeEnum.TREE: {
				const { compressed, hash } = createRawObject(
					Buffer.from(`${GitObjectTypeEnum.TREE} ${data.length}\0`),
					data
				);

				writeGitObjects(compressed, hash, directory);
				break;
			}
			case PackFileObjectTypeEnum.BLOB: {
				const { compressed, hash } = createRawObject(
					Buffer.from(`${GitObjectTypeEnum.BLOB} ${data.length}\0`),
					data
				);

				writeGitObjects(compressed, hash, directory);
				break;
			}
			case PackFileObjectTypeEnum.TAG:
				// TODO
				break;
			case PackFileObjectTypeEnum.OFS_DELTA:
				// TODO
				break;
			case PackFileObjectTypeEnum.REF_DELTA: {
				const { type, buffer: sourceBuffer } = readGitObjects(
					reference!,
					directory
				);
				const { buffer } = new RefDelta(data, sourceBuffer);
				const { compressed, hash } = createRawObject(
					Buffer.from(`${type} ${buffer.length}\0`),
					buffer
				);

				writeGitObjects(compressed, hash, directory);
				break;
			}
		}
	}

	const { hash: headHash } = data.find(({ ref }) => ref === HEAD)!;
	// the HEAD hash indicates a commit tree
	const { commitInfo } = readGitCommitObjects(headHash, directory);
	const iterate = (hash: string, entry: string) => {
		if (!fs.existsSync(entry)) fs.mkdirSync(entry);

		const { entries } = readGitTreeObjects(hash, directory);
		for (const { mode, hash, name } of entries) {
			const filePath = path.resolve(entry, name);
			switch (mode) {
				case UnixFileModeEnum.REGULAR_FILE:
				case UnixFileModeEnum.EXECUTABLE_FILE:
				case UnixFileModeEnum.SYMBOLIC_LINK:
					const { buffer } = readGitObjects(hash, directory);
					fs.writeFileSync(filePath, buffer, { encoding: 'utf-8' });
					fs.chmodSync(filePath, parseInt(`${mode}`, 8));
					break;
				case UnixFileModeEnum.DIR:
					iterate(hash, filePath);
					break;
			}
		}
	};

	iterate(commitInfo.tree, directory);
}
