// ─── i18n types ───────────────────────────────────────────────────────────────

export type Locale = "cs" | "en";
export const LOCALE_COOKIE = "weave_locale";
export const DEFAULT_LOCALE: Locale = "cs";
export const SUPPORTED_LOCALES: Locale[] = ["cs", "en"];

export interface Messages {
  // ── Nav ──────────────────────────────────────────────────────────────────
  "nav.overview": string;
  "nav.cases": string;
  "nav.scripts": string;
  "nav.plans": string;
  "nav.runs": string;
  "nav.requirements": string;
  "nav.jira": string;
  "nav.settings": string;
  "nav.tagline": string;
  "nav.langSwitcher.aria": string;

  // ── Demo banner ───────────────────────────────────────────────────────────
  "demo.noDb": string;
  "demo.noAuth": string;
  "demo.prefix": string;

  // ── Dashboard ─────────────────────────────────────────────────────────────
  "dashboard.title": string;
  "dashboard.description": string;
  "dashboard.description.full": string;
  "dashboard.empty.message": string;
  "dashboard.empty.cta": string;
  "dashboard.stat.cases": string;
  "dashboard.stat.coverage": string;
  "dashboard.stat.coverage.hint": string;
  "dashboard.stat.critical": string;
  "dashboard.stat.critical.hint": string;
  "dashboard.stat.sources": string;
  "dashboard.stat.sources.hint": string;
  "dashboard.sources.title": string;
  "dashboard.sources.passLabel": string;
  "dashboard.recentRuns.title": string;
  "dashboard.recentRuns.viewAll": string;
  "dashboard.recentRuns.empty": string;

  // ── Cases ─────────────────────────────────────────────────────────────────
  "cases.title": string;
  "cases.description": string;
  "cases.new": string;
  "cases.filter.cancelFilters": string;
  "cases.empty.noFilter": string;
  "cases.empty.withFilter": string;
  "cases.empty.createFirst": string;
  "cases.step.count": string;

  // ── Case detail ───────────────────────────────────────────────────────────
  "caseDetail.backLink": string;
  "caseDetail.description": string;
  "caseDetail.steps": string;
  "caseDetail.steps.empty": string;
  "caseDetail.expectedResult": string;
  "caseDetail.runsTitle": string;
  "caseDetail.runsEmpty": string;
  "caseDetail.owner": string;
  "caseDetail.tags": string;
  "caseDetail.createdAt": string;
  "caseDetail.updatedAt": string;

  // ── New case ──────────────────────────────────────────────────────────────
  "newCase.title": string;
  "newCase.description": string;

  // ── Case form ─────────────────────────────────────────────────────────────
  "caseForm.name": string;
  "caseForm.description": string;
  "caseForm.owner": string;
  "caseForm.tags": string;
  "caseForm.tags.placeholder": string;
  "caseForm.priority": string;
  "caseForm.status": string;
  "caseForm.caseKey": string;
  "caseForm.caseKey.hint": string;
  "caseForm.steps": string;
  "caseForm.steps.addStep": string;
  "caseForm.step.action.placeholder": string;
  "caseForm.step.expected.placeholder": string;
  "caseForm.step.delete.aria": string;
  "caseForm.expectedResult": string;
  "caseForm.submit": string;
  "caseForm.submitting": string;
  "caseForm.error.default": string;

  // ── Scripts ───────────────────────────────────────────────────────────────
  "scripts.title": string;
  "scripts.description": string;
  "scripts.new": string;
  "scripts.filter.cancelFilters": string;
  "scripts.empty.noFilter": string;
  "scripts.empty.withFilter": string;
  "scripts.empty.createFirst": string;

  // ── Script detail ─────────────────────────────────────────────────────────
  "scriptDetail.backLink": string;
  "scriptDetail.workflow": string;
  "scriptDetail.history": string;
  "scriptDetail.history.empty": string;
  "scriptDetail.product": string;
  "scriptDetail.framework": string;
  "scriptDetail.specPath": string;
  "scriptDetail.caseKey": string;
  "scriptDetail.owner": string;
  "scriptDetail.createdAt": string;
  "scriptDetail.updatedAt": string;
  "scriptDetail.jira": string;

  // ── New script ────────────────────────────────────────────────────────────
  "newScript.title": string;
  "newScript.description": string;

