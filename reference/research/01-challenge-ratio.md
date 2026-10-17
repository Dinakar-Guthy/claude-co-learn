# Research: is ~80% success the right challenge level?

_Subagent research report, 2026-10-17._

## Verdict
~80% is a **defensible starting heuristic**, not a proven optimum for humans. Research supports a **range (~70–90%) that should vary by question type**.

## Strong evidence
- **Wilson et al. 2019 "85% Rule"** — for binary classification learned via gradient descent with Gaussian noise, learning *speed* peaks at 15.87% error (~85% accuracy); ~82% Laplacian, ~75% Cauchy noise. Limits: unclear beyond 2 categories; some learners have no sweet spot; measures speed not retention; flow link is hypothesis. Wilson: likely not directly transferable to students. https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579
- **Testing effect** (Roediger & Karpicke 2006; Rowland 2014 meta-analysis d≈0.50): retrieval > restudy for retention; feedback boosts it; retrieval must succeed often enough; harder successful retrievals help more (Pyc & Rawson 2009).
- **Desirable difficulties** (Bjork & Bjork 2011/2020): spacing, interleaving, testing help; difficulty is "undesirable" without background knowledge.
- **Errors + feedback**: failed attempts followed by the answer enhance learning (Kornell, Hays & Bjork 2009), best with immediate feedback; hypercorrection — high-confidence errors corrected more readily, but can return → re-test; productive failure meta-analysis (Sinha & Kapur 2021) needs prior knowledge.
- **BKT mastery** commonly P(known) ≥ 0.95 (also 0.8/0.9 used).

## Weaker / folk
- Rosenshine 2012 "~80%" — from a correlational 4th-grade math study (82% vs 73%; re-reading suggests 83% vs 76%).
- Duolingo — Birdbrain targets "right difficulty"; no official number. "~80%" is secondary; von Ahn mentioned ~70% for strong learners.
- Flow — pre-registered study (n=309) found difficulty–skill balance didn't affect enjoyment. Don't promise flow from 80%.
- Khan Academy 70% "Familiar" / 100% "Proficient" — product choices.

## Suggested targets
| Question type | Target accuracy |
|---|---|
| New concept, first exposure | 85–90%+ |
| Standard practice / spaced review | ~75–85% |
| Boss / cumulative / interleaved | 65–80%, rich feedback |
| Optional challenge / pre-instruction probe | ~50–60%, low stakes |
| Mastery gate | ~90–95% |

## Design implications
1. Immediate explanatory feedback after every wrong answer.
2. Optional confidence ratings; re-test high-confidence errors later.
3. Adapt on rolling averages; back off fast after misses, ramp up gradually.
4. Optimize for delayed retention, not in-session accuracy.

## Sources
https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579 · https://www.brown.edu/news/2019-11-07 · https://www.aft.org/sites/default/files/periodicals/Rosenshine.pdf · https://my.chartered.college/impact_article/criticality-in-evidence-informed-teaching-expansive-learning-with-rosenshine/ · https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf · https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf · Rowland 2014 meta-analysis · Pyc & Rawson 2009 doi 10.1016/j.jml.2009.01.004 · https://pmc.ncbi.nlm.nih.gov/articles/PMC3079415 · Sinha & Kapur 2021 doi 10.3102/00346543211019105 · https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9890114/ · https://support.khanacademy.org/hc/bg/articles/5548760867853 · https://journals.sagepub.com/doi/full/10.1177/09637214221100484
