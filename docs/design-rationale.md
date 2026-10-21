# Co-learn: design rationale

Dinakar Guthy · Full Stack Engineer, Education Labs take-home.
Prototype: https://anthropic-take-home-10-17-26.vercel.app · Decisions in full: `docs/decision-log.md` · Video walkthrough: _(link)_

## 1. Option chosen and why

I chose Option B for two reasons. First, I'm not a Claude Code expert, so I wouldn't have the depth to design something like Option A well. Second, Option B's broader ambition excited me more, because it's something I would actually use myself.

That second point shaped the demo too. I picked a working professional training a churn model because it's a real use case for me. Training models is part of my job, and learning the concepts behind them would help me. Being a customer of my own product made the customer journey much easier to understand.

My first design was a topic tutor: pick a subject and Claude teaches it. That's the version I'd use most. But the prompt left open whether the tool had to teach people *while* they work with Claude. Rather than guess, I split the product into two modes:
- **Co-learn:** you do real work with Claude, and short, game-like learning moments come out of that work.
- **Learn:** you name a topic and Claude plans a short path of cited lessons and questions.

These are very different flow states with different needs. Someone in the middle of a task wants learning that stays out of the way, while someone studying wants structure. So users choose the mode that fits.

## 2. Design and prototyping process

I started from my own understanding of how people learn. It comes from my background as a professional tutor and a long-standing personal interest in education and what actually helps people learn. I wrote that down as nine design principles. Then I had Claude check each one against peer-reviewed research, so the foundation rested on evidence and not only my experience.

Next, I designed the product experience myself and shared it with Claude. We went back and forth on whether it made sense, and I made the final calls. Every meaningful choice went into a decision log with the alternatives I considered (60+ entries).

Then I wrote a high-level engineering plan, drawing on my experience as a Staff engineer planning software projects: the architecture, shared contracts, and a build order that let parts of the work run in parallel. Claude carried out that plan and wrote most of the code.

Finally, I tested the experience myself in a real browser and played through it as a user. As AI takes on more of the intermediate work, I think the most important thing for a person to check is the final result, so that's where I spent my review time. Those playthroughs drove a second build round. The biggest change came when I got a question I couldn't answer and the product had no way to help me learn it. So I added hints, "Teach me", and "Ask Claude" to every question; slightly less credit after help; and the answer revealed only after you've tried. Now people at any level can take part, not just those who already know.

## 3. How it enhances, not replaces, human agency

At its core, what I built is an interactive question-and-answer system woven into real work. As you work with Claude, it stops at meaningful points and asks you a question: a decision to make, a prediction, a concept to apply. The questions get harder as you get them right, because the engine aims for about 80% success. Each stretch of work builds to a boss battle, a short run of tougher questions on what you've just done. So at the heart of the experience, the person has to take agency, answering harder and harder problems instead of watching Claude solve them.

The design follows two of my core principles: "active application is the core" and "the user stays the decision-maker." The learner should be thinking about the problem, not receiving a firehose of information. At real forks, like which metric to optimize or where to set a threshold, Claude asks instead of deciding. Then it builds on the answer: "You picked recall, so I scored the models on that." Making decisions uses a different part of the brain than taking in facts. It leaves people feeling empowered, not like a store of knowledge, and storing knowledge is something AI is increasingly good at anyway.

Some of this is enforced by design, not left to the prompt. A learning moment is a tool call that ends Claude's turn, so Claude can't answer its own question.

The control I care about most is that help only comes when you ask for it. Hints, "Teach me", and "Ask Claude" are always there, but nothing appears unless the learner reaches for it, and the answer is revealed only after an attempt. That puts the learner in control of the difficulty, including the choice to struggle through a problem on their own. Everything else is opt-out too: skip a question, save it with "Quiz me later", turn down a boss, or keep typing and the question steps aside.

## 4. Learning principles behind the decisions

Three principles matter most to me, and each shows up directly in the product.

**1. Practice.** People learn by applying knowledge, not by reading about it. This principle covers several research findings at once, and it's why questions are the backbone of both modes. Learners recall the answer themselves before seeing options; multiple choice is only a fallback. Every answer, right or wrong, gets an immediate "why", because mistakes only help when they're explained right away (Kornell, Hays & Bjork, 2009). Bosses mix concepts from across the session, and concepts you struggled with come back in a later session.

