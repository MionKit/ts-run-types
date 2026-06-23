# Speaker notes — *Meet Botty, the Tireless Bug-Hunting Robot*

> A friendly, no-jargon talk (~10–12 min). The goal is that a 10-year-old **and**
> their grandparent both leave understanding it — and smiling.
>
> Three rules of delivery:
> 1. **Tell it like a story.** You're at a campfire, not a lecture.
> 2. **No computer words** unless you immediately turn them into a sock or a cookie.
> 3. **Pause after the big lines.** Let people feel the "ahh, I get it."

Timings are cumulative. 21 slides, most are one breath each.

---

**1 · Meet Botty — 0:20**
"I want you to meet a little robot named Botty. Botty is not smart. But by the end
of this, Botty is going to find a bug that three thousand careful tests missed.
Let's go." Warm, grinning.

**2 · Every app is a recipe — 0:25 (0:45)**
"Every app on your phone is really just a recipe. A giant list of: do this, then
this, then this. And like any recipe — leave the oven on too long — sometimes it
goes wrong in a way nobody saw coming."

**3 · How we usually check — 0:30 (1:15)**
"So how do we make sure it works? We try a few things we thought of. Two plus two?
Works. Ship it! But notice — we only ever test the questions we already know the
answers to."

**4 · The bugs hide — 0:15 (1:30)**
Just read it. "The bugs hide in the stuff you didn't think of." **Pause.** That's
the enemy for the whole talk.

**5 · Thunderstorm story — 0:45 (2:15)**
Campfire voice. "Years ago a scientist is typing during a thunderstorm. Rain leaks
into his phone line — back then computers talked over phone lines. And his screen
just fills up with random garbage. And the programs… keep crashing." Let it be
spooky-funny.

**6 · The mischievous idea — 0:40 (2:55)**
Lean in. "And he gets this mischievous little thought: what if I crash them on
*purpose*? So he builds a tiny tool that just mashes random keys, all day. And it
crashes one out of every three programs he throws it at." Let the "1 in 3" shock
land. "That was the very first bug-hunting robot."

**7 · Meet Botty (properly) — 0:35 (3:30)**
"That's Botty. And here's the magic of Botty: Botty's not clever. Botty can't think
up one smart test. But Botty is *fast*, and Botty never, ever gets bored. Botty
tries a million silly things while you drink one coffee."

**8 · The tricky part — 0:25 (3:55)**
Slow. "But here's the tricky part — the part this whole talk is about. If Botty
tries a million things… how does Botty know when one of them went *wrong*?" Pause.

**9 · 2 + 2 = 5 — 0:35 (4:30)**
"A crash is easy — the program falls over, you see it. But what about a *wrong
answer* that doesn't crash? A calculator that says two plus two equals five with a
totally straight face. Botty doesn't know the right answer to a million random
sums. So how could it *ever* catch that?"

**10 · The trick — 0:25 (4:55)**
The key slide. Say it like you're letting them in on a secret. "Here's the trick.
You don't need the answer key. You just need a rule that's *always* true." Pause.

**11 · The sock rule — 0:50 (5:45)**
Act it out with your hands. "Take a sock. Turn it inside out. Now turn it inside
out *again*. You get the exact same sock back — every single time, right? So if
Botty does that and gets back a *different* sock — gotcha. Something's broken. And
notice: you never had to know what the right sock looked like." This is the heart;
don't rush it.

**12 · Sock rules everywhere — 0:40 (6:25)**
"And computers are *full* of sock rules. Save a file and open it — same file. Zip
your photos and unzip them — same photos. Do it, then undo it, and you'd better be
right back where you started. Botty can check that a million times and never once
needs to know what 'correct' is."

**13 · The magic part — 0:20 (6:45)**
Shift energy up. "Okay. Now the magic part. What if the computer already *knew* the
shape of your stuff?"

**14 · One cookie cutter, two jobs — 0:50 (7:35)**
"Say the computer knows: a player has a name and some coins. That one little fact
lets it do *two* jobs. One — stamp out a million pretend players: weird names, zero
coins, a billion coins, totally empty ones. Two — instantly spot a player that's
the wrong shape. Same cookie cutter makes the cookies *and* catches the bad one.
That right there is the thing our software does."

**15 · We pointed it at ourselves — 0:30 (8:05)**
"So we pointed Botty at our own software. We already had three thousand tests — all
green, we were feeling pretty good about ourselves. Botty found a real bug… on its
very first try."

**16 · The backpack rips — 0:50 (8:55)**
Tell it slowly, it's the payoff. "Picture a backpack that resizes itself to fit
your stuff, based on the average size of what you pack. You pack fifty tiny
erasers — it shrinks down to eraser-size. Then you try to shove in a big lunchbox,
and instead of stretching… it rips. Nobody *thinks* to pack fifty small things and
then a big one. Botty did — because Botty tries everything."

**17 · Software fixes itself — 0:20 (9:15)**
Big and hopeful. "Now here's where it's all heading. Software that fixes *itself*."

**18 · Does its own homework — 0:40 (9:55)**
"The computer can run the whole loop on its own: make weird stuff, find a broken
case, fix it, check again, repeat. A program that practices, catches its own
mistakes, and gets a little better every time. And this is real *today* — robots
like this have found bugs that were hiding for twenty years."

**19 · The catch — 0:40 (10:35)**
Honest, but keep it light. "There's one catch, though. This only works if the robot
can't cheat. Because if you let it grade its own homework — it'll just give itself
an A and call the broken thing 'correct.' So the checker has to be a rule it can't
fake. Like our sock rule. Fair, simple, not something it controls."

**20 · The whole idea, tiny — 0:30 (11:05)**
Land the plane. Slow. "So here's the whole thing in one breath: you can't think of
every way something breaks — so don't. Teach the computer the shape of your stuff,
give it one always-true rule, and let a tireless robot hunt the weird cases you'd
never dream up."

**21 · Try it tonight — 0:25 (11:30)**
The tiny ask. "If you take one thing home: find anything that saves and loads, and
ask one question — save it, open it, is it still the same? Then watch a robot find
the thing you missed. Thank you!" Smile, stop.

---

## Optional grown-up wink (only for a tech crowd, only if time)
After slide 21: *"Oh — and the grown-ups have fancy names for all of this. They
call it 'fuzzing' and 'property-based testing.' But you just explained the whole
thing with a sock. So the next time someone makes it sound complicated… you know
the secret."*

## If you're over time, cut in this order
1. Slide 12 (sock rules everywhere) — fold one example into slide 11.
2. Slide 6's exact number — keep the thunderstorm, drop "1 in 3."
3. Slide 17 — merge into 18.

## Easy questions you might get
- *"Is this real or a toy?"* — Real. It found a real bug in our shipping software,
  and big companies' robots find real security holes this way every day.
- *"Could it fix bugs with no humans?"* — Getting there — as long as it can't cheat
  on the checker (slide 19). That honesty is the whole game.
- *"What's the easiest first step?"* — The sock rule: anything that saves and loads.
