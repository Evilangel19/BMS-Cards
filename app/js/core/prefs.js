// @ts-check
// A settings file that survives a program closed in the middle of a write.
// The text is written to "<name>.new" first and read back; only then "<name>" is written. So there is always one complete copy: if the program stops while one is being
// written, the other is whole. On loading, the newest complete copy wins; a file that cannot be read is never overwritten by an empty start: a copy is kept as "<name>.bad".
// io: { read(name) -> text | null (missing or unreadable), write(name, text) }

/** @param {{read:(n:string)=>Promise<string|null>, write:(n:string,t:string)=>Promise<void>}} io */
export async function safeSave(io, name, text) {
  await io.write(name + '.new', text);
  if ((await io.read(name + '.new')) !== text) throw new Error('The file was not written whole.');
  await io.write(name, text);
}

const parse = t => {
  if (t == null) return { ok: false, v: null };
  try {
    const v = JSON.parse(t);
    return { ok: v !== null && typeof v == 'object', v };
  } catch (e) {
    return { ok: false, v: null };
  }
};

/**
 * @param {{read:(n:string)=>Promise<string|null>, write:(n:string,t:string)=>Promise<void>}} io
 * @returns {Promise<{value:any, issue:''|'repaired'|'damaged'}>} issue: 'repaired' = the main file was damaged but the copy was whole; 'damaged' = nothing readable, the bad file was kept as <name>.bad
 */
export async function safeLoad(io, name) {
  const fresh = parse(await io.read(name + '.new')),
    rawMain = await io.read(name),
    main = parse(rawMain);
  if (fresh.ok) return { value: fresh.v, issue: rawMain != null && !main.ok ? 'repaired' : '' };
  if (main.ok) return { value: main.v, issue: '' };
  if (rawMain != null && rawMain.trim() !== '') {
    try {
      await io.write(name + '.bad', rawMain);
    } catch (e) {
      /* read-only folder */
    }
    return { value: null, issue: 'damaged' };
  }
  return { value: null, issue: '' };
}
