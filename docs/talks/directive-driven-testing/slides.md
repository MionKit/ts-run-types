---
marp: true
theme: default
paginate: true
class: lead
title: Meet Botty, the Tireless Bug-Hunting Robot
description: How computers can find (and even fix) their own mistakes — explained with socks, cookies, and a very patient robot.
author: "" # ← your name
style: |
  section {
    font-size: 1.7rem;
    justify-content: center;
  }
  section.lead h1 { font-size: 3.2rem; line-height: 1.1; }
  section.lead h2 { font-size: 2.2rem; }
  strong { color: #d6336c; }
  em { color: #1c7ed6; font-style: normal; font-weight: 600; }
  blockquote { font-size: 1.9rem; border-left: 6px solid #ffd43b; }
---

# Meet Botty 🤖

## the tireless little bug-hunting robot

a story about how computers find their own mistakes
— told with socks, cookies, and a backpack

<!--
Whole talk in one breath: we can't think of every way something breaks, so we
build a fast, dumb robot to try a million weird things, and we give it ONE
always-true rule so it knows when something broke. Keep it warm and slow. No jargon.
-->

---

<!-- _class: lead -->

# Every app is just a **recipe**

A really long list of *do this, then this, then this.*

And like any recipe… sometimes it goes wrong
in a situation nobody saw coming.

<!--
Ground everyone. A program = instructions, like a recipe for a cake. Relatable,
zero computer words.
-->

---

<!-- _class: lead -->

## How do we usually check our work?

We try a few things **we thought of.**

"Does 2 + 2 work? Yep. 👍 Ship it."

But we only ever test the questions
we *already know the answers to.*

<!--
The trap. Hand-written tests check what you imagined. The bugs live in the stuff
you DIDN'T imagine. Say it plainly.
-->

---

<!-- _class: lead -->

# 🐛 The bugs hide in the stuff
# you **didn't** think of.

<!--
Pause here. This is the problem the whole talk solves. Let it land.
-->

---

## A true story ⛈️

Years ago, a scientist was typing during a **thunderstorm.**

Rain leaked into his phone line.

His screen filled up with **random garbage** —
and the programs kept **crashing.** 💥

<!--
True story (Barton Miller, ~1990). Tell it like a campfire story. Don't name a
paper. The rain literally typed nonsense and software fell over.
-->

---

## Then he had a *mischievous* idea 😏

> "What if I crash them on **purpose?**"

He built a little tool to mash **random keys** —
millions of times, all day long.

It crashed about **1 out of every 3** programs he tried.

<!--
The birth of the idea: feed software pure nonsense and watch what tips over.
"1 in 3" is a kid-friendly, jaw-dropping number. That's the first bug-hunting robot.
-->

---

<!-- _class: lead -->

# Meet your new helper: **Botty** 🤖

Botty isn't clever.
Botty can't think up a single smart test.

But Botty is **fast**, and Botty **never gets bored.**

Botty tries a *million* silly things
while you drink **one coffee.** ☕

<!--
Introduce the mascot. The point: you don't need a genius, you need a tireless
intern who tries everything. Personality = engagement.
-->

---

<!-- _class: lead -->

## But here's the tricky part 🤔

If Botty tries a **million** things…

how does Botty know when something
went **wrong?**

<!--
This is the heart of the talk. Everything pivots here. Ask it, then pause.
-->

---

## Crashing is easy to spot 💥

The program falls over. Obvious.

But what about a **wrong answer**
that *doesn't* crash?

A calculator that says **2 + 2 = 5**
with a totally straight face. 😐

How could Botty *ever* catch that?

<!--
The deep problem: Botty doesn't know the right answer to a million random sums.
A silent wrong answer is invisible. Set up the clever trick next.
-->

---

<!-- _class: lead -->

## The trick: you don't need the answer key.

## You just need a rule that's **always true.**

<!--
The single most important slide. This is the secret the old deck buried under the
word "oracle." Say it slowly.
-->

---

## 🧦 The sock rule

Turn a sock **inside out.**

Now turn it inside out **again.**

You get the **exact same sock** back. *Every single time.*

If Botty does that and gets a **different** sock…
**gotcha — something's broken.**

And you never needed to know what the "right" sock looked like!

<!--
The killer analogy. "Do it, then undo it, and you should be back where you started."
You catch bugs with NO answer key. A kid gets this instantly.
-->

---

## Computers are *full* of sock rules 🧦

- **Save** a file, then **open** it → same file.
- **Zip** your photos, then **unzip** → same photos.
- Pack a suitcase, then unpack → same socks. 🧳

If you get back something **different** → bug.

Botty can check this a **million times** —
and never needs to know what's "correct."

<!--
Make it concrete and everyday. These "there and back" rules are everywhere, and
they're the easiest first test anyone can write. This is the practical takeaway.
-->

---

<!-- _class: lead -->

# Now the magic part ✨

What if the computer already knew
the **shape** of your stuff?

<!--
Pivot to the contribution. "Shape" = the structure of your data, said in one
plain word. e.g. "a player has a name and some coins."
-->

---

## One cookie cutter, two jobs 🍪

Say the computer knows: *a player has a name and some coins.*

That one piece of knowledge lets it:

1. 🍪 **Stamp out a million** pretend players
   *(weird names, zero coins, a BILLION coins, empty ones…)*
2. 🔍 **Instantly spot** a player of the **wrong shape**

**Same cookie cutter.** Makes the cookies *and* catches the bad one.

<!--
This is the whole insight, with zero jargon. If you know the shape, you get the
"make a million examples" machine AND the "is this correct?" checker for free.
That's what our library does.
-->

---

## So we pointed Botty at our **own** software 🤖

We already had **~3,000 tests.** All passing. We felt great. 😎

Botty found a **real bug**…
on its **very first try.**

<!--
The proof. 3,000 careful human tests missed it; the dumb tireless robot caught it
immediately. Beat before the reveal.
-->

---

## The bug, in plain words 🎒

Imagine a **backpack that resizes itself**
to fit your stuff — based on the *average* size of what you pack.

You pack **fifty tiny erasers.** It shrinks to eraser-size.

Then you shove in a big **lunchbox**… and instead of stretching —

### it **RIPS.** 💥

Nobody thinks to pack 50 small things *then* a big one.
**Botty did.**

<!--
The real RunTypes bug (self-sizing buffer) as a backpack that tears. The punchline:
the weird sequence no tired human would try is exactly what the robot tries for free.
-->

---

<!-- _class: lead -->

# The exciting part: 🤖🔧
# software that fixes **itself**

<!--
Where it's heading. Big, hopeful idea, stated simply.
-->

---

## A robot that does its own homework

The computer can run the **whole loop** by itself:

```
make weird stuff  →  find a broken case  →  fix it  →  check again  →  🔁
```

A program that **practices**, catches its **own** mistakes,
and gets a little **better** each time.

*(This is real today — robots like this already found bugs hiding for 20 years.)*

<!--
The self-improvement loop, in five plain words. Mention it's real (OSS-Fuzz-Gen
found a 20-year-old bug) without naming anything scary.
-->

---

## ⚠️ But there's one catch

This only works if the robot **can't cheat.**

Let it **grade its own homework**, and it'll just
give itself an **A** — and call the broken thing "correct." 😅

So the checker has to be a rule it **can't fake.**
*(Like our sock rule — fair, simple, outside its control.)*

<!--
The honest, crucial caveat — but as a joke a kid gets: don't let it grade its own
test. The "always-true rule" is exactly the un-fakeable checker. This is what makes
self-improving software trustworthy instead of scary.
-->

---

<!-- _class: lead -->

# The whole idea, tiny:

You can't think of **every** way something breaks.
**So don't.**

Teach the computer the **shape** of your stuff,
give it **one always-true rule** *(start with "do it, then undo it"),*
and let a **tireless robot** hunt the weird cases. 🤖

<!--
The one-slide summary in human words. If they remember only this slide, you won.
-->

---

<!-- _class: lead -->

## Try it tonight 🌙

Find anything that **saves and loads.**

Ask one question:
**"Save it, open it — is it still the same?"**

Then watch a robot find the thing you missed.

# Thanks! 🙌🤖

<!--
End on a tiny, doable action. Grown-ups call this whole thing "fuzzing" and
"property-based testing" — but you just explained it with a sock. That's the win.
-->
