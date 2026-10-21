# 10: Privacy, Terms and landing copy

**What to build:** Everything the app says about itself matches what it now does. The Privacy Policy names the product search and says how Product photos are used, the Terms say where Products and prices come from and how sellers can have their photos removed, and the landing page says the AI picks real Products. The old spec's rules that this replaces point to the new spec.

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Pages and copy" (Landing, Privacy Policy, Terms) and "Documents". Stories 55–58 and 60.

- [ ] The Privacy Policy adds Channel3 as a recipient: it gets the Brand, Category, line and country searched, never the photo or anything about the account. It says Product photos are fetched by the app only while drawing a Preview, sent to Google with the user's photo, and never kept. It still says Workflow run data holds no images.
- [ ] The Terms say that Products, prices and links come from their sellers, that converted prices are approximate, that the app sells nothing and earns nothing from links, and that Product photos belong to their sellers, who can ask the team's email to have them removed. The sentence that each Brand links to its own website goes.
- [ ] The landing page's opening chapter says Qloo decides what to recommend and the AI picks real Products and shows them on you. The "ready to shop" chapter says each Piece names its Product, its shop and its price.
- [ ] The outfit-recommender spec's user story 96, its Piece link and generic-item rules, and its Out of Scope line on product-level shopping each get a note pointing to this spec and ADR-0008.
- [ ] Copy changes are checked by hand. Any existing test that pins the old wording is updated to the new.