**2. Adaptive difficulty.** Difficulty has a huge effect on engagement. People want material that feels hard enough to be worth overcoming, but not so hard that they give up, and the job is finding that balance for each person. The engine targets success rates by question type: 85–90% the first time you meet a concept, 75–85% in practice, 65–80% in a boss. It steps down quickly after a miss and ramps up slowly after successes. When a question is still too hard, help steps in: a hint, then a short lesson, then the question again.

**3. Reward.** Hard work should feel rewarded. XP, sounds, confetti, and level-ups that unlock themes celebrate success in proportion to the effort. Wrong answers get a soft sound and encouragement, never a penalty. In Learn mode, a serialized story adds a reason to keep going. Together they keep a positive feedback loop running: effort leads to reward, which leads to more effort.

## 5. Measuring success

For the product, success means it actually helps people learn. By the end of a session, people should be able to answer questions and apply the knowledge the product tests them on. The best measure of that is how often people answer correctly, especially at the end of a session in the boss battle, which mixes concepts from the whole session into harder questions. A strong boss score is good evidence that the material actually stuck. Alongside that, I'd measure how confident people feel about what they learned with a short survey. The wrap-up already asks a quick "Did you learn something?"

For users, success also includes how they feel: whether they enjoyed it and want to keep using it. At scale, that's daily active users and return rates.

The first thing I'd check is adoption: whether people actually want to use it, and whether those who try it once come back. A learning tool nobody returns to can't teach anyone much. Next, I'd look at signals inside the session, which the `/insights` dashboard already tracks:
- **Accuracy against the difficulty bands:** consistently above target means questions are too easy; below means too hard. Early testing showed questions landing above the band, so they need to get harder.
- **Boss engagement:** how often people take a boss on versus decline or skip it.
- **Help usage:** how often people reach for hints, "Teach me", or "Ask Claude", and how they score with help versus without.

Together these show where to tune the experience to be easier or harder. The dashboard also measures delayed retention, comparing scores on a concept in a later session with the first, which is the clearest test of whether learning lasted.

## 6. Scaling to millions of users

The hardest part of scaling isn't infrastructure; it's that every learner is different. People need Claude to sound and speak to them differently, and they differ in how hard the content should be and how fast it should ramp up. One model serving everyone the same way won't work. The prototype already adapts difficulty per person with a small engine, but at scale I'd push further. First, I'd prompt the model to adapt as much as possible to each user. Then I'd add persistent personalization that carries across sessions, potentially using lightweight fine-tuning such as LoRA if prompting isn't enough.

The architecture is a reasonable starting point. The server routes are stateless, so they scale out easily; each user's state is a small JSON record in Upstash Redis. Costs stay low through prompt caching, a cheaper model (Haiku) for grading and hints, a pacing engine that is plain code with no model calls, and automatic summarizing of long sessions. A 10-minute session costs about $0.20–0.30 today. Rate limits and daily spend caps protect against abuse.

For a real launch, I'd change four things:
- **Infrastructure:** move off the free tiers of Vercel and Upstash Redis, either to paid plans or, more naturally, onto Anthropic's own infrastructure. Then load-test with many people using it at once.
- **Where it lives:** either build it directly into Claude's own products or ship it as a standalone product, not a separate demo site.
- **UX polish:** refine the design so each element sits in the ideal spot.
- **Model quality:** iterate on every stage of the experience so the questions, hints, and explanations are as good as they can be.

## 7. Getting a sister team to adopt it long-term

I read this question two ways: a sister team *using* Co-learn in their own work, or a sister team *building it into* their own product. I'll answer both.

**Using it.** I'd start by learning what the team works on and asking them to share a recent problem that was complex or ambiguous. Then I'd build a demo showing how Co-learn would have helped them work through that problem and learn along the way. A demo on their own real problem is far more convincing than a generic pitch.

**Building it in.** I'd go first to a team that builds custom Claude interfaces, since that's closest to our own work. My pitch: turning Claude into something game-like is likely to pay off well beyond learning, and every surface that adopts some of it multiplies the benefit. What I'd share:
- **The question cards** shown to the user, as code they can customize for their surface.
- **The game layer:** progress tracking, XP, and rewards, run by a pacing engine with a clear, tested interface. Adopting it means adding one tool and rendering the card.
- **The metrics:** the same telemetry and `/insights` dashboard, so they can measure learning from day one.

**Keeping it working.** I'd offer for our team to keep maintaining the shared infrastructure, while both teams share ownership of the user metrics and of whether learners succeed. Shared goals are what keep an adoption alive after the launch excitement fades.
