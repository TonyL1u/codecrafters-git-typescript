import { readGitObjects, print } from '../shared';

const args = process.argv.slice(2);

export function CatFile() {
	const [_, __, hash] = args;
	const { buffer } = readGitObjects(hash);
	print(buffer.toString());
}
