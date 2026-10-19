# Everything stays in Washington DC

The functions, the Neon database and the Blob store all run in Washington DC (`iad1`), and they stay there together. Production's metrics showed what splitting them costs: the proxy that renewed sign-ins ran in the region nearest the visitor, which for the team is Singapore (`sin1`), so each signed-in page change waited about 450 ms at the median on a database read across the Pacific, against 20–30 ms when the proxy ran in US regions. Once warm, the page functions next to the database answered in about 10 ms. So the proxy is gone, and the sign-in renews through a background request to an ordinary function in Washington DC. A user in Asia still crosses the Pacific once per page change, to reach the functions, but never waits on the database from the far side.

## Considered Options

- **Move all of it to Singapore**: closer for the team, but it needs a new Neon project and a data migration just before judging, and we don't know where the judges are.
- **Move only the functions**: every database query would then cross the Pacific, which is exactly what made the proxy slow.
- **Upgrade Neon**: a paid plan only stops the database sleeping after 5 idle minutes, a separate slowness that doesn't change where anything runs, and is out of scope here.

## Consequences

- Users in Asia pay one trip across the Pacific per page change.
- Nothing that queries the database per request may run in another region: no proxy, nothing at the edge, and no functions moved without the database. That is why the proxy is gone.
- Revisit if the judges or users turn out to be mostly in Asia.
