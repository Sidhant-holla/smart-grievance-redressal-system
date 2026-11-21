// Writes docs/DATA_DICTIONARY.md from the live PostgreSQL catalog, so the
// dictionary always matches the real database.  Usage: npm run docs:dictionary

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

// what each table is for (the catalog cannot tell us this)
const TABLE_NOTES = {
  departments: 'University departments that handle complaints. sla_hours sets the deadline for their tickets.',
  users: 'Everyone who can log in: citizens, staff, department heads and admins.',
  staff: 'Specialisation of users. Only staff and heads have a row here, which gives them a department.',
  ticket_statuses: 'Lookup table of the 7 ticket states.',
  status_transitions: 'The allowed status moves. The state machine trigger checks every change against this table.',
  tickets: 'The core table. One row per complaint, holding its current state.',
  ticket_embeddings: 'Vector store. One 384-dimension embedding per ticket, used for similarity search.',
  ticket_status_history: 'Full timeline of every ticket. Written only by a trigger.',
  ticket_supporters: 'M:N between users and tickets: citizens who said "I have the same problem".',
  ticket_comments: 'Comments on a ticket. Internal notes are hidden from citizens.',
  notifications: 'In-app notifications created by triggers.',
};

// columns whose purpose is not obvious from the name
const COLUMN_NOTES = {
  'departments.sla_hours': 'Hours before an unresolved ticket escalates',
  'departments.head_id': 'Added with ALTER TABLE because of the circular reference with staff. Trigger: must be a dept_head of this department',
  'users.email': 'Login id. Unique ignoring case (unique index on lower(email))',
  'users.password_hash': 'bcrypt hash only. A plain password is rejected',
  'users.is_active': 'Deactivated users cannot log in',
  'staff.staff_id': 'Same value as users.user_id. Trigger: user must be staff or dept_head',
  'staff.is_available': 'Auto-assignment skips unavailable staff',
  'ticket_statuses.is_open': 'TRUE means the ticket still needs work',
  'tickets.priority': 'HIGH gets half of the department SLA',
  'tickets.status': 'Every change is validated by the ticket_before_update trigger',
  'tickets.dept_id': 'Trigger: cannot be changed after submission',
  'tickets.assigned_to': 'Trigger: must work in the same department as the ticket',
  'tickets.possible_duplicate_of': 'Set when an open ticket with similarity of 0.60 or more exists',
  'tickets.escalation_count': 'Incremented by trigger on each escalation',
  'tickets.rating': 'Citizen feedback, only allowed on a CLOSED ticket',
  'tickets.due_at': 'SLA deadline, set by trigger',
  'tickets.updated_by': 'Who made the last change. NULL means the system',
  'tickets.search_vector': 'Generated from title and description, used for full-text search',
  'ticket_embeddings.embedding': 'Sentence embedding of "title. description"',
  'ticket_embeddings.model_name': 'Stored so vectors from different models are never compared',
  'ticket_status_history.old_status': 'NULL on the first row of a ticket',
  'ticket_status_history.changed_by': 'NULL means the system',
  'ticket_comments.is_internal': 'TRUE hides the comment from citizens',
};

