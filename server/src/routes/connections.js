/**
 * Extensions / "app connections".
 *
 * Design stance: an AI has no real-world agency. Actions in the world require a
 * credential holder, and whoever holds the credential owns the outcome. So:
 *   - nothing is connected by default;
 *   - a connection is a named grant with an explicit scope list;
 *   - every invoked action is written to the audit log, with the outcome;
 *   - every grant here is `simulated` — it records what *would* have been called.
 *     There is no network egress in this module, on purpose. Flipping `mode` to live
 *     requires an operator-supplied implementation, at which point accountability
 *     transfers to the operator, and the UI says so.
 */
import express from 'express';
import { db, id, nowIso, persist, audit } from '../store.js';

const router = express.Router();

export const CATALOG = [
  {
    id: 'email',
    name: 'Email',
    category: 'communication',
    blurb: 'Draft and (if granted) send mail from your own mailbox.',
    scopes: [
      { id: 'draft', label: 'Create drafts', risk: 'low' },
      { id: 'send', label: 'Send email', risk: 'high' },
      { id: 'read', label: 'Read the inbox', risk: 'high' },
    ],
    actions: ['create_draft', 'send_email', 'list_unread'],
    sideEffects: 'Outbound mail is irreversible once sent. Reply-all incidents start here.',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    category: 'scheduling',
    blurb: 'Read availability and hold or book time slots.',
    scopes: [
      { id: 'read', label: 'Read events', risk: 'medium' },
      { id: 'write', label: 'Create events', risk: 'medium' },
      { id: 'invite', label: 'Invite other people', risk: 'high' },
    ],
    actions: ['find_slots', 'create_event', 'cancel_event'],
    sideEffects: 'Invites are visible to attendees immediately and cancellations notify them.',
  },
  {
    id: 'payments',
    name: 'Payments',
    category: 'money',
    blurb: 'Create payment intents and issue refunds.',
    scopes: [
      { id: 'read', label: 'Read balances', risk: 'medium' },
      { id: 'charge', label: 'Charge a card', risk: 'critical' },
      { id: 'refund', label: 'Issue refunds', risk: 'critical' },
    ],
    actions: ['create_charge', 'issue_refund', 'balance'],
    sideEffects: 'Money moves. Reversal is possible but not instant, and not always complete.',
    requiresApproval: true,
  },
  {
    id: 'files',
    name: 'Cloud files',
    category: 'storage',
    blurb: 'Read, write and share documents in a drive.',
    scopes: [
      { id: 'read', label: 'Read files', risk: 'medium' },
      { id: 'write', label: 'Write files', risk: 'medium' },
      { id: 'share', label: 'Change sharing', risk: 'critical' },
    ],
    actions: ['read_file', 'write_file', 'list_files'],
    sideEffects: 'Sharing changes are the most common cause of data exposure, and the hardest to undo.',
  },
  {
    id: 'device',
    name: 'Smart home',
    category: 'physical',
    blurb: 'Control lights, locks and thermostats.',
    scopes: [
      { id: 'read', label: 'Read state', risk: 'low' },
      { id: 'control', label: 'Change state', risk: 'medium' },
      { id: 'lock', label: 'Operate locks', risk: 'critical' },
    ],
    actions: ['get_state', 'set_state'],
    sideEffects: 'Physical effects. A wrong command can unlock a door — no undo.',
    requiresApproval: true,
  },
];

const RISK_ORDER = { low: 1, medium: 2, high: 3, critical: 4 };

router.get('/', (_req, res) => {
  res.json({
    catalog: CATALOG,
    connections: db.connections.map((c) => ({
      ...c,
      catalog: CATALOG.find((x) => x.id === c.catalogId),
      invocations: db.audit.filter((a) => a.action === 'connection.invoke' && a.connectionId === c.id).length,
    })),
    policy: {
      defaultMode: 'simulated',
      note: 'Every grant in this build is simulated: the call is validated, policy-checked and audit-logged, then reported as "would have called X" with no network egress. Live execution requires an operator-supplied credential holder, and with it, the operator owns the consequences.',
      requiresHumanApproval: ['payments', 'device'],
      neverAutoConnect: true,
    },
  });
});

