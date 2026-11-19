# Market Meadow

Market Meadow is a small multiplayer market chat. Guests choose a name, color,
and crayon-style girl or boy avatar, then explore a hand-drawn fruit and
vegetable market together.

Visitors can wander and chat. Sellers can list their produce and prices and
receive an open stand while online. When all existing stands are occupied, the
market adds another row. Chat messages are stored in Supabase; player positions
and stand reservations are temporary.

Girl and boy avatars have distinct original outfits, hairstyles, and bold
storybook outlines. Their feet animate while walking. Hens, a rooster, and a
chick wander along clear paths through the market.

## Run the application

You need Node.js 18 or later. Copy `.env.example` to `.env` and set your
Supabase project URL and publishable (or legacy anon) key, then run:

```bash
npm install
npm start
```

`npm start` builds the browser client and starts the server at
`http://localhost:3000`. Keep the terminal open while using the application.
Press `Ctrl+C` to stop the server.

Open `http://localhost:3000` in a browser. Use arrow keys or `W`, `A`, `S`, and
`D` to move on desktop. Touch users can use the on-screen direction pad.

Run the focused market-world tests with:

```bash
npm test
```

## Supabase setup

1. In the Supabase dashboard, open the project's SQL Editor.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) to create the `messages`
   table and its public read/insert policies.
3. Set the project URL and publishable/anon key in `.env`:

   ```text
   SUPABASE_URL=https://lqlihebdwvhhejbkhewz.supabase.co
   SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

Do not put a service-role key in `.env`. The SQL allows unauthenticated reads
and inserts, so anyone who can reach the app can post a message. Update and
delete access are not granted. The server keeps the key and sends chat messages
to Supabase through its REST API.

## Multiplayer behavior

The Node server coordinates guests over `/ws`. Names, roles, colors, avatar
choices, movement, and seller stands exist only while connected. A seller's
stand is released when they leave or the server restarts; stands are reused
before new rows are added. Product names and prices are labels only—there is no
checkout or payment feature.

This guest coordination uses the in-memory state of one Node server process.
For a multi-instance deployment, replace it with a shared realtime service or
shared session store so guests connected to different instances can see one
another.

## Project structure

```text
.
├── market-world.js           # Shared map geometry and collision rules
├── public/
│   ├── app.js                # Market UI, movement, drawing, and chat client
│   ├── index.html            # Join form and game layout
│   └── style.css             # Responsive styling
├── supabase/
│   └── schema.sql            # Message table and row-level security policies
├── test/
│   └── market-world.test.js  # Map collision and stand tests
├── .env.example              # Supabase environment variable template
├── package-lock.json         # Locked dependency versions
├── package.json              # Scripts and dependencies
└── server.js                 # HTTP API and multiplayer WebSocket server
```
