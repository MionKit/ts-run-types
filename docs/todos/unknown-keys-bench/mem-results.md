
## retained bytes per stripped object (200k objects, settled heap)

| variant | clean | dirty1 | dirty5 |
|---|---|---|---|
| baseline | 144 B | 160 B | 200 B |
| suk | 144 B | 960 B | 1344 B |
| uku | 144 B | 160 B | 200 B |
| clone | 144 B | 144 B | 144 B |

## GC churn over 2M ops (fresh input each op, results not retained)

| variant | profile | ops/s | GC events (minor) | GC ms total | GC ms per 1M ops |
|---|---|---|---|---|---|
| baseline | clean | 94.0 M | 278 (277) | 8.5 | 4.3 |
| baseline | dirty1 | 86.2 M | 309 (308) | 9.3 | 4.7 |
| suk | clean | 21.1 M | 278 (277) | 9 | 4.5 |
| suk | dirty1 | 2.7 M | 1596 (1593) | 44.7 | 22.3 |
| uku | clean | 21.3 M | 278 (277) | 9 | 4.5 |
| uku | dirty1 | 12.3 M | 1016 (1013) | 29.1 | 14.6 |
| clone | clean | 48.9 M | 554 (553) | 15.6 | 7.8 |
| clone | dirty1 | 47.2 M | 584 (583) | 16.4 | 8.2 |