  // ── Script form ───────────────────────────────────────────────────────────
  "scriptForm.name": string;
  "scriptForm.product": string;
  "scriptForm.framework": string;
  "scriptForm.specPath": string;
  "scriptForm.caseKey": string;
  "scriptForm.owner": string;
  "scriptForm.status": string;
  "scriptForm.submit": string;
  "scriptForm.submitting": string;
  "scriptForm.error.default": string;

  // ── Plans ─────────────────────────────────────────────────────────────────
  "plans.title": string;
  "plans.description": string;
  "plans.empty": string;
  "plans.empty.goToCases": string;
  "plans.caseCount": string;

  // ── Runs ──────────────────────────────────────────────────────────────────
  "runs.title": string;
  "runs.description": string;
  "runs.new": string;
  "runs.filter.all": string;
  "runs.empty": string;
  "runs.inProgress": string;
  "runs.continue": string;

  // ── New run ───────────────────────────────────────────────────────────────
  "newRun.title": string;
  "newRun.description": string;
  "newRun.backLink": string;
  "newRun.noPlans": string;
  "newRun.noPlans.createPlan": string;

  // ── New run form ──────────────────────────────────────────────────────────
  "newRunForm.plan": string;
  "newRunForm.triggeredBy": string;
  "newRunForm.label": string;
  "newRunForm.label.placeholder": string;
  "newRunForm.submit": string;
  "newRunForm.submitting": string;
  "newRunForm.error.default": string;

  // ── Execute run ───────────────────────────────────────────────────────────
  "executeRun.backLink": string;
  "executeRun.title.prefix": string;
  "executeRun.title.default": string;
  "executeRun.done.description": string;
  "executeRun.active.description": string;
  "executeRun.done.banner": string;
  "executeRun.done.backLink": string;
  "executeRun.expectedResult.label": string;

  // ── Execute run form ──────────────────────────────────────────────────────
  "executeRunForm.notes": string;
  "executeRunForm.notes.placeholder": string;
  "executeRunForm.evidence": string;
  "executeRunForm.saved": string;
  "executeRunForm.error.default": string;

  // ── Requirements ──────────────────────────────────────────────────────────
  "requirements.title": string;
  "requirements.description": string;
  "requirements.new": string;
  "requirements.empty": string;
  "requirements.empty.createFirst": string;
  "requirements.table.requirement": string;
  "requirements.table.priority": string;
  "requirements.table.status": string;
  "requirements.table.cases": string;
  "requirements.table.coverage": string;
  "requirements.table.tracker": string;
  "requirements.table.link": string;

  // ── Requirement detail ────────────────────────────────────────────────────
  "requirementDetail.backLink": string;
  "requirementDetail.edit": string;
  "requirementDetail.detail": string;
  "requirementDetail.noDescription": string;
  "requirementDetail.linkedCases": string;
  "requirementDetail.linkedCases.empty": string;
  "requirementDetail.metadata": string;
  "requirementDetail.priority": string;
  "requirementDetail.status": string;
  "requirementDetail.createdAt": string;
  "requirementDetail.updatedAt": string;

  // ── New requirement ───────────────────────────────────────────────────────
  "newRequirement.title": string;

  // ── Requirement form ──────────────────────────────────────────────────────
  "requirementForm.name": string;
  "requirementForm.name.placeholder": string;
  "requirementForm.description": string;
  "requirementForm.description.placeholder": string;
  "requirementForm.priority": string;
  "requirementForm.status": string;
  "requirementForm.trackerUrl": string;
  "requirementForm.linkedCases": string;
  "requirementForm.linkedCases.empty": string;
  "requirementForm.submit.create": string;
  "requirementForm.submit.save": string;
  "requirementForm.submitting": string;
  "requirementForm.cancel": string;
  "requirementForm.status.open": string;
  "requirementForm.status.in_progress": string;
  "requirementForm.status.done": string;
  "requirementForm.status.deprecated": string;

  // ── Requirement badges ────────────────────────────────────────────────────
  "requirementStatus.open": string;
  "requirementStatus.in_progress": string;
  "requirementStatus.done": string;
  "requirementStatus.deprecated": string;

  // ── Jira ──────────────────────────────────────────────────────────────────
  "jira.title": string;
  "jira.description": string;
  "jira.notConfigured": string;
  "jira.notConfigured.goSettings": string;
  "jira.cases.title": string;
  "jira.scripts.title": string;
  "jira.runs.title": string;
  "jira.cases.empty": string;
  "jira.scripts.empty": string;
  "jira.runs.empty": string;

