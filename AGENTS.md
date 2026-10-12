# Repository hygiene

Before finishing changes, run `pnpm artifacts:clean` and then `pnpm artifacts:check`.
Repeat the check after builds/tests and before committing.

Never leave numbered copy files such as `queue.service 2.ts` in the repository.
The cleanup command removes only untracked copies whose contents match a tracked
original or one of its Git versions. Review other candidates manually; preserve
unique content. Do not hide these files with Git or TypeScript exclusions.

Do not modify external file-provider settings or move the repository without the
user's explicit authorization. A successful check describes the current state;
it cannot prevent an external process from creating new files later.
