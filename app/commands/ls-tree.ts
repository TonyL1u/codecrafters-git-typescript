import { readGitTreeObjects, print } from '../shared';
import { UnixFileModeEnum, GitObjectTypeEnum } from '../types';

const args = process.argv.slice(2);

export function LsTree() {
	const [_, flag, hash] = args;
	const { entries } = readGitTreeObjects(hash);

	for (const { name, mode, hash } of entries) {
		if (flag === '--name-only') {
			print(`${name}\n`);
		} else {
			const objectType =
				mode === UnixFileModeEnum.DIR
					? GitObjectTypeEnum.TREE
					: GitObjectTypeEnum.BLOB;

			print(`${mode} ${objectType} ${hash} ${name}\n`);
		}
	}
}
