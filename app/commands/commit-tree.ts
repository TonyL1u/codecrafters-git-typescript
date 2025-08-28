import { createCommitObject } from '../create';
import { writeGitObjects, print } from '../shared';

const args = process.argv.slice(2);
const FAKE_USER = {
	name: 'your_nickname',
	email: 'your_email@some.com'
};

const getCommitTime = () => {
	const date = new Date(0);
	const timestamp = Math.floor(date.getTime() / 1000);
	const offset = date.getTimezoneOffset();
	const offsetHours = Math.floor(Math.abs(offset) / 60);
	const offsetMinutes = Math.abs(offset) % 60;
	const sign = offset > 0 ? '-' : '+';

	const offsetFormatted = `${sign}${String(offsetHours).padStart(
		2,
		'0'
	)}${String(offsetMinutes).padStart(2, '0')}`;

	return `${timestamp} ${offsetFormatted}`;
};

export function CommitTree() {
	const [_, treeHash, __, commitHash, ___, commitMsg] = args;
	const { compressed, hash } = createCommitObject({
		tree: treeHash,
		parent: commitHash,
		author: FAKE_USER,
		committer: FAKE_USER,
		time: getCommitTime(),
		message: commitMsg
	});
	// write compressed content to .git/objects
	writeGitObjects(compressed, hash);
	print(hash);
}