router.post('/', (req, res) => {
  const { catalogId, scopes = [], label } = req.body || {};
  const entry = CATALOG.find((c) => c.id === catalogId);
  if (!entry) return res.status(404).json({ error: 'unknown_connector', detail: `Known connectors: ${CATALOG.map((c) => c.id).join(', ')}` });
  const granted = entry.scopes.filter((s) => scopes.includes(s.id) || scopes.includes(s.label));
  if (!granted.length) return res.status(400).json({ error: 'no_scopes', detail: 'A connection with no scopes can do nothing — choose at least one, or decline the connection.' });

  const connection = {
    id: id('conn'),
    catalogId,
    label: label || entry.name,
    scopes: granted.map((s) => ({ id: s.id, label: s.label, risk: s.risk })),
    maxRisk: granted.reduce((max, s) => (RISK_ORDER[s.risk] > RISK_ORDER[max] ? s.risk : max), 'low'),
    mode: 'simulated',
    createdAt: nowIso(),
    invokedAt: null,
  };
  db.connections.push(connection);
  persist();
  audit({
    action: 'connection.grant',
    connectionId: connection.id,
    connector: catalogId,
    scopes: granted.map((s) => s.id),
    mode: 'simulated',
  });
  res.status(201).json({
    connection,
    custodyNote: `Granted ${granted.length} scope(s) on ${entry.name} in simulated mode. The agent can now *propose* these actions; nothing leaves this process. ${entry.requiresApproval ? `${entry.name} actions always require a human approval step.` : ''}`,
  });
});

router.delete('/:id', (req, res) => {
  const before = db.connections.length;
  db.connections = db.connections.filter((c) => c.id !== req.params.id);
  persist();
  audit({ action: 'connection.revoke', connectionId: req.params.id });
  res.json({ revoked: before - db.connections.length });
});

router.post('/:id/invoke', (req, res) => {
  const { action, args = {}, approvedBy } = req.body || {};
  const connection = db.connections.find((c) => c.id === req.params.id);
  if (!connection) return res.status(404).json({ error: 'not_found' });
  const entry = CATALOG.find((c) => c.id === connection.catalogId);
  if (!entry.actions.includes(action)) {
    return res.status(400).json({ error: 'unsupported_action', detail: `${connection.catalogId} supports: ${entry.actions.join(', ')}` });
  }
  if (entry.requiresApproval && !approvedBy) {
    const record = audit({ action: 'connection.invoke', connectionId: connection.id, connector: entry.id, requested: action, outcome: 'blocked_pending_approval' });
    return res.status(202).json({
      outcome: 'blocked_pending_approval',
      detail: `${entry.name} actions are irreversible enough to require a named human approver. Re-send with an approvedBy field, and the audit log will attribute the decision to that person.`,
      auditId: record.id,
    });
  }

  const simulated = {
    connector: entry.id,
    action,
    args,
    mode: 'simulated',
    at: nowIso(),
    wouldCall: `${entry.id}.${action}(${JSON.stringify(args)})`,
    sideEffects: entry.sideEffects,
  };
  const record = audit({
    action: 'connection.invoke',
    connectionId: connection.id,
    connector: entry.id,
    requested: action,
    approvedBy: approvedBy || null,
    outcome: 'simulated_ok',
    detail: simulated.wouldCall,
  });
  db.connections = db.connections.map((c) => (c.id === connection.id ? { ...c, invokedAt: simulated.at } : c));
  persist();

  res.json({
    ...simulated,
    auditId: record.id,
    verdict: `${entry.name}.${action} was validated and policy-checked, then recorded as a simulation — no network call was made. ${entry.sideEffects}${approvedBy ? ` Approved by ${approvedBy}.` : ''}`,
  });
});

export default router;
