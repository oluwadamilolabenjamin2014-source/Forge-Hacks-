/**
 * Code-writing surface.
 *
 * A reviewable template library plus an entity extractor. Every generated artifact is
 * real, runnable code — no placeholders — and is tagged with the assumptions Forge
 * made so a human can audit them. Templates are deliberately explicit: the local engine
 * must be able to produce the same file twice (determinism), which a sampler cannot.
 */

export const LANGUAGES = [
  { id: 'python', label: 'Python', ext: 'py', runner: 'python3', alias: ['python', 'py', 'python3'] },
  { id: 'javascript', label: 'JavaScript', ext: 'js', runner: 'node', alias: ['javascript', 'js', 'node', 'nodejs'] },
  { id: 'typescript', label: 'TypeScript', ext: 'ts', runner: 'tsx', alias: ['typescript', 'ts'] },
  { id: 'sql', label: 'SQL', ext: 'sql', runner: 'sqlite3', alias: ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite'] },
  { id: 'bash', label: 'Bash', ext: 'sh', runner: 'bash', alias: ['bash', 'shell', 'sh', 'zsh'] },
  { id: 'html', label: 'HTML/CSS/JS', ext: 'html', runner: 'browser', alias: ['html', 'css', 'webpage', 'landing page'] },
  { id: 'go', label: 'Go', ext: 'go', runner: 'go run', alias: ['go', 'golang'] },
  { id: 'rust', label: 'Rust', ext: 'rs', runner: 'cargo', alias: ['rust', 'cargo'] },
];

export function detectLanguage(prompt, fallback = 'python') {
  const t = String(prompt).toLowerCase();
  const explicit = t.match(/\b(?:in|using|with|write it in)\s+([a-z#+]{2,12})\b/);
  if (explicit) {
    const hit = LANGUAGES.find((l) => l.alias.includes(explicit[1]) || l.id === explicit[1]);
    if (hit) return hit.id;
  }
  for (const lang of LANGUAGES) if (lang.alias.some((a) => t.includes(a))) return lang.id;
  if (/component|react|jsx/.test(t)) return 'javascript';
  if (/select .* from|create table|index on/.test(t)) return 'sql';
  return fallback;
}

export function detectIntent(prompt) {
  const t = String(prompt).toLowerCase();
  if (/\b(unit tests?|pytest|unittest|jest|test suite|write tests?|test cases?)\b/.test(t)) return 'tests';
  if (/\b(rest api|endpoint|http server|fastapi|flask|express route|crud api|webhook)\b/.test(t)) return 'api';
  if (/\b(scrape|scraper|crawl)\b/.test(t)) return 'scraper';
  if (/\b(csv|excel|spreadsheet|dataframe|pandas|clean the data)\b/.test(t)) return 'data';
  if (/\b(react|component|hook|jsx|tsx)\b/.test(t)) return 'component';
  if (/\b(sql|query|schema|table|database|migration|join)\b/.test(t)) return 'sql';
  if (/\b(cli|command line|argparse|argv|terminal tool)\b/.test(t)) return 'cli';
  if (/\b(regex|regular expression|pattern match)\b/.test(t)) return 'regex';
  if (/\b(validate|validation|sanitize|parse an? (?:email|url|phone))\b/.test(t)) return 'validation';
  if (/\b(class|object|oop|dataclass)\b/.test(t)) return 'class';
  if (/\b(algorithm|complexity|sort|search|fibonacci|prime|graph|dynamic programming)\b/.test(t)) return 'algorithm';
  if (/\b(docker|dockerfile|container|docker-compose)\b/.test(t)) return 'docker';
  if (/\b(chart|plot|visuali[sz]e|graph the)\b/.test(t)) return 'chart';
  if (/\b(async|concurrent|parallel|thread|await)\b/.test(t)) return 'async';
  return 'function';
}

export function extractIdentifiers(prompt) {
  const t = String(prompt);
  const name =
    t.match(/`([a-z_][a-z0-9_]*\(\))`/i)?.[1]?.replace('()', '') ||
    t.match(/\b(?:function|method|class|def|module|script|endpoint|route)\s+(?:called|named|is)?\s*[`"']?([a-zA-Z_][a-zA-Z0-9_]*)`?/i)?.[1] ||
    t.match(/\b(?:called|named)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)`?/i)?.[1] ||
    null;
  const snake = name ? toSnake(name) : null;
  const camel = name ? toCamel(name) : null;
  const pascal = name ? toPascal(name) : null;
  const described = t.match(/\b(?:that|which|to)\s+([a-z][a-z0-9 ,'"-]{8,120})/i)?.[1]?.trim().replace(/[.!]$/, '') || null;
  const fields = [
    ...t.matchAll(/\b(?:fields?|columns?|properties|attributes)\s*(?:are|of|:)?\s*([a-z0-9_,\s]+)/gi),
  ]
    .flatMap((m) => m[1].split(/,|\band\b/))
    .map((s) => toSnake(s.trim()))
    .filter((s) => s && s.length < 24 && /^[a-z][a-z0-9_]*$/.test(s))
    .slice(0, 12);
  const numbers = [...t.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1])).slice(0, 4);
  return { raw: name, snake, camel, pascal, described, fields, numbers };
}

export const toSnake = (s) =>
  String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
export const toCamel = (s) => {
  const p = toSnake(s).split('_').filter(Boolean);
  return p.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
};
export const toPascal = (s) => {
  const c = toCamel(s);
  return c ? c[0].toUpperCase() + c.slice(1) : c;
};

const ALGOS = {
  fibonacci: {
    keywords: ['fibonacci', 'fib'],
    python: `def fibonacci(n: int, memo: dict[int, int] | None = None) -> int:
    """Return the n-th Fibonacci number (0-indexed, F(0)=0, F(1)=1).

    Iterative + memoised so it stays O(n) time / O(1) space for large n.
    """
    if n < 0:
        raise ValueError("n must be >= 0")
    if n < 2:
        return n
    prev, curr = 0, 1
    for _ in range(2, n + 1):
        prev, curr = curr, prev + curr
    return curr`,
    javascript: `export function fibonacci(n) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a non-negative integer');
  if (n < 2) return n;
  let prev = 0, curr = 1;
  for (let i = 2; i <= n; i += 1) [prev, curr] = [curr, prev + curr];
  return curr;
}`,
  },
  primes: {
    keywords: ['prime', 'sieve', 'eratosthenes'],
    python: `def primes_up_to(limit: int) -> list[int]:
    """Sieve of Eratosthenes — every prime <= limit. O(n log log n)."""
    if limit < 2:
        return []
    sieve = bytearray([1]) * (limit + 1)
    sieve[0:2] = b"\\x00\\x00"
    for p in range(2, int(limit ** 0.5) + 1):
        if sieve[p]:
            sieve[p * p :: p] = bytearray(len(sieve[p * p :: p]))
    return [i for i, is_prime in enumerate(sieve) if is_prime]`,
    javascript: `export function primesUpTo(limit) {
  if (limit < 2) return [];
  const sieve = new Uint8Array(limit + 1).fill(1);
  sieve[0] = 0; sieve[1] = 0;
  for (let p = 2; p * p <= limit; p += 1) {
    if (sieve[p]) for (let m = p * p; m <= limit; m += p) sieve[m] = 0;
  }
  return [...sieve.entries()].filter(([, isPrime]) => isPrime).map(([i]) => i);
}`,
  },
  quicksort: {
    keywords: ['quicksort', 'quick sort', 'sort an array', 'sorting algorithm'],
    python: `def quicksort(items: list, lo: int = 0, hi: int | None = None) -> list:
    """In-place 3-way-ish quicksort with median-of-three pivot. Returns the same list."""
    if hi is None:
        hi = len(items) - 1
    while lo < hi:
        if hi - lo < 16:                      # insertion sort on tiny ranges
            for i in range(lo + 1, hi + 1):
                key, j = items[i], i - 1
                while j >= lo and items[j] > key:
                    items[j + 1] = items[j]
                    j -= 1
                items[j + 1] = key
            return items
        mid = (lo + hi) // 2
        pivot = sorted([items[lo], items[mid], items[hi]])[1]
        i, j = lo, hi
        while i <= j:
            while items[i] < pivot:
                i += 1
            while items[j] > pivot:
                j -= 1
            if i <= j:
                items[i], items[j] = items[j], items[i]
                i, j = i + 1, j - 1
        if j - lo < hi - i:                   # recurse into the smaller half first
            quicksort(items, lo, j)
            lo = i
        else:
            quicksort(items, i, hi)
            hi = j
    return items`,
    javascript: `export function quicksort(items, lo = 0, hi = items.length - 1) {
  while (lo < hi) {
    if (hi - lo < 16) {
      for (let i = lo + 1; i <= hi; i += 1) {
        const key = items[i];
        let j = i - 1;
        while (j >= lo && items[j] > key) { items[j + 1] = items[j]; j -= 1; }
        items[j + 1] = key;
      }
      return items;
    }
    const mid = (lo + hi) >> 1;
    const pivot = [items[lo], items[mid], items[hi]].sort((a, b) => a - b)[1];
    let i = lo, j = hi;
    while (i <= j) {
      while (items[i] < pivot) i += 1;
      while (items[j] > pivot) j -= 1;
      if (i <= j) { [items[i], items[j]] = [items[j], items[i]]; i += 1; j -= 1; }
    }
    if (j - lo < hi - i) { quicksort(items, lo, j); lo = i; } else { quicksort(items, i, hi); hi = j; }
  }
  return items;
}`,
  },
  'binary search': {
    keywords: ['binary search', 'bisect', 'search a sorted'],
    python: `def binary_search(sorted_items: list, target) -> int:
    """Return the index of target, or -1. O(log n) — array must be sorted ascending."""
    lo, hi = 0, len(sorted_items) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if sorted_items[mid] == target:
            return mid
        if sorted_items[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
    javascript: `export function binarySearch(sortedItems, target, compare = (a, b) => a - b) {
  let lo = 0, hi = sortedItems.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = compare(sortedItems[mid], target);
    if (cmp === 0) return mid;
    if (cmp < 0) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}`,
  },
  'two sum': {
    keywords: ['two sum', 'pair that sums', 'two-sum'],
    python: `def two_sum(nums: list[int], target: int) -> tuple[int, int] | None:
    """Indices of the two numbers adding up to target. O(n) time, O(n) space."""
    seen: dict[int, int] = {}
    for i, value in enumerate(nums):
        if target - value in seen:
            return seen[target - value], i
        seen[value] = i
    return None`,
    javascript: `export function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i += 1) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return null;
}`,
  },
  'lru cache': {
    keywords: ['lru cache', 'lru-cache', 'least recently used', 'cache with eviction'],
    python: `from collections import OrderedDict
from typing import Any


class LRUCache:
    """O(1) get/put with least-recently-used eviction."""

    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._data: OrderedDict[Any, Any] = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get(self, key: Any) -> Any | None:
        if key not in self._data:
            self.misses += 1
            return None
        self._data.move_to_end(key)
        self.hits += 1
        return self._data[key]

    def put(self, key: Any, value: Any) -> None:
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        if len(self._data) > self.capacity:
            self._data.popitem(last=False)

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total else 0.0`,
    javascript: `export class LRUCache {
  constructor(capacity) {
    if (capacity <= 0) throw new RangeError('capacity must be positive');
    this.capacity = capacity;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  get(key) {
    if (!this.map.has(key)) { this.misses += 1; return undefined; }
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    this.hits += 1;
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
  }
  get hitRate() { const t = this.hits + this.misses; return t ? this.hits / t : 0; }
}`,
  },
  levenshtein: {
    keywords: ['levenshtein', 'edit distance', 'fuzzy match'],
    python: `def levenshtein(a: str, b: str) -> int:
    """Edit distance with a single rolling row — O(len(a)*len(b)) time, O(min) space."""
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]`,
    javascript: `export function levenshtein(a, b) {
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}`,
  },
  'fizz buzz': {
    keywords: ['fizzbuzz', 'fizz buzz'],
    python: `def fizzbuzz(n: int) -> list[str]:
    """Classic FizzBuzz, 1..n inclusive."""
    out = []
    for i in range(1, n + 1):
        word = ("Fizz" if i % 3 == 0 else "") + ("Buzz" if i % 5 == 0 else "")
        out.append(word or str(i))
    return out`,
    javascript: `export function fizzbuzz(n) {
  return Array.from({ length: n }, (_, i) => {
    const v = i + 1;
    const word = (v % 3 ? '' : 'Fizz') + (v % 5 ? '' : 'Buzz');
    return word || String(v);
  });
}`,
  },
};

export function pickAlgorithm(prompt) {
  const t = String(prompt).toLowerCase();
  for (const [key, algo] of Object.entries(ALGOS)) {
    if (algo.keywords.some((k) => t.includes(k))) return { key, ...algo };
  }
  return null;
}

const TEST_TEMPLATES = {
  python: (name, samples) => `import pytest

from ${name} import ${samples.entry}


class Test${toPascal(name)}:
    def test_happy_path(self):
        assert ${samples.happyAssert}

    def test_edge_case(self):
        assert ${samples.edgeAssert}

    @pytest.mark.parametrize("value,expected", ${samples.param})
    def test_table(self, value, expected):
        assert ${samples.entry}(value) == expected

    def test_invalid_input(self):
        with pytest.raises((ValueError, TypeError)):
            ${samples.entry}(${samples.badInput})
`,
  javascript: (name, samples) => `import { describe, it, expect } from 'vitest';
import { ${samples.entry} } from './${name}.js';

describe('${samples.entry}', () => {
  it('handles the happy path', () => {
    expect(${samples.entry}(${samples.happyInput})).${samples.happyAssert};
  });

  it('handles edge cases', () => {
    expect(${samples.entry}(${samples.edgeInput})).${samples.edgeAssert};
  });

  it('rejects invalid input', () => {
    expect(() => ${samples.entry}(${samples.badInput})).toThrow();
  });
});
`,
};

const SAMPLES = {
  fibonacci: { entry: 'fibonacci', happyAssert: 'fibonacci(10) == 55', edgeAssert: 'fibonacci(0) == 0 and fibonacci(1) == 1', param: '[(5, 5), (7, 13), (30, 832040)]', badInput: '-1', happyInput: '10, 55', edgeInput: '0, 0', },
  primes: { entry: 'primes_up_to', happyAssert: 'primes_up_to(10) == [2, 3, 5, 7]', edgeAssert: 'primes_up_to(1) == []', param: '[(2, [2]), (20, [2, 3, 5, 7, 11, 13, 17, 19])]', badInput: '-5', happyInput: '10, [2,3,5,7]', edgeInput: '1, []' },
  quicksort: { entry: 'quicksort', happyAssert: 'quicksort([3, 1, 2]) == [1, 2, 3]', edgeAssert: 'quicksort([]) == []', param: '[[1], [1, 1, 1], [5, 4, 3, 2, 1]]', badInput: 'None', happyInput: '[3, 1, 2], [1, 2, 3]', edgeInput: '[], []' },
  default: { entry: 'solve', happyAssert: 'solve(1) == 1', edgeAssert: 'solve(0) == 0', param: '[(1, 1), (2, 2)]', badInput: 'None', happyInput: '1, 1', edgeInput: '0, 0' },
};

/** Baseline test scaffolding for a generated module. */
export function testsFor(language, moduleName, algorithmKey = null) {
  const samples = SAMPLES[algorithmKey] || { ...SAMPLES.default, entry: toSnake(moduleName) || 'solve' };
  const tpl = TEST_TEMPLATES[language] || TEST_TEMPLATES.python;
  return tpl(toSnake(moduleName) || 'module', samples);
}

export const ALGORITHM_KEYS = Object.keys(ALGOS);

/** Full module assemblers used by the local engine. */
export function buildModule({ language, intent, prompt, ids }) {
  const algo = pickAlgorithm(prompt);
  const name = ids.snake || algo?.key?.replace(/\s+/g, '_') || 'solution';
  const described = ids.described || 'the requested behaviour';

  if (intent === 'algorithm' || algo) {
    const key = algo?.key || 'default';
    const code = algo ? algo[language] || algo.python : genericFunction(language, ids);
    return {
      language,
      filename: `${toSnake(key.replace(/\s+/g, '_'))}.${extFor(language)}`,
      code,
      assumptions: [
        `Target language: ${language} (detected from the prompt).`,
        algo ? `Algorithm matched: ${key}.` : 'No named algorithm detected — generated a documented baseline.',
      ],
      notes: [
        'Complexity is documented in the docstring so reviewers can check it against the spec.',
        'Pure function: no I/O, so it is trivially testable.',
      ],
      run: language === 'python' ? `python3 -c "from ${toSnake(key.replace(/\s+/g, '_'))} import *; print('ok')"` : `node --input-type=module -e "import('./${toSnake(key.replace(/\s+/g, '_'))}.js').then(() => console.log('ok'))"`,
      algorithmKey: key,
    };
  }

  if (intent === 'validation') {
    return {
      language,
      filename: language === 'python' ? 'validators.py' : 'validators.js',
      code: language === 'python' ? PY_VALIDATORS : JS_VALIDATORS,
      assumptions: ['Inputs arrive as strings; validation is pure (no network calls).', 'Rules follow RFC 5322 (email) and RFC 3986 (URL) basics, not the full grammars.'],
      notes: ['Each validator returns a structured result instead of raising, so callers can surface messages.'],
      run: 'python3 -m doctest -v validators.py',
    };
  }

  if (intent === 'api') {
    return apiTemplate(language, ids);
  }

  if (intent === 'cli') {
    return cliTemplate(language, ids);
  }

  if (intent === 'regex') {
    return {
      language,
      filename: 'patterns.py',
      code: PY_REGEX,
      assumptions: ['Patterns are compiled once at import time for reuse.'],
      notes: ['Every pattern ships with positive and negative examples in the doctest.'],
      run: 'python3 -m doctest -v patterns.py',
    };
  }

  if (intent === 'sql') {
    return {
      language: 'sql',
      filename: 'schema.sql',
      code: SQL_SCHEMA,
      assumptions: ['PostgreSQL-flavoured SQL; identifiers are snake_case.', 'Timestamps are stored as UTC.'],
      notes: ['Foreign keys cascade on delete so orphan rows cannot accumulate.', 'Indexes cover the foreign keys and the most common filter column.'],
      run: 'psql -f schema.sql',
    };
  }

  if (intent === 'component') {
    return {
      language: 'javascript',
      filename: `${toPascal(ids.raw || 'DataTable')}.jsx`,
      code: REACT_COMPONENT(toPascal(ids.raw || 'DataTable'), ids.fields.length ? ids.fields : ['id', 'name', 'status', 'updatedAt']),
      assumptions: ['React 18 function component + hooks; no external UI library.', 'Data is passed in as a prop — the component does no fetching.'],
      notes: ['Sorting, filtering and empty states are handled locally.', 'Keys come from the `id` field; add one if your data lacks it.'],
      run: 'npm create vite@latest my-app -- --template react && copy the file into src/',
    };
  }

  if (intent === 'data') {
    return {
      language: 'python',
      filename: 'pipeline.py',
      code: PY_DATA_PIPELINE,
      assumptions: ['Input CSV has a header row and UTF-8 encoding.', 'Numeric parsing failures are reported, not silently dropped.'],
      notes: ['Streaming-ish: memory scales with the file, not with a copy of it.'],
      run: 'python3 pipeline.py data.csv --report',
    };
  }

  if (intent === 'scraper') {
    return {
      language: 'python',
      filename: 'scraper.py',
      code: PY_SCRAPER,
      assumptions: ['The sandbox has no network access; run this outside the sandbox.', 'robots.txt is respected: the crawler refuses disallowed paths.'],
      notes: ['Polite by default: 1 request/second, retries with exponential backoff, custom User-Agent.'],
      run: 'python3 scraper.py https://example.com --out out.json',
    };
  }

  if (intent === 'tests') {
    const target = ids.snake || 'solution';
    return {
      language,
      filename: language === 'javascript' ? `${target}.test.js` : `test_${target}.py`,
      code: testsFor(language === 'javascript' ? 'javascript' : 'python', target, pickAlgorithm(prompt)?.key),
      assumptions: [`The module under test exposes \`${target}\` from ./${target}.`],
      notes: ['Covers happy path, edge case and invalid input — the three cases that catch most regressions.'],
      run: language === 'javascript' ? 'npx vitest run' : 'pytest -q',
    };
  }

  if (intent === 'docker') {
    return {
      language: 'bash',
      filename: 'Dockerfile',
      code: DOCKERFILE,
      assumptions: ['Node 22 Alpine base; the app listens on PORT (default 3000).'],
      notes: ['Multi-stage build, non-root user, `npm ci` for reproducible installs, healthcheck included.'],
      run: 'docker build -t my-app . && docker run -p 3000:3000 my-app',
    };
  }

  if (intent === 'async') {
    return {
      language,
      filename: language === 'python' ? 'concurrency.py' : 'concurrency.js',
      code: language === 'python' ? PY_ASYNC : JS_ASYNC,
      assumptions: ['Tasks are independent — no shared mutable state between them.'],
      notes: ['Concurrency is bounded so a large batch cannot exhaust file descriptors or rate limits.'],
      run: language === 'python' ? 'python3 concurrency.py' : 'node concurrency.js',
    };
  }

  return {
    language,
    filename: `${name}.${extFor(language)}`,
    code: genericFunction(language, ids),
    assumptions: [`Function name taken from the prompt as \`${name}\`.`, `Behaviour interpreted as: ${described}.`],
    notes: ['Includes input validation, a docstring and a doctest/example so the contract is explicit.', 'Swap the body for your domain logic — the shape stays the same.'],
    run: language === 'python' ? `python3 -m doctest -v ${name}.py` : `node ${name}.js`,
  };
}

const extFor = (lang) => LANGUAGES.find((l) => l.id === lang)?.ext || 'txt';

function genericFunction(language, ids) {
  const py = ids.snake || 'process_items';
  const js = ids.camel || toCamel(py);
  if (language === 'python') {
    return `"""${py}: generated baseline. Replace the marked body with domain logic."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Result:
    ok: bool
    value: object = None
    reason: str | None = None


def ${py}(items, *, allow_empty: bool = False) -> Result:
    """Validate, then transform \`items\`.

    >>> ${py}([1, 2, 3]).value
    6
    >>> ${py}([], allow_empty=True).ok
    True
    >>> ${py}([]).reason
    'empty input is not allowed'
    """
    if items is None:
        return Result(False, reason="items must be an iterable")
    items = list(items)
    if not items and not allow_empty:
        return Result(False, reason="empty input is not allowed")

    total = sum(items)          # <-- domain logic goes here

    return Result(True, value=total)


if __name__ == "__main__":
    print(${py}([1, 2, 3]))
`;
  }
  if (language === 'typescript') {
    return `export interface Result<T> { ok: boolean; value?: T; reason?: string }

/**
 * ${js}: generated baseline. Replace the marked block with domain logic.
 */
export function ${js}(items: number[], options: { allowEmpty?: boolean } = {}): Result<number> {
  if (!Array.isArray(items)) return { ok: false, reason: 'items must be an array' };
  if (items.length === 0 && !options.allowEmpty) return { ok: false, reason: 'empty input is not allowed' };

  const total = items.reduce((sum, n) => sum + n, 0); // <-- domain logic goes here

  return { ok: true, value: total };
}
`;
  }
  return `/**
 * ${js}: generated baseline. Replace the marked block with domain logic.
 */
export function ${js}(items, { allowEmpty = false } = {}) {
  if (!Array.isArray(items)) return { ok: false, reason: 'items must be an array' };
  if (items.length === 0 && !allowEmpty) return { ok: false, reason: 'empty input is not allowed' };

  const total = items.reduce((sum, n) => sum + n, 0); // <-- domain logic goes here

  return { ok: true, value: total };
}

if (process.argv[1]?.endsWith('${js}.js')) {
  console.log(${js}([1, 2, 3]));
}
`;
}

const PY_VALIDATORS = `"""Pure input validators — no I/O, no network, deterministic."""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$")
URL_RE = re.compile(r"^https?://[^\\s/$.?#].[^\\s]*$", re.IGNORECASE)
PHONE_RE = re.compile(r"^\\+?\\d{1,3}[\\s.-]?\\(?\\d{2,4}\\)?[\\s.-]?\\d{3,4}[\\s.-]?\\d{3,4}$")


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    value: str
    reason: str | None = None


def validate_email(address: str) -> ValidationResult:
    """Basic RFC 5322 shape check (not a full grammar).

    >>> validate_email("ada@example.com").ok
    True
    >>> validate_email("ada@example").ok
    False
    >>> validate_email("Ada <ada@example.com>").ok
    False
    """
    value = (address or "").strip()
    if not value:
        return ValidationResult(False, value, "email is required")
    if len(value) > 254:
        return ValidationResult(False, value, "email exceeds 254 characters")
    if not EMAIL_RE.match(value):
        return ValidationResult(False, value, "email failed the shape check")
    local, _, domain = value.partition("@")
    if domain.startswith("-") or domain.endswith("-") or ".." in domain:
        return ValidationResult(False, value, "invalid domain label")
    return ValidationResult(True, value.lower())


def validate_url(url: str, *, allow_private_hosts: bool = False) -> ValidationResult:
    """
    >>> validate_url("https://forge.dev/docs").ok
    True
    >>> validate_url("ftp://forge.dev").reason
    'only http(s) URLs are supported'
    """
    value = (url or "").strip()
    if not value:
        return ValidationResult(False, value, "url is required")
    if not URL_RE.match(value) or not value.lower().startswith(("http://", "https://")):
        return ValidationResult(False, value, "only http(s) URLs are supported")
    host = value.split("//", 1)[1].split("/", 1)[0].split(":", 1)[0]
    try:
        ip = ipaddress.ip_address(host)
        if (ip.is_private or ip.is_loopback) and not allow_private_hosts:
            return ValidationResult(False, value, "private/loopback hosts are blocked (SSRF guard)")
    except ValueError:
        pass
    return ValidationResult(True, value)


def validate_phone(number: str, *, default_country_code: str = "+1") -> ValidationResult:
    """
    >>> validate_phone("+254 712 345 678").ok
    True
    >>> validate_phone("not-a-phone").ok
    False
    """
    value = (number or "").strip()
    digits = re.sub(r"\\D", "", value)
    if not PHONE_RE.match(value) or not 7 <= len(digits) <= 15:
        return ValidationResult(False, value, "phone number must have 7-15 digits")
    if not value.startswith("+"):
        value = f"{default_country_code} {value}"
    return ValidationResult(True, value)
`;

const JS_VALIDATORS = `/** Pure input validators — deterministic, no network. */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$/;
const URL_RE = /^https?:\\/\\/[^\\s/$.?#].[^\\s]*$/i;

export function validateEmail(address) {
  const value = String(address ?? '').trim();
  if (!value) return { ok: false, value, reason: 'email is required' };
  if (value.length > 254) return { ok: false, value, reason: 'email exceeds 254 characters' };
  if (!EMAIL_RE.test(value)) return { ok: false, value, reason: 'email failed the shape check' };
  const [, domain = ''] = value.split('@');
  if (domain.startsWith('-') || domain.endsWith('-') || domain.includes('..')) {
    return { ok: false, value, reason: 'invalid domain label' };
  }
  return { ok: true, value: value.toLowerCase() };
}

export function validateUrl(url, { allowPrivateHosts = false } = {}) {
  const value = String(url ?? '').trim();
  if (!value) return { ok: false, value, reason: 'url is required' };
  if (!URL_RE.test(value)) return { ok: false, value, reason: 'only http(s) URLs are supported' };
  const host = value.split('//')[1].split('/')[0].split(':')[0];
  const isPrivate = /^(localhost|127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/.test(host);
  if (isPrivate && !allowPrivateHosts) {
    return { ok: false, value, reason: 'private/loopback hosts are blocked (SSRF guard)' };
  }
  return { ok: true, value };
}
`;

const PY_REGEX = `"""Reusable, compiled regular expressions with worked examples."""

from __future__ import annotations

import re

PATTERNS = {
    "iso_date": re.compile(r"\\b(\\d{4})-(0[1-9]|1[0-2])-([0-2]\\d|3[01])\\b"),
    "us_phone": re.compile(r"\\(?\\d{3}\\)?[ .-]?\\d{3}[ .-]?\\d{4}"),
    "slug": re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
    "semver": re.compile(r"^(?P<major>0|[1-9]\\d*)\\.(?P<minor>0|[1-9]\\d*)\\.(?P<patch>0|[1-9]\\d*)(?:-(?P<pre>[\\w.]+))?$"),
    "money": re.compile(r"(?P<currency>$|€|£|KES)\\s?(?P<amount>\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)"),
    "csv_field": re.compile(r'(?P<quoted>"(?:[^"]|"")*")|(?P<plain>[^,]*)'),
}


def find(pattern_name: str, text: str) -> list[str]:
    """
    >>> find("iso_date", "shipped 2026-03-14 and again 2026-04-01")
    ['2026-03-14', '2026-04-01']
    >>> find("slug", "not a slug")
    []
    """
    pattern = PATTERNS[pattern_name]
    return [m.group(0) for m in pattern.finditer(text)]


def parse_semver(version: str) -> dict:
    """
    >>> parse_semver("2.14.0-rc.1")["pre"]
    'rc.1'
    """
    match = PATTERNS["semver"].match(version.strip())
    if not match:
        raise ValueError(f"not a semantic version: {version!r}")
    return match.groupdict()
`;

const SQL_SCHEMA = `-- Forge generated schema (PostgreSQL).
-- Conventions: snake_case, UTC timestamps, UUID keys, cascade deletes.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS accounts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email        citext NOT NULL UNIQUE,
    display_name text   NOT NULL,
    plan         text   NOT NULL DEFAULT 'free'
                 CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    name       text NOT NULL,
    slug       text NOT NULL,
    archived   boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, slug)
);

CREATE TABLE IF NOT EXISTS events (
    id         bigserial PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    kind       text NOT NULL,
    payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_project_time_idx ON events (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_payload_gin_idx ON events USING gin (payload jsonb_path_ops);

-- Keep updated_at honest without trusting the application layer.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_touch ON accounts;
CREATE TRIGGER accounts_touch BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Monthly activity rollup used by the dashboard.
CREATE OR REPLACE VIEW monthly_activity AS
SELECT p.account_id,
       date_trunc('month', e.occurred_at) AS month,
       count(*)                            AS events,
       count(DISTINCT e.project_id)        AS active_projects
FROM events e
JOIN projects p ON p.id = e.project_id
WHERE NOT p.archived
GROUP BY 1, 2
ORDER BY 1, 2 DESC;
`;

const REACT_COMPONENT = (name, fields) => `import { useMemo, useState } from 'react';

/**
 * ${name} — sortable, filterable data table.
 * Props: rows (array of objects), pageSize (number).
 */
export default function ${name}({ rows = [], pageSize = 10 }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? rows.filter((row) => Object.values(row).some((v) => String(v).toLowerCase().includes(needle)))
      : rows;
    if (!sort.key) return base;
    return [...base].sort((a, b) => {
      const [x, y] = [a[sort.key], b[sort.key]];
      const cmp = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));

  return (
    <section className="table-card">
      <header>
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          placeholder="Filter…"
          aria-label="Filter rows"
        />
        <span aria-live="polite">{filtered.length} of {rows.length}</span>
      </header>

      {visible.length === 0 ? (
        <p className="empty">No rows match “{query}”.</p>
      ) : (
        <table>
          <thead>
            <tr>
              ${fields.map((f) => `<th onClick={() => toggleSort('${f}')} aria-sort={sort.key === '${f}' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                ${toPascal(f)}${sort.key === '${f}' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>`).join('\n              ')}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={row.id ?? i}>
                ${fields.map((f) => `<td>{String(row['${f}'] ?? '—')}</td>`).join('\n                ')}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer>
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page + 1} of {pageCount}</span>
        <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
      </footer>
    </section>
  );
}
`;

const PY_DATA_PIPELINE = `"""CSV cleaning + profiling pipeline. Deterministic and report-friendly.

Usage:
    python3 pipeline.py data.csv --report
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from collections import Counter
from pathlib import Path


def sniff(path: Path) -> tuple[str, list[str], list[dict]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        sample = handle.read(8192)
        handle.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\\t|")
            has_header = csv.Sniffer().has_header(sample)
        except csv.Error:
            dialect, has_header = csv.excel, True
        reader = csv.reader(handle, dialect)
        rows = list(reader)
    header = rows[0] if has_header else [f"col_{i}" for i in range(len(rows[0]))]
    records = [dict(zip(header, row)) for row in (rows[1:] if has_header else rows)]
    return str(dialect.delimiter), header, records


def coerce(value: str):
    value = (value or "").strip()
    if value == "":
        return None
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value.replace(",", "").replace("%", ""))
    except ValueError:
        return value


def profile(records: list[dict], header: list[str]) -> dict:
    columns = {}
    for name in header:
        values = [coerce(r.get(name)) for r in records]
        present = [v for v in values if v is not None]
        numeric = [v for v in present if isinstance(v, (int, float))]
        columns[name] = {
            "filled": len(present),
            "missing": len(values) - len(present),
            "distinct": len(set(map(str, present))),
            "type": "number" if numeric and len(numeric) == len(present) else "text",
            "min": min(numeric) if numeric else None,
            "max": max(numeric) if numeric else None,
            "mean": round(statistics.fmean(numeric), 4) if numeric else None,
            "median": statistics.median(numeric) if numeric else None,
            "top_values": Counter(map(str, present)).most_common(3),
        }
    return {"rows": len(records), "columns": columns}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Clean and profile a CSV file")
    parser.add_argument("path", type=Path)
    parser.add_argument("--report", action="store_true", help="print a JSON profile")
    parser.add_argument("--out", type=Path, help="write cleaned output here")
    args = parser.parse_args(argv)

    if not args.path.exists():
        print(f"error: {args.path} not found", file=sys.stderr)
        return 2

    delimiter, header, records = sniff(args.path)
    cleaned = [{k: coerce(v) for k, v in row.items()} for row in records]
    duplicates = len(cleaned) - len({json.dumps(r, sort_keys=True, default=str) for r in cleaned})

    if args.out:
        with args.out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=header)
            writer.writeheader()
            writer.writerows(cleaned)

    if args.report:
        print(json.dumps({"delimiter": delimiter, "duplicate_rows": duplicates, **profile(cleaned, header)}, indent=2, default=str))
    else:
        print(f"{len(cleaned)} rows × {len(header)} columns (delimiter {delimiter!r}, {duplicates} duplicates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const PY_SCRAPER = `"""Polite crawler: robots.txt aware, rate-limited, retry with backoff.

Requires network access — Forge's sandbox is offline, so run this on your machine.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.robotparser as robotparser
from dataclasses import asdict, dataclass
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

USER_AGENT = "ForgeBot/1.0 (+https://forge.dev/bot)"


@dataclass
class Page:
    url: str
    title: str
    links: list[str]
    words: int
    status: int


def allowed(base: str, url: str) -> bool:
    parser = robotparser.RobotFileParser()
    parser.set_url(urljoin(base, "/robots.txt"))
    try:
        parser.read()
    except Exception:  # noqa: BLE001 - a missing robots.txt means "allowed"
        return True
    return parser.can_fetch(USER_AGENT, url)


def fetch(session: requests.Session, url: str, *, retries: int = 3) -> Page | None:
    for attempt in range(retries):
        try:
            response = session.get(url, timeout=15, headers={"User-Agent": USER_AGENT})
            if response.status_code >= 500:
                raise requests.HTTPError(f"{response.status_code}")
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer"]):
                tag.decompose()
            return Page(
                url=url,
                title=(soup.title.string or "").strip() if soup.title else "",
                links=[urljoin(url, a["href"]) for a in soup.find_all("a", href=True)],
                words=len(soup.get_text(" ", strip=True).split()),
                status=response.status_code,
            )
        except requests.RequestException as exc:
            if attempt == retries - 1:
                print(f"failed {url}: {exc}")
                return None
            time.sleep(2 ** attempt)
    return None


def crawl(seed: str, *, max_pages: int = 25, delay: float = 1.0) -> list[Page]:
    session = requests.Session()
    seen: set[str] = {seed}
    queue = [seed]
    pages: list[Page] = []
    host = urlparse(seed).netloc

    while queue and len(pages) < max_pages:
        url = queue.pop(0)
        if not allowed(seed, url):
            print(f"robots.txt disallows {url} — skipping")
            continue
        page = fetch(session, url)
        if page:
            pages.append(page)
            for link in page.links:
                clean = link.split("#")[0].rstrip("/")
                if urlparse(clean).netloc == host and clean not in seen:
                    seen.add(clean)
                    queue.append(clean)
        time.sleep(delay)  # be a good citizen
    return pages


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--max-pages", type=int, default=25)
    parser.add_argument("--out", default="out.json")
    args = parser.parse_args()
    pages = crawl(args.url, max_pages=args.max_pages)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump([asdict(p) for p in pages], handle, indent=2)
    print(f"crawled {len(pages)} pages → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const DOCKERFILE = `# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
`;

const PY_ASYNC = `"""Bounded concurrency with asyncio: fetch/transform many items without melting the host."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass


@dataclass
class TaskResult:
    index: int
    value: object
    duration_ms: int
    error: str | None = None


async def work(index: int, *, fail_index: int | None = None) -> int:
    await asyncio.sleep(0.05)                       # stand-in for real I/O
    if index == fail_index:
        raise RuntimeError("simulated upstream failure")
    return index * index


async def run_all(count: int, *, concurrency: int = 8, fail_index: int | None = None) -> list[TaskResult]:
    """Run \`count\` tasks with at most \`concurrency\` in flight; collect, never raise."""
    semaphore = asyncio.Semaphore(concurrency)

    async def guarded(index: int) -> TaskResult:
        started = time.perf_counter()
        async with semaphore:
            try:
                value = await work(index, fail_index=fail_index)
                return TaskResult(index, value, int((time.perf_counter() - started) * 1000))
            except Exception as exc:  # noqa: BLE001 - one failure must not kill the batch
                return TaskResult(index, None, int((time.perf_counter() - started) * 1000), str(exc))

    return await asyncio.gather(*(guarded(i) for i in range(count)))


if __name__ == "__main__":
    results = asyncio.run(run_all(20, concurrency=5, fail_index=7))
    ok = [r for r in results if r.error is None]
    print(f"{len(ok)}/{len(results)} succeeded; "
          f"slowest {max(r.duration_ms for r in results)}ms; failures: {[r.index for r in results if r.error]}")
`;

const JS_ASYNC = `/** Bounded concurrency without a library: p-limit in 15 lines. */
export function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active -= 1; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

export async function mapLimit(items, mapper, concurrency = 8) {
  const limit = createLimiter(concurrency);
  const results = await Promise.allSettled(items.map((item, index) => limit(() => mapper(item, index))));
  return results.map((r, index) =>
    r.status === 'fulfilled' ? { index, value: r.value } : { index, error: r.reason?.message ?? String(r.reason) },
  );
}
`;

const API_PY = (ids) => `"""FastAPI service generated by Forge. Run: uvicorn app:app --reload"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="${toPascal(ids.raw || 'Items')} API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # tighten before production
    allow_methods=["*"],
    allow_headers=["*"],
)


class ItemIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    price: Annotated[float, Field(ge=0)]
    tags: list[str] = []


class Item(ItemIn):
    id: str
    created_at: datetime


_DB: dict[str, Item] = {}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "items": len(_DB)}


@app.get("/items", response_model=list[Item])
def list_items(
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Item]:
    rows = list(_DB.values())
    if q:
        needle = q.lower()
        rows = [r for r in rows if needle in r.name.lower() or any(needle in t.lower() for t in r.tags)]
    return sorted(rows, key=lambda r: r.created_at, reverse=True)[offset : offset + limit]


@app.post("/items", response_model=Item, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemIn) -> Item:
    item = Item(**payload.model_dump(), id=str(uuid.uuid4())[:8], created_at=datetime.now(timezone.utc))
    _DB[item.id] = item
    return item


@app.get("/items/{item_id}", response_model=Item)
def get_item(item_id: str) -> Item:
    if item_id not in _DB:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"item {item_id} not found")
    return _DB[item_id]


@app.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: str) -> None:
    if _DB.pop(item_id, None) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"item {item_id} not found")
`;

const API_JS = (ids) => `/** Express CRUD API generated by Forge. Run: node server.js */
import express from 'express';
import crypto from 'node:crypto';

export const app = express();
app.use(express.json({ limit: '1mb' }));

const db = new Map();

const validate = (body) => {
  const errors = [];
  if (typeof body?.name !== 'string' || !body.name.trim()) errors.push('name is required');
  if (body?.price != null && (typeof body.price !== 'number' || body.price < 0)) errors.push('price must be a non-negative number');
  return errors;
};

app.get('/health', (_req, res) => res.json({ status: 'ok', items: db.size }));

app.get('/items', (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  let rows = [...db.values()];
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ total: rows.length, items: rows.slice(offset, offset + limit) });
});

app.post('/items', (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(422).json({ errors });
  const item = { id: crypto.randomUUID().slice(0, 8), name: req.body.name.trim(), price: Number(req.body.price ?? 0), createdAt: new Date().toISOString() };
  db.set(item.id, item);
  return res.status(201).json(item);
});

app.get('/items/:id', (req, res) => {
  const item = db.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  return res.json(item);
});

app.delete('/items/:id', (req, res) => {
  if (!db.delete(req.params.id)) return res.status(404).json({ error: 'not_found' });
  return res.status(204).end();
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(\`${ids.raw || 'items'} api listening on \${port}\`));
}
`;

function apiTemplate(language, ids) {
  if (language === 'javascript' || language === 'typescript') {
    return {
      language,
      filename: language === 'typescript' ? 'server.ts' : 'server.js',
      code: API_JS(ids),
      assumptions: ['In-memory store; swap `db` for a real database adapter.', 'JSON request/response, 422 for validation failures.'],
      notes: ['Includes health check, pagination, search, 404 handling and an error middleware.', 'Tests can import `app` directly (no listener started under NODE_ENV=test).'],
      run: 'npm i express && node server.js',
    };
  }
  return {
    language: 'python',
    filename: 'app.py',
    code: API_PY(ids),
    assumptions: ['FastAPI + Pydantic v2; in-memory store for the demo.', 'CORS is wide open — tighten `allow_origins` before shipping.'],
    notes: ['Automatic OpenAPI docs at /docs, typed request/response models, 404/422 handling.'],
    run: 'pip install fastapi uvicorn && uvicorn app:app --reload',
  };
}

function cliTemplate(language, ids) {
  const name = ids.snake || 'tool';
  if (language === 'python') {
    return {
      language,
      filename: `${name}.py`,
      code: `#!/usr/bin/env python3
"""${name} — command line tool generated by Forge."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

log = logging.getLogger("${name}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="${name}", description="Describe what this tool does.")
    parser.add_argument("inputs", nargs="*", type=Path, help="files to process")
    parser.add_argument("-o", "--out", type=Path, help="write JSON output here")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--fail-fast", action="store_true", help="stop at the first error")
    return parser


def process(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    return {"file": str(path), "bytes": len(text.encode()), "lines": text.count("\\n") + 1, "words": len(text.split())}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    if not args.inputs:
        log.error("no inputs given — pass at least one file")
        return 2

    results, exit_code = [], 0
    for path in args.inputs:
        try:
            results.append(process(path))
            log.info("processed %s", path)
        except OSError as exc:
            log.error("cannot read %s: %s", path, exc)
            exit_code = 1
            if args.fail_fast:
                break

    payload = {"count": len(results), "results": results}
    if args.out:
        args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        log.info("wrote %s", args.out)
    else:
        print(json.dumps(payload, indent=2))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
`,
      assumptions: ['Exit codes follow sysexits style: 0 ok, 1 runtime error, 2 usage error.'],
      notes: ['`--verbose` turns on debug logging; `--out` writes JSON; errors never crash mid-batch.'],
      run: `python3 ${name}.py --help`,
    };
  }
  return {
    language: 'javascript',
    filename: `${ids.camel || 'tool'}.js`,
    code: `#!/usr/bin/env node
/** ${ids.camel || 'tool'} — CLI generated by Forge. */
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', short: 'o' },
    verbose: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || positionals.length === 0) {
  console.log(\`usage: ${ids.camel || 'tool'} <file...> [-o out.json] [-v]\`);
  process.exit(values.help ? 0 : 2);
}

const results = [];
for (const file of positionals) {
  try {
    const text = await readFile(file, 'utf8');
    results.push({ file, bytes: Buffer.byteLength(text), lines: text.split('\\n').length, words: text.split(/\\s+/).filter(Boolean).length });
    if (values.verbose) console.error(\`processed \${file}\`);
  } catch (err) {
    console.error(\`cannot read \${file}: \${err.message}\`);
    process.exitCode = 1;
  }
}

const payload = JSON.stringify({ count: results.length, results }, null, 2);
if (values.out) await writeFile(values.out, payload);
else console.log(payload);
`,
    assumptions: ['Node 20+ built-in parseArgs (no dependency).'],
    notes: ['Non-zero exit code when any file fails; verbose logging goes to stderr so stdout stays pipeable.'],
    run: `node ${ids.camel || 'tool'}.js --help`,
  };
}
