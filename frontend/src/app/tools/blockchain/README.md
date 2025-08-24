The idea

A block is just a little record with:

Data (whatever you type)

Prev Hash (the fingerprint of the previous block)

Nonce (a number we can change)

Hash (the fingerprint of this block)

Blocks point to the one before via Prev Hash, so they form a chain.
If you change one block, all blocks after it break.

What “hash” means here

The app makes a fingerprint (SHA-256) from:

index | timestamp | data | prevHash | nonce


If you change any of those, the fingerprint (hash) changes completely.

What “difficulty” & “mining” mean

A block is considered valid only if its hash starts with N zeros (N = the difficulty slider).

Mining = trying different nonce values until the hash starts with those zeros.

Each extra zero makes it ~16× harder (because hashes are in hex: 0–f).

What the buttons do

Difficulty — sets how many leading zeros the hash must have.

Mine — keeps bumping the nonce until the block’s hash meets the difficulty.

Stop — stops mining.

Add Block — adds a new block that points to the previous one (you’ll need to mine it).

Data / Nonce inputs — when you edit these, the block’s hash changes immediately.

Why the chain says “Invalid”

For the whole chain to be valid:

Every block’s hash must start with the right number of zeros (difficulty).

Each block’s Prev Hash must equal the actual hash of the block before it.

If you edit a block’s data, its hash changes → then the next block’s Prev Hash no longer matches → the chain becomes invalid until you re-mine the changed block and all blocks after it.

A quick demo to feel it

Set Difficulty = 2 (easy).

Click Mine on Block #0 (Genesis), then on Block #1.
Chain status should turn Valid.

Change the Data in Block #0.
→ Watch both blocks flip to not valid.
→ Re-mine Block #0, then Block #1 to fix the chain.

Click Add Block, then Mine the new block.