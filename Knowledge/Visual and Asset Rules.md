---
tags: [factory, visual, assets]
---

# Visual and Asset Rules

## Timing and style

- Production v7 shots last 2.1–4.2 seconds, selected around ElevenLabs word and phrase endings. Keep at least 1.5 seconds of presenter between B-rolls; there is no target coverage ratio.
- Prefer a directly relevant approved local stock video for each meaningful visual beat, with no fixed count. Use an exact supplied product/reference photo where applicable or a relevant generated still when no distinct approved video fits. Leave the presenter visible for weak visual beats.
- A video, photo, or optional audio insert may appear only once in a reel. The renderer rejects repeated paths and identical bytes; the planner rejects repeated local paths and identical generated-image prompts. Prior use in another reel is a soft tie-breaker, recorded after successful renders.
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

The production planner is constrained to exact product IDs and `approved-stock-ids.json`; invalid plans retry and then fail rather than substituting a wrong asset. Optional four-frame SigLIP2 retrieval supplies a small local shortlist, not an automatic 80% fit decision. [[Future Vector Embedding Update#Production v7 handoff — read this first|Current vector and rollback detail]]

## Review evidence

The per-video `assembly-manifest.json` records source IDs, nearby speech, phrase-ending reasons, transitions, and coverage. Check it against the rendered frames and transcript. See [[Renders and Batches]] for examples.
