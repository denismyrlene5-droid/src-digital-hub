const express = require("express");

function createCampusPulseRouter({ repository, requirePulseAdmin, submissionLimit, audit = () => {} }) {
  const router = express.Router();
  const handle = fn => (req, res, next) => { try { const result = fn(req, res); if (result?.catch) result.catch(next); } catch (error) { next(error); } };
  const log = (req, action, type, id, summary) => audit(req.admin, action, type, id, summary);

  router.get("/", handle((req, res) => res.json({ pulse: repository.publicPulse() })));
  router.post("/entries", submissionLimit, express.json({ limit: "20kb" }), handle((req, res) => res.status(201).json(repository.submitEntry(req.body))));

  router.use("/admin", requirePulseAdmin);
  router.use("/admin", express.json({ limit: "80kb" }));
  router.get("/admin/dashboard", handle((req, res) => res.json(repository.dashboard())));
  router.get("/admin/settings", handle((req, res) => res.json({ settings: repository.settings() })));
  router.put("/admin/settings", handle((req, res) => { const settings = repository.updateSettings(req.body, req.admin); log(req, "campus_pulse.settings_updated", "campus_pulse_settings", 1, "Campus Pulse homepage and rules settings updated"); res.json({ settings }); }));
  router.get("/admin/questions", handle((req, res) => res.json({ questions: repository.listQuestions() })));
  router.get("/admin/questions/:id", handle((req, res) => { const question = repository.getQuestion(req.params.id); if (!question) return res.status(404).json({ ok: false, message: "Question not found." }); res.json({ question, draws: repository.draws(question.id) }); }));
  router.post("/admin/questions", handle((req, res) => { const question = repository.createQuestion(req.body, req.admin); log(req, "campus_pulse.question_created", "campus_pulse_question", question.id, `${question.status} question created`); res.status(201).json({ question }); }));
  router.put("/admin/questions/:id", handle((req, res) => { const question = repository.updateQuestion(req.params.id, req.body, req.admin); log(req, "campus_pulse.question_updated", "campus_pulse_question", question.id, `${question.status} question updated`); res.json({ question }); }));
  router.post("/admin/questions/:id/archive", handle((req, res) => { const question = repository.archiveQuestion(req.params.id, req.admin); log(req, "campus_pulse.question_archived", "campus_pulse_question", question.id, "Question archived; entries retained"); res.json({ question }); }));
  router.post("/admin/questions/:id/duplicate", handle((req, res) => { const question = repository.duplicateQuestion(req.params.id, req.admin); log(req, "campus_pulse.question_duplicated", "campus_pulse_question", question.id, "Question duplicated as draft"); res.status(201).json({ question }); }));
  router.post("/admin/questions/:id/reopen", handle((req, res) => { const question = repository.reopenQuestion(req.params.id, req.admin); log(req, "campus_pulse.question_reopened", "campus_pulse_question", question.id, "Question reopened as draft"); res.json({ question }); }));
  router.get("/admin/questions/:id/entries", handle((req, res) => res.json(repository.listEntries(req.params.id, req.query))));
  router.get("/admin/questions/:id/export.csv", handle((req, res) => { const csv = repository.exportCsv(req.params.id); log(req, "campus_pulse.entries_exported", "campus_pulse_question", req.params.id, "Private Campus Pulse entries exported"); res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="campus-pulse-question-${Number(req.params.id)}.csv"`); res.send(`\uFEFF${csv}`); }));
  router.put("/admin/entries/:id/status", handle((req, res) => { const entry = repository.updateEntryStatus(req.params.id, req.body, req.admin); log(req, "campus_pulse.entry_status_updated", "campus_pulse_entry", entry.id, `Entry status updated to ${entry.status}`); res.json({ entry }); }));
  router.post("/admin/questions/:id/draw", handle((req, res) => { const draw = repository.drawWinner(req.params.id, req.body || {}, req.admin); log(req, "campus_pulse.winner_selected", "campus_pulse_draw", draw.id, `Winner selected from ${draw.eligibleCount} eligible entries`); res.status(201).json({ draw }); }));
  router.put("/admin/draws/:id", handle((req, res) => { const draw = repository.updateDraw(req.params.id, req.body, req.admin); log(req, "campus_pulse.winner_updated", "campus_pulse_draw", draw.id, `Winner prize status updated to ${draw.prizeStatus}`); res.json({ draw }); }));
  router.get("/admin/audit", handle((req, res) => res.json({ audit: repository.auditHistory(req.query.limit) })));
  return router;
}

module.exports = { createCampusPulseRouter };
