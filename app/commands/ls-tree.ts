import { readGitObjects, print } from '../shared';
import { UnixFileMode, GitObjectType } from '../types';

const args = process.argv.slice(2);

export function LsTree() {
	const [_, flag, hash] = args;
	const buf = readGitObjects(hash);
	let offset = 0;
	while (offset < buf.length) {
		// 1. search mode type --> 0x20
		const modeStart = offset;
		const modeEnd = buf.indexOf(0x20, modeStart);
		const mode = buf.toString('utf-8', modeStart, modeEnd);

		// 2. search file/dir name --> 0x00
		const nameStart = modeEnd + 1;
		const nameEnd = buf.indexOf(0x00, modeEnd);
		const name = buf.toString('utf-8', nameStart, nameEnd);

		// 3. search SHA-1 hash (20 bytes)
		const hashStart = nameEnd + 1;
		const hashEnd = hashStart + 20;
		const hash = buf.toString('hex', hashStart, hashEnd);

		if (mode === 'tree') {
			offset = hashStart;
			continue;
		}

		if (flag === '--name-only') {
			print(`${name}\n`);
		} else {
			const objectType =
				+mode === UnixFileMode.DIR
					? GitObjectType.TREE
					: GitObjectType.BLOB;
			print(`${mode} ${objectType} ${hash} ${name}\n`);
		}

		offset = hashEnd;
	}
}
