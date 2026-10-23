# Qurator: your style, curated by culture

Take one photo of yourself and get complete Outfits: a hairstyle, top, bottom and shoes, each inspired by a real Style Icon, built from real Products you can buy within your budget, and shown on you in an AI-generated Preview. Built for the Qloo Agentic Hackathon.

- **Live demo:** _<demo URL>_ (the judges' Demo Account login is shared privately)
- **License:** [MIT](LICENSE)

![Qurator architecture: the Styling Agent asks Qloo for Style Icons and their fans' Brands, then Channel3 and Gemini turn them into real Products and a Preview](docs/images/architecture.webp)

## The problem

Have you ever wanted to change your style but had no idea where to start? There are thousands of brands, endless haircuts, a new style icon every week, and trends that disappear within a month. Finding what suits you is like looking for a needle in a haystack.

Research shows 82% of the clothes in people's wardrobes go completely unworn for at least 12 months and 74% of online shoppers abandon their carts simply because they feel overwhelmed by the choices. Additionally, Millennials and Gen Z report the highest rates of clothing indecision. Constant exposure to social media and hyper-fast trend cycles forces them into a daily balancing act between personal taste and online influence, making outfit selection much harder.

Most style apps answer this with a generic AI that guesses what looks good, so they give everyone the same "smart casual" advice. We wanted recommendations grounded in what real people, in your age group and your country, actually love.

## What Qurator does

Qurator is an AI stylist. Take one photo of yourself and it builds complete Outfits: a hairstyle, a top, a bottom and shoes. Each Outfit is inspired by a real Style Icon, made from real Products you can buy within your budget, and shown on you in an AI-generated Preview.

## Why Qurator doesn't work without Qloo

**Qloo decides what we recommend. The AI only makes it concrete.** Qloo has no garment or haircut entities. Fashion only exists there as brands, and style only exists as people. So we built the whole pipeline around Qloo's taste graph:

1. **Choosing Style Icons.** We call Qloo's `/v2/insights` with `filter.type=urn:entity:person`.
   - Signals: the user's age bracket, the menswear or womenswear line, their Country, and a Photo Style. The Photo Style is one or two of Qloo's own `personal_style` tags, such as _edgy_ or _classic_, which Gemini reads from the photo.
   - Filters: occupation tags (models, singers, actors, athletes and so on), excluded tags for people who aren't famous for their look, and a high popularity floor.
   - Qloo ranks the results by affinity, and that order decides who inspires each Outfit.
2. **Choosing Brands.** For each Style Icon, we make a second `/v2/insights` call with `filter.type=urn:entity:brand`. The Style Icon goes in as `signal.interests.entities`, so Qloo returns the brands that icon's fans favour, for the same age, line and Country.
   - Qloo's own tags filter the brands: `genre:brand:fashion`, `target_age_group` so brands are age-appropriate, and `key_market` for the user's Country.
   - The Budget Tier also uses Qloo's tags: `target_income_level` plus a check on Qloo's `price_range_usd`.
   - Qloo's `product_category` tags decide which brand supplies the Top, the Bottom and the Shoes.
   - When too few usable brands come back, the query widens one step at a time.
3. **Making it real.** For each Brand Qloo picked, we search for Products sold in the user's Country, within that Brand's Qloo price range. Gemini picks the Product that best suits the user and the rest of the Outfit, adapts the Style Icon's signature cut into a hairstyle the user's own hair can achieve, and draws a Preview of the user wearing the Outfit.

**The AI never adds, swaps or re-ranks a Brand or Style Icon.** Two users with different ages, Countries or Photo Styles get different Style Icons and Brands. Without Qloo there's nothing to recommend.

**Why `/v2/insights`:** it's the one endpoint that combines demographic, location, tag and entity signals with tag filters and affinity ranking. We use it for both questions: who you could look like, and what those people's fans wear.

## How it works

1. Create an account with your date of birth (adults only), your Style Preference (menswear, womenswear or no preference) and your Country, then verify your email.
2. Agree to the photo consent notice.
3. Upload or take a photo. A Face Photo gets hairstyles, a Full-Body Photo gets the whole Outfit, and a Body-Only Photo, without your face, gets the clothes and shoes.
4. Pick a Budget Tier: No Budget, Low, Medium or Expensive. Face Photos skip this.
5. Watch a live checklist while the agent picks Style Icons, finds Brands, searches Products and draws your Previews.
6. Get your Outfits. Each one shows its Style Icon, every Piece with the reason it suits you, a price in your own currency, and a link to buy it.
7. Want more? Press **"Show 2 more Outfits"**. You can also change your Photo Style or Budget Tier to get different Style Icons and Brands.

## How we built it

- **Stack:** Next.js on Vercel, with long-running Stylings as Vercel Workflows, Neon Postgres, Vercel Blob storage and Better Auth.
- **Qloo** is called only from our server and cached for 30 days. Every call has a retry/backoff limit and a monthly backstop.
- **Google Gemini** checks the photo, reads the Photo Style, picks Products and draws Previews. It sits behind our own interface, so the model can be swapped.
- **Channel3** provides the product search.
- **Testing:** an automated test suite with fake Qloo, Gemini and Channel3 clients, so no test spends real API calls.
- **Privacy by design:** we never send Qloo anything that identifies a person. It only ever gets an age bracket, a line, a Country, style words and Qloo entity IDs. Photos are never analysed for identity, ethnicity, skin tone or body shape. Users can delete any Consultation or their whole account.
- The whole project was built during the hackathon.

## Limitations

**What the results do and don't mean**

- Results show **aggregate taste**: what people in your age bracket, line and Country tend to like, according to Qloo's data. They don't predict what _you_ will like.
- A Style Icon's Brands are the brands **their fans favour** on Qloo. That doesn't mean the Style Icon wears, endorses or is linked to those brands.
- A hairstyle is _inspired by_ the Style Icon's signature cut and adapted to your hair. It isn't a copy of their actual haircut. When Gemini doesn't know the cut, the Outfit says so.
- Previews are AI images that show roughly how an Outfit could look. They aren't a fit or sizing guarantee.

**Limits of Qloo's data**

- Qloo has no garment or haircut data, so the specific Products come from a product search, not from Qloo.
- Budget Tiers are based on Qloo's brand-level income tags and USD price ranges, which are only a proxy for real prices. A Low Brand can still sell an expensive item. We keep each Product within its Brand's Qloo price range to limit this.
- Qloo's product tags are coarse. Denim is the only signal for a brand that makes bottoms.
- The high popularity floor makes the recommendations lean towards mainstream brands and famous people. Niche and independent labels rarely appear.
- The Photo Style comes from a fixed list of 11 Qloo style words, so subtler styles get flattened into the closest word.

**Product and pricing limits**

- Some Brands Qloo picks can't be found in the product search, so they're skipped. That can leave fewer Brands for some Countries.
- Prices and stock come from sellers. Converted prices are approximate, they refresh at most once a day, and a Product can sell out.

**Deliberate design choices**

- We don't analyse skin tone or body shape, so there's no colour-season or body-type advice. Users get privacy and less personalisation.
- Adults only, because of Gemini's terms. Only Countries where Gemini is available. English only.
- Each Styling makes 2 Outfits, with a limit of 10 Outfits per user per day to control costs.
- Servers run in Washington DC, so users in Asia will see slightly slower page loads.

## Run it locally

Needs Node.js 22 or later and your own Qloo hackathon API key.

```bash
npm install
cp .env.example .env.local   # then set QLOO_API_URL and QLOO_API_KEY
npm run dev
```

Out of the box, local development uses an on-disk database, a fake AI and a fake product search, so only Qloo is real. Emails are written to `.data/inbox` instead of being sent, so open the verification link from there. To use real Gemini or Channel3, see [.env.example](.env.example).

Tests: `npm test`, `npm run typecheck` and `npm run test:e2e`. The team's operations guide (Demo Account, daily sweep, team scripts) is in [docs/operations.md](docs/operations.md).

## Credits

The people in the landing page's sample Consultations are AI-generated images from [Pixabay](https://pixabay.com), used under the Pixabay Content License.
