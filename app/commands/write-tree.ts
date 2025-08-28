import * as fs from 'node:fs';
import * as path from 'node:path';

import { createBlobObject, createTreeObject } from '../create';
import { writeGitObjects, print } from '../shared';
import { UnixFileModeEnum, type TreeObjectEntry } from '../types';

export function WriteTree() {
	const iterate = (entry = '.') => {
		const entries: TreeObjectEntry[] = [];
		const dirs = fs.readdirSync(entry);
		for (const dir of dirs) {
			const fullPath = path.join(entry, dir);
			const stat = fs.statSync(fullPath);
			const isDirectory = stat.isDirectory();

			if (isDirectory && fullPath.startsWith('.git')) continue;

			if (isDirectory) {
				const { hash } = iterate(fullPath);
				entries.push({
					mode: UnixFileModeEnum.DIR,
					name: path.basename(fullPath),
					hash
				});
			} else {
				const { compressed, hash } = createBlobObject(fullPath);
				// write compressed content to .git/objects
				writeGitObjects(compressed, hash);
				entries.push({
					mode: UnixFileModeEnum.REGULAR_FILE,
					name: path.basename(fullPath),
					hash
				});
			}
		}
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
