import * as fs from 'node:fs';
import * as path from 'node:path';

import { createBlobObject, createTreeObject } from '../create';
import { writeGitObjects, print } from '../shared';
import { UnixFileModeEnum, type TreeObjectEntry } from '../types';

const traverseDirs = (
	entry: string,
	cb?: (entry: string, isDirectory: boolean) => void
) => {
	const dirs = fs.readdirSync(entry);

	for (const dir of dirs) {
		const fullPath = path.join(entry, dir);
		const stat = fs.statSync(fullPath);
		const isDirectory = stat.isDirectory();
		cb?.(fullPath, isDirectory);
	}
};

export function WriteTree() {
	const iterate = (entry = '.') => {
		const entries: TreeObjectEntry[] = [];

		traverseDirs(entry, (file, isDirectory) => {
			if (isDirectory && file.startsWith('.git')) return;

			if (isDirectory) {
				const { hash } = iterate(file);
				entries.push({
					mode: UnixFileModeEnum.DIR,
					name: path.basename(file),
					hash
				});
			} else {
				const { compressed, hash } = createBlobObject(file);
				// write compressed content to .git/objects
				writeGitObjects(compressed, hash);
				entries.push({
					mode: UnixFileModeEnum.REGULAR_FILE,
					name: path.basename(file),
					hash
				});
			}
		});
		// sort the entries alphabetically
		const sortedEntries = entries.toSorted((a, b) =>
			a.name.localeCompare(b.name)
		);
		const { compressed, hash } = createTreeObject(sortedEntries);
		// write compressed content to .git/objects
		writeGitObjects(compressed, hash);

		return { hash };
	};

	const { hash } = iterate();
	print(hash);
}
