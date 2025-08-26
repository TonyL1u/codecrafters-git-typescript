import { readGitObjects, print } from '../shared';

const args = process.argv.slice(2);

export function CatFile() {
	const [_, __, hash] = args;
	const buf = readGitObjects(hash);
	print(buf.toString('utf-8', buf.indexOf(0x00) + 1));
}