  // ── Jira sync button ──────────────────────────────────────────────────────
  "jiraSyncButton.sync": string;
  "jiraSyncButton.error.default": string;

  // ── Settings ──────────────────────────────────────────────────────────────
  "settings.title": string;
  "settings.description": string;
  "settings.save": string;
  "settings.saving": string;
  "settings.saved": string;
  "settings.lastSeen.label": string;
  "settings.lastSeen.never": string;
  "settings.lastSeen.justNow": string;
  "settings.lastSeen.minutesAgo": string;
  "settings.lastSeen.hoursAgo": string;
  "settings.lastSeen.yesterday": string;
  "settings.lastSeen.daysAgo": string;
  "settings.connection.active": string;
  "settings.connection.inactive": string;
  "settings.connection.installed": string;
  "settings.connection.app": string;
  "settings.connection.service": string;
  "settings.connection.source": string;
  "settings.connection.healthy": string;
  "settings.connection.noData": string;
  "settings.tokenSet": string;
  "settings.baseUrl": string;
  "settings.token": string;
  "settings.email": string;
  "settings.projectKey": string;
  "settings.spaceKey": string;
  "settings.statusMap": string;
  "settings.token.placeholder.set": string;
  "settings.token.placeholder.empty": string;

  // ── Settings wizard ───────────────────────────────────────────────────────
  "wizard.integrate": string;
  "wizard.ask.title": string;
  "wizard.ask.yes": string;
  "wizard.ask.no": string;
  "wizard.ask.cancel": string;
  "wizard.chooseType.title": string;
  "wizard.chooseType.app.title": string;
  "wizard.chooseType.app.hint": string;
  "wizard.chooseType.service.title": string;
  "wizard.chooseType.service.hint": string;
  "wizard.chooseType.source.title": string;
  "wizard.chooseType.source.hint": string;
  "wizard.chooseType.back": string;
  "wizard.enterApp.title": string;
  "wizard.enterApp.description": string;
  "wizard.enterApp.ingestUrl": string;
  "wizard.enterApp.dataDir": string;
  "wizard.enterApp.dataDir.hint": string;
  "wizard.enterApp.connect": string;
  "wizard.enterApp.connecting": string;
  "wizard.enterApp.back": string;
  "wizard.enterService.title": string;
  "wizard.enterService.connect": string;
  "wizard.enterService.connecting": string;
  "wizard.enterService.back": string;
  "wizard.enterPath.title": string;
  "wizard.enterPath.connect": string;
  "wizard.enterPath.connecting": string;
  "wizard.enterPath.back": string;
  "wizard.download.title": string;
  "wizard.download.button": string;
  "wizard.download.alreadyHave": string;
  "wizard.download.cancel": string;
  "wizard.connected.disconnect": string;
  "wizard.verify.pathEmpty": string;
  "wizard.verify.urlEmpty": string;
  "wizard.verify.failed": string;

  // ── Module page ───────────────────────────────────────────────────────────
  "module.connection.active": string;
  "module.connection.inactive": string;
  "module.connection.awaitingPush": string;
  "module.connection.firstResult": string;
  "module.connection.ingestEndpoint": string;
  "module.connection.dataDir": string;
  "module.connection.baseUrl": string;
  "module.connection.sourcePath": string;
  "module.scripts.title": string;
  "module.scripts.empty.app": string;
  "module.scripts.empty.default": string;
  "module.scripts.col.name": string;
  "module.scripts.col.path": string;
  "module.scripts.col.status": string;
  "module.runs.title": string;
  "module.runs.empty.app": string;
  "module.runs.empty.default": string;
  "module.runs.col.suite": string;
  "module.runs.col.source": string;
  "module.runs.col.started": string;
  "module.runs.col.results": string;
  "module.runs.total": string;

  // ── Module sync button ────────────────────────────────────────────────────
  "moduleSyncButton.sync": string;
  "moduleSyncButton.syncing": string;
  "moduleSyncButton.done": string;
  "moduleSyncButton.error.network": string;

  // ── Login ─────────────────────────────────────────────────────────────────
  "login.title": string;
  "login.password": string;
  "login.submit": string;
  "login.submitting": string;
  "login.error.wrong": string;

  // ── Workflow control ──────────────────────────────────────────────────────
  "workflow.goTo": string;
  "workflow.error.default": string;
}
