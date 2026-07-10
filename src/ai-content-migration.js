import { isEncryptedContent } from './content-security.js';

const LOCK_ID = 4_165_739_201;

export async function migrateAiContent(executor, cipher, { apply = false } = {}) {
  const queries = {
    conversations: 'SELECT id,title FROM atlas_ai_conversation ORDER BY id',
    messages: 'SELECT id,content FROM atlas_ai_message ORDER BY id',
    runs: 'SELECT id,prompt,answer FROM atlas_ai_run ORDER BY id'
  };
  await executor.query('BEGIN');
  try {
    await executor.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await executor.query('LOCK TABLE atlas_ai_conversation, atlas_ai_message, atlas_ai_run IN ACCESS EXCLUSIVE MODE');
    const conversations = (await executor.query(queries.conversations)).rows;
    const messages = (await executor.query(queries.messages)).rows;
    const runs = (await executor.query(queries.runs)).rows;
    const pending = {
      conversations: conversations.filter((row) => !isEncryptedContent(row.title)),
      messages: messages.filter((row) => !isEncryptedContent(row.content)),
      runPrompts: runs.filter((row) => !isEncryptedContent(row.prompt)),
      runAnswers: runs.filter((row) => row.answer !== null && !isEncryptedContent(row.answer))
    };
    const counts = Object.fromEntries(Object.entries(pending).map(([name, rows]) => [name, rows.length]));
    if (!apply) { await executor.query('ROLLBACK'); return { applied: false, counts }; }

    await executor.query('ALTER TABLE atlas_ai_message DISABLE TRIGGER atlas_ai_message_no_update');
    await executor.query('ALTER TABLE atlas_ai_run DISABLE TRIGGER atlas_ai_run_no_update');
    for (const row of pending.conversations) await executor.query('UPDATE atlas_ai_conversation SET title=$1 WHERE id=$2 AND title=$3', [cipher.encrypt(row.title, `conversation:${row.id}:title`), row.id, row.title]);
    for (const row of pending.messages) await executor.query('UPDATE atlas_ai_message SET content=$1 WHERE id=$2 AND content=$3', [cipher.encrypt(row.content, `message:${row.id}:content`), row.id, row.content]);
    for (const row of pending.runPrompts) await executor.query('UPDATE atlas_ai_run SET prompt=$1 WHERE id=$2 AND prompt=$3', [cipher.encrypt(row.prompt, `run:${row.id}:prompt`), row.id, row.prompt]);
    for (const row of pending.runAnswers) await executor.query('UPDATE atlas_ai_run SET answer=$1 WHERE id=$2 AND answer=$3', [cipher.encrypt(row.answer, `run:${row.id}:answer`), row.id, row.answer]);
    await executor.query('ALTER TABLE atlas_ai_run ENABLE TRIGGER atlas_ai_run_no_update');
    await executor.query('ALTER TABLE atlas_ai_message ENABLE TRIGGER atlas_ai_message_no_update');
    await executor.query('COMMIT');
    return { applied: true, counts };
  } catch (error) {
    await executor.query('ROLLBACK');
    throw error;
  }
}
