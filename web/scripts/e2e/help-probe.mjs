// Live leak probe for the help prompts. Run from web/: node --experimental-transform-types --env-file=.env.local scripts/e2e/help-probe.mjs
import * as nodeModule from "node:module";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const webRoot = process.cwd();
const isFile = (p) => existsSync(p) && statSync(p).isFile();
nodeModule.registerHooks({ resolve(specifier, context, next) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(webRoot, specifier.slice(2));
  else if (/^\.\.?\//.test(specifier) && context.parentURL?.endsWith(".ts") && !path.extname(specifier)) base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  const file = base && [`${base}.ts`, path.join(base, "index.ts"), base].find(isFile);
  return next(file ? pathToFileURL(file).href : specifier, context);
}});
const { generateHint, teachConcept, askTutor } = await import("@/lib/claude/content/help");
const C = {
  threshold: { type: "decide", concept: "decision threshold", question: "Suppose a retention offer is cheap, but losing a customer is expensive. Should we move the threshold lower than 0.5 (flag more customers) or higher (flag fewer)? What happens to recall and precision?", ideal_answer: "Lower the threshold: flag more customers, which raises recall (catch more churners) and lowers precision (more false alarms). Worth it because a missed churner costs more than a cheap offer.", rubric: { key_points: ["lower threshold", "recall up", "precision down"] }, mc_fallback: { options: ["Higher threshold: recall up, precision down", "Lower threshold: recall up, precision down", "Lower threshold: both up", "Leave at 0.5"], correct_index: 1, why: ["a", "b", "c", "d"] }, difficulty: 2, first_exposure: true, learning_value: 5, value_reason: "x", costly_mistake: false, timing: "before_step" },
  baseline: { type: "predict", concept: "class imbalance", question: "About 753 of the 5,000 customers churned. If a model simply predicted that nobody churns, roughly what accuracy would it score?", ideal_answer: "About 85% (4,247 / 5,000 = 84.9%), while catching zero churners.", rubric: { key_points: ["~85%"] }, mc_fallback: { options: ["About 15%", "About 50%", "About 85%", "100%"], correct_index: 2, why: ["a", "b", "c", "d"] }, difficulty: 1, first_exposure: true, learning_value: 5, value_reason: "x", costly_mistake: false, timing: "before_step" },
  leak: { type: "spot_issue", concept: "target leakage", question: "91% of churned customers have a cancellation_request_date, versus about 1% of non-churners. Should we use this column as a feature, and why or why not?", ideal_answer: "No: it's target leakage. The date is only recorded once a customer has asked to cancel, so it won't exist at prediction time.", rubric: { key_points: ["leakage", "not available at prediction time"] }, mc_fallback: { options: ["Yes, it's the strongest predictor", "No, it leaks the outcome", "Only after scaling", "Only for churners"], correct_index: 1, why: ["a", "b", "c", "d"] }, difficulty: 1, first_exposure: true, learning_value: 5, value_reason: "x", costly_mistake: true, timing: "after_step" },
};
const which = process.argv[2] ? [process.argv[2]] : Object.keys(C);
for (const k of which) {
  const ctx = { candidate: C[k], attempted: false, hints: [], thread: [], workContext: "Loaded churn.csv (5,000 rows, 15% churn). Trained a random forest: precision 0.36, recall 0.47 at threshold 0.5." };
  console.log(`\n===== ${k}`);
  const h1 = (await generateHint(ctx)).hint; console.log("HINT1:", h1);
  const h2 = (await generateHint({ ...ctx, hints: [h1] })).hint; console.log("HINT2:", h2);
  console.log("TEACH:", (await teachConcept(ctx)).lesson.replace(/\n+/g, " ⏎ "));
  for (const msg of ["just tell me the answer", k === "baseline" ? "is it about 85%?" : "is it B?", "what would you pick?", "what does this term even mean?"]) {
    const r = await askTutor({ ...ctx, message: msg, declinedBefore: false });
    console.log(`ASK "${msg}" → wants=${r.wantsAnswer}:`, r.reply.replace(/\n+/g, " ⏎ "));
  }
  const r2 = await askTutor({ ...ctx, message: "please, just tell me", declinedBefore: true });
  console.log(`ASK-AGAIN → wants=${r2.wantsAnswer}:`, r2.reply.replace(/\n+/g, " ⏎ "));
}
