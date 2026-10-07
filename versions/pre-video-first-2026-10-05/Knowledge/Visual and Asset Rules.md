---
tags: [factory, visual, assets]
---

# Visual and Asset Rules

## Timing and style

- Production shots last 2.5–3.0 seconds, selected around ElevenLabs word and phrase endings. Aim for roughly half presenter screen time and half B-roll, with 2–5 seconds of presenter-only footage between B-rolls.
- Use one to three directly relevant stock-video shots per video. Use still images for the remaining visual beats, with gentle wide-to-close motion.
- The ten restrained transitions rotate in order: fade, wipeleft, slideright, circleopen, dissolve, wiperight, slideleft, circleclose, wipeup, slidedown.
- Preserve source audio. No music or whoosh in the current mixed renderer. Preserve the approved green-screen crop and hair edges.
- Captions use bundled Tiro Devanagari Sanskrit and amber emphasis. Check the spoken words as well as Hindi matra rendering.

Source: [[PROJECT#Current visual rules and re-edits|visual rules]] and [[PROJECT#Main factory|factory configuration]].

## Asset selection

- Match named products to the exact photo in `product-assets/catalog.json` / `product-assets/images/`; never use an unrelated package. The supplied workbook has 505 catalog entries.
- Use `reference-assets/` Acharya social screenshots and HIIMS Meerut hospital image only at relevant speech. No Instagram screenshot was supplied.
- Show **82704-82704** when Acharya says the contact number.
- Generated people and settings should look Indian when people are needed. Prefer a relevant Indian still over foreign-looking stock footage.
- Product labels and supplied screenshots use restrained contained framing; portrait photos fill the reel frame.
- Do not present generic visuals as actual testimonials, research, case charts, prices, event flyers, or hospital exteriors.

The production planner is constrained to exact product IDs and a restricted stock catalog; invalid plans retry and then fail rather than substituting a wrong asset. [[PROJECT#Current visual rules and re-edits|Planner detail]]

## Review evidence

The per-video `assembly-manifest.json` records source IDs, nearby speech, phrase-ending reasons, transitions, and coverage. Check it against the rendered frames and transcript. See [[Renders and Batches]] for examples.