// pg_attribute, pg_constraint and pg_indexes are PostgreSQL's own catalog tables.
// They describe every column, key and index in the database.
async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const tables = await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  // a sensible reading order: the ones we describe first, in the order above
  const order = Object.keys(TABLE_NOTES).filter((t) => tables.rows.some((r) => r.table_name === t));

  const out = [
    '# Data dictionary',
    '',
    'Generated from the live PostgreSQL catalog by `npm run docs:dictionary` (`scripts/generate-data-dictionary.js`).',
    '',
    'Key: **PK** primary key, **FK** foreign key, **UQ** unique, **NN** not null.',
    '',
  ];

  for (const table of order) {
    const columns = await db.query(
      `SELECT a.attname AS name,
              format_type(a.atttypid, a.atttypmod) AS type,
              a.attnotnull AS not_null,
              a.attgenerated <> '' AS generated,
              pg_get_expr(d.adbin, d.adrelid) AS def
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [table]
    );
    const constraints = await db.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) AS def, conkey,
              confrelid::regclass::text AS ref_table
         FROM pg_constraint
        WHERE conrelid = $1::regclass
        ORDER BY contype, conname`,
      [table]
    );
    const attnums = await db.query(
      `SELECT attnum, attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0`,
      [table]
    );
    const nameOf = (n) => attnums.rows.find((r) => r.attnum === n)?.attname;

    const keys = {};
    const add = (col, text) => (keys[col] ||= []).push(text);
    for (const c of constraints.rows) {
      if (c.contype === 'p') c.conkey.forEach((n) => add(nameOf(n), 'PK'));
      if (c.contype === 'u') c.conkey.forEach((n) => add(nameOf(n), 'UQ'));
      if (c.contype === 'f') {
        const action = /ON DELETE (CASCADE|SET NULL|RESTRICT)/.exec(c.def)?.[1];
        c.conkey.forEach((n) => add(nameOf(n), `FK → ${c.ref_table}${action ? ` (${action})` : ''}`));
      }
    }

    out.push(`## ${table}`, '', TABLE_NOTES[table], '', '| Column | Type | Null | Default | Keys | Notes |', '|---|---|---|---|---|---|');
    for (const c of columns.rows) {
      const def = c.generated ? 'generated' : c.def?.startsWith('nextval') ? 'serial' : (c.def ?? '').replace(/::[\w ]+/g, '');
      const note = COLUMN_NOTES[`${table}.${c.name}`] ?? '';
      out.push(`| ${c.name} | ${c.type} | ${c.not_null ? 'NN' : ''} | ${def} | ${(keys[c.name] ?? []).join(', ')} | ${note} |`);
    }
    out.push('');

    const checks = constraints.rows.filter((c) => c.contype === 'c');
    if (checks.length) {
      out.push('CHECK constraints:', '');
      for (const c of checks) out.push(`- \`${c.conname}\`: \`${c.def.replace(/\|/g, '\\|')}\``);
      out.push('');
    }

    const indexes = await db.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = $1 AND indexname NOT IN
              (SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass)
        ORDER BY indexname`,
      [table]
    );
    if (indexes.rowCount) {
      out.push('Indexes:', '');
      for (const i of indexes.rows) out.push(`- \`${i.indexname}\`: \`${i.indexdef.replace(/^.* USING /, 'USING ').replace(/\|/g, '\\|')}\``);
      out.push('');
    }
  }

  const views = await db.query(`SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name LIKE 'v\\_%' ORDER BY 1`);
  const routines = await db.query(
    `SELECT p.proname, CASE p.prokind WHEN 'p' THEN 'Procedure' ELSE 'Function' END AS kind,
            pg_get_function_identity_arguments(p.oid) AS args
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
      WHERE n.nspname = 'public' AND d.objid IS NULL
      ORDER BY kind DESC, p.proname`
  );
  const triggers = await db.query(
    `SELECT t.tgname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal ORDER BY c.relname, t.tgname`
  );
  out.push('## Other database objects', '', '### Views', '', ...views.rows.map((v) => `- \`${v.table_name}\``), '');
  out.push('### Procedures and functions', '', '| Kind | Name | Arguments |', '|---|---|---|');
  for (const r of routines.rows) out.push(`| ${r.kind} | \`${r.proname}\` | ${r.args || '-'} |`);
  out.push('', '### Triggers', '', '| Trigger | Table |', '|---|---|');
  for (const t of triggers.rows) out.push(`| \`${t.tgname}\` | ${t.relname} |`);
  out.push('');

  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'DATA_DICTIONARY.md'), out.join('\n'));
  console.log(`Wrote docs/DATA_DICTIONARY.md (${order.length} tables, ${routines.rowCount} routines, ${triggers.rowCount} triggers)`);
  await db.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
