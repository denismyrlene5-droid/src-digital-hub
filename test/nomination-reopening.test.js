const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { createNominationRepository } = require("../server/nominations");

test("PDF-scoped reopening preserves records, restricts categories and expires at 24 hours", () => {
  const db = new DatabaseSync(":memory:");
  let now = new Date("2026-09-16T12:00:00Z");
  try {
    const repo = createNominationRepository(db, { clock: () => now });
    db.prepare("UPDATE nomination_phases SET status='closed',closes_at=?").run("2026-09-12T01:00:00.000Z");
    const original = repo.categories();
    const preview = repo.reopeningPreview();
    assert.equal(preview.eligible.length, 18);
    assert.equal(preview.active, null);
    assert.equal(repo.publicData().phase.accepting, false);
    const category = preview.eligible[0];
    const excluded = original.find(item => item.name === "Level 300 Best Course Rep of the Year");
    assert.throws(() => repo.startReopening({ categoryIds: [category.id] }), /confirmation/);
    assert.throws(() => repo.startReopening({ categoryIds: [excluded.id], confirm: true }), /fewer than four/);
    repo.startReopening({ categoryIds: [category.id], confirm: true }, { role: "super_admin" });
    assert.throws(() => repo.startReopening({ categoryIds: [category.id], confirm: true }), /already active/);
    assert.equal(repo.effectivePhase().status, "closed");
    assert.equal(repo.effectivePhase().closes_at, "2026-09-12T01:00:00.000Z");
    assert.equal(repo.publicData().phase.closesAt, "2026-09-17T12:00:00.000Z");
    assert.deepEqual(repo.publicData().groups.flatMap(group => group.categories.map(item => item.id)), [category.id]);
    const input = { categoryId: category.id, nomineeName: "Example Candidate", nomineeLevel: "300", nomineeProgramme: "Education", nominatorName: "Example Student", nominatorStudentId: "STUDENT123", nominatorPhone: "0241234567", nominatorClass: "Education 300", rulesAccepted: true, idempotencyKey: "reopening_test_123456" };
    assert.throws(() => repo.submit({ ...input, categoryId: excluded.id }), /not been reopened/);
    assert.equal(repo.submit(input).ok, true);
    assert.throws(() => repo.submit({ ...input, idempotencyKey: "reopening_test_654321" }), /already nominated/);
    now = new Date("2026-09-17T12:00:00Z");
    assert.equal(repo.publicData().phase.accepting, false);
    assert.throws(() => repo.submit(input), /closed/);
    assert.equal(db.prepare("SELECT COUNT(*) total FROM nomination_submissions").get().total, 1);
    assert.deepEqual(repo.categories().map(({ locked: _locked, ...item }) => item), original.map(({ locked: _locked, ...item }) => item));
    assert.ok(repo.auditHistory().some(item => item.action === "categories_reopened"));
  } finally { db.close(); }
});

test("reopening can be stopped and cannot bypass archived or paused phases", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const repo = createNominationRepository(db);
    const id = repo.reopeningPreview().eligible[0].id;
    assert.throws(() => repo.startReopening({ categoryIds: [id], confirm: true }), /closed nomination/);
    db.exec("UPDATE nomination_phases SET status='closed'");
    repo.startReopening({ categoryIds: [id], confirm: true });
    db.exec("UPDATE nomination_phases SET status='archived'");
    assert.equal(repo.publicData().phase.accepting, false);
    db.exec("UPDATE nomination_phases SET status='closed'");
    repo.stopReopening();
    assert.equal(repo.publicData().phase.accepting, false);
  } finally { db.close(); }
});
