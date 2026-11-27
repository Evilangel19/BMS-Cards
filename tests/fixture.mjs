// The BMS files of the tests (tests/fixtures, gitignored): a check whose file is missing is skipped with a note, never stopped with an error.
import fs from 'node:fs';

export const has = rel => fs.existsSync(new URL('./fixtures/' + rel, import.meta.url));
export const skip = (rel, what) => {
  console.log('skip ', what, '(needs tests/fixtures/' + rel + ', a BMS file, not in the repository)');
  return false;
};
