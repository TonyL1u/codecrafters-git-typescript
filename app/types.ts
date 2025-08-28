export enum UnixFileModeEnum {
	REGULAR_FILE = 100644,
	EXECUTABLE_FILE = 100755,
	SYMBOLIC_LINK = 120000,
	DIR = 40000
}

export enum GitObjectTypeEnum {
	BLOB = 'blob',
	TREE = 'tree',
	COMMIT = 'commit'
}

export enum PackFileObjectTypeEnum {
	COMMIT = 1,
	TREE = 2,
	BLOB = 3,
	TAG = 4,
	OFS_DELTA = 6,
	REF_DELTA = 7
}

export interface TreeObjectEntry {
	mode: UnixFileModeEnum;
	name: string;
	hash: string;
}

export interface GitUser {
	name: string;
	email: string;
}

export interface CommitInfo {
	tree: string;
	parent: string;
	author: GitUser;
	committer: GitUser;
	time: string;
	message: string;
}
