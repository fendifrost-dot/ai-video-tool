#!/bin/bash
# usage: rrun.sh shape impl n reps -> median rss / heap+ext
D=/tmp/claude-0/deno/bin/deno
$D run -A server.ts $1 > /tmp/claude-0/dbench/server.log 2>&1 & SP=$!
for i in $(seq 1 50); do grep -q ready /tmp/claude-0/dbench/server.log && break; sleep 0.2; done
for r in $(seq 1 $4); do $D run -A --v8-flags=--expose-gc rbench.ts $2 $3 ${5:-bytes} 2>&1 | grep '^{"impl'; done | python3 -c "
import json,sys,statistics as st; rows=[json.loads(l) for l in sys.stdin]
print('$1', '$2', 'refs=$3', '${5:-bytes}', 'ok=%s'%all(r['ok'] for r in rows), 'errs=%s'%set(r['err'] for r in rows), 'median rss +%.1f MB (max %.1f)'%(st.median(r['rss'] for r in rows), max(r['rss'] for r in rows)), 'median heap+ext +%.1f MB (max %.1f)'%(st.median(r['he'] for r in rows), max(r['he'] for r in rows)))"
kill $SP 2>/dev/null; wait $SP 2>/dev/null
