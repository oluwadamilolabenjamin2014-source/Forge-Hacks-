/**
 * Deterministic math surface.
 * A real tokenizer + recursive-descent parser (no eval), a linear-equation solver,
 * percentage/unit word-problem handling and a step trace so the answer is auditable.
 * Multi-step variable tracking is explicit here: variables are stored in a scope map,
 * which is precisely the thing probabilistic planners lose.
 */

const CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };
const FUNCS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  gcd: (a, b) => {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) [x, y] = [y, x % y];
    return x;
  },
  lcm: (a, b) => Math.abs(Math.round(a) * Math.round(b)) / (FUNCS.gcd(a, b) || 1),
  factorial: (n) => {
    const k = Math.round(n);
    if (k < 0 || k > 170) throw new Error('factorial domain error');
    let out = 1;
    for (let i = 2; i <= k; i += 1) out *= i;
    return out;
  },
};

export function tokenize(input) {
  const s = String(input).replace(/\s+/g, ' ').trim();
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9_,.]/.test(s[i])) {
        num += s[i];
        i += 1;
      }
      tokens.push({ type: 'num', value: Number(num.replace(/[_,]/g, '')) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
        name += s[i];
        i += 1;
      }
      tokens.push({ type: 'name', value: name.toLowerCase() });
      continue;
    }
    if ('+-*/^%(),='.includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i += 1;
      continue;
    }
    if (ch === '×' || ch === 'x' && tokens.length && tokens[tokens.length - 1].type === 'num') {
      tokens.push({ type: '*', value: '*' });
      i += 1;
      continue;
    }
    if (ch === '÷') {
      tokens.push({ type: '/', value: '/' });
      i += 1;
      continue;
    }
    if (ch === '−') {
      tokens.push({ type: '-', value: '-' });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at position ${i}`);
  }
  return tokens;
}

class Parser {
  constructor(tokens, scope = {}, steps = []) {
    this.t = tokens;
    this.i = 0;
    this.scope = scope;
    this.steps = steps;
  }
  peek() {
    return this.t[this.i];
  }
  eat(type) {
    const tok = this.t[this.i];
    if (!tok || (type && tok.type !== type)) throw new Error(`Expected ${type || 'token'} but found ${tok ? tok.value : 'end of input'}`);
    this.i += 1;
    return tok;
  }
  parseExpression() {
    let left = this.parseTerm();
    while (this.peek() && ['+', '-'].includes(this.peek().type)) {
      const op = this.eat().type;
      const right = this.parseTerm();
      const value = op === '+' ? left + right : left - right;
      this.steps.push(`${fmt(left)} ${op} ${fmt(right)} = ${fmt(value)}`);
      left = value;
    }
    return left;
  }
  parseTerm() {
    let left = this.parseUnary();
    while (this.peek() && ['*', '/', '%'].includes(this.peek().type)) {
      const op = this.eat().type;
      const right = this.parseUnary();
      let value;
      if (op === '*') value = left * right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        value = left / right;
      } else value = left % right;
      this.steps.push(`${fmt(left)} ${op} ${fmt(right)} = ${fmt(value)}`);
      left = value;
    }
    return left;
  }
  parseUnary() {
    const tok = this.peek();
    if (tok && tok.type === '-') {
      this.eat('-');
      return -this.parseUnary();
    }
    if (tok && tok.type === '+') {
      this.eat('+');
      return this.parseUnary();
    }
    return this.parsePower();
  }
  parsePower() {
    const base = this.parsePrimary();
    if (this.peek() && this.peek().type === '^') {
      this.eat('^');
      const exp = this.parseUnary();
      const value = base ** exp;
      this.steps.push(`${fmt(base)} ^ ${fmt(exp)} = ${fmt(value)}`);
      return value;
    }
    return base;
  }
  parsePrimary() {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.type === 'num') {
      this.eat('num');
      return tok.value;
    }
    if (tok.type === '(') {
      this.eat('(');
      const v = this.parseExpression();
      this.eat(')');
      return v;
    }
    if (tok.type === 'name') {
      this.eat('name');
      const name = tok.value;
      if (this.peek() && this.peek().type === '(') {
        this.eat('(');
        const args = [];
        if (this.peek() && this.peek().type !== ')') {
          args.push(this.parseExpression());
          while (this.peek() && this.peek().type === ',') {
            this.eat(',');
            args.push(this.parseExpression());
          }
        }
        this.eat(')');
        const fn = FUNCS[name];
        if (!fn) throw new Error(`Unknown function "${name}"`);
        const value = fn(...args);
        this.steps.push(`${name}(${args.map(fmt).join(', ')}) = ${fmt(value)}`);
        return value;
      }
      if (name in this.scope) return this.scope[name];
      if (name in CONSTANTS) return CONSTANTS[name];
      throw new Error(`Unknown variable "${name}" — assign it first, e.g. \`${name} = 2\``);
    }
    throw new Error(`Unexpected token "${tok.value}"`);
  }
}

export function fmt(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const rounded = Number(n.toFixed(10));
  return String(rounded);
}

/** Evaluate one expression with an optional variable scope. */
export function evaluate(expression, scope = {}) {
  const steps = [];
  const parser = new Parser(tokenize(expression), scope, steps);
  const value = parser.parseExpression();
  if (parser.peek()) throw new Error(`Unexpected trailing token "${parser.peek().value}"`);
  return { value, steps, scope };
}

/**
 * Solve a single-variable linear equation.
 * Handles: 2x + 5 = 17, 3(x - 2) = 9, 4x/3 = 8, 0.5x = 4 - x
 */
export function solveLinear(a, b, rhs) {
  // a*x + b = rhs
  if (a === 0) {
    if (b === rhs) return { steps: ['Both sides reduce to the same constant — infinitely many solutions.'] };
    return { steps: ['The variable cancelled out and the constants disagree — no solution.'] };
  }
  const x = (rhs - b) / a;
  return {
    value: x,
    steps: [
      `Start: ${fmt(a)}x ${b >= 0 ? '+' : '-'} ${fmt(Math.abs(b))} = ${fmt(rhs)}`,
      `Move the constant: ${fmt(a)}x = ${fmt(rhs)} ${b >= 0 ? '-' : '+'} ${fmt(Math.abs(b))} = ${fmt(rhs - b)}`,
      `Divide by the coefficient: x = ${fmt(rhs - b)} / ${fmt(a)} = ${fmt(x)}`,
      `Check: ${fmt(a)}·${fmt(x)} ${b >= 0 ? '+' : '-'} ${fmt(Math.abs(b))} = ${fmt(a * x + b)} ✓`,
    ],
  };
}

/**
 * Symbolic linear parser.
 *
 * Expressions are evaluated over pairs (a, b) meaning `a·x + b`. Multiplication and
 * division require one side to be a constant, which is exactly the condition for the
 * expression to stay linear — anything else (x·x, x², sin(x)) is reported as nonlinear
 * rather than silently mis-answered. This is the piece that makes `3(x - 2) = 9` work.
 */
const CONST = (b) => ({ a: 0, b });
const VAR = { a: 1, b: 0 };

class LinearParser {
  constructor(tokens, variable = 'x') {
    this.t = tokens;
    this.i = 0;
    this.variable = variable;
  }
  peek() {
    return this.t[this.i];
  }
  eat(type) {
    const tok = this.t[this.i];
    if (!tok || (type && tok.type !== type)) {
      throw new Error(`Expected ${type || 'a token'} but found ${tok ? `"${tok.value}"` : 'end of input'}`);
    }
    this.i += 1;
    return tok;
  }
  expression() {
    let left = this.term();
    while (this.peek() && ['+', '-'].includes(this.peek().type)) {
      const op = this.eat().type;
      const right = this.term();
      left = op === '+' ? { a: left.a + right.a, b: left.b + right.b } : { a: left.a - right.a, b: left.b - right.b };
    }
    return left;
  }
  term() {
    let left = this.unary();
    for (;;) {
      const tok = this.peek();
      if (!tok) break;
      if (['*', '/', '%'].includes(tok.type)) {
        const op = this.eat().type;
        left = applyLinear(op, left, this.unary());
        continue;
      }
      // Implicit multiplication: `2x`, `3(x - 2)`, `2(x + 1)/3`. A number directly
      // followed by a variable or a bracket is a product — that is how people write maths.
      if (tok.type === 'num' || tok.type === 'name' || tok.type === '(') {
        left = applyLinear('*', left, this.unary());
        continue;
      }
      break;
    }
    return left;
  }
  unary() {
    if (this.peek() && this.peek().type === '-') {
      this.eat('-');
      const v = this.unary();
      return { a: -v.a, b: -v.b };
    }
    if (this.peek() && this.peek().type === '+') this.eat('+');
    return this.power();
  }
  power() {
    const base = this.primary();
    if (this.peek() && this.peek().type === '^') {
      this.eat('^');
      const exp = this.unary();
      if (exp.a !== 0) throw new Error('the exponent must be a constant — that equation is not linear');
      const n = exp.b;
      if (n === 0) return CONST(1);
      if (n === 1) return base;
      if (base.a === 0) return CONST(base.b ** n);
      throw new Error(`x^${n} is not linear — Forge solves single-variable linear equations only`);
    }
    return base;
  }
  primary() {
    const tok = this.peek();
    if (!tok) throw new Error('unexpected end of expression');
    if (tok.type === 'num') {
      this.eat('num');
      return CONST(tok.value);
    }
    if (tok.type === '(') {
      this.eat('(');
      const inner = this.expression();
      this.eat(')');
      return inner;
    }
    if (tok.type === 'name') {
      this.eat('name');
      const name = tok.value;
      if (this.peek() && this.peek().type === '(') {
        // a function call: only linear if its argument is a constant
        this.eat('(');
        const arg = this.expression();
        this.eat(')');
        if (arg.a !== 0) throw new Error(`${name}(x) is not linear — Forge cannot invert it algebraically`);
        const fn = FUNCS[name];
        if (!fn) throw new Error(`unknown function "${name}"`);
        return CONST(fn(arg.b));
      }
      if (name === this.variable) return VAR;
      if (name in CONSTANTS) return CONST(CONSTANTS[name]);
      throw new Error(`unknown variable "${name}" — this solver handles one unknown (\`${this.variable}\`)`);
    }
    throw new Error(`unexpected token "${tok.value}"`);
  }
}

function applyLinear(op, left, right) {
  if (op === '%') {
    if (left.a !== 0 || right.a !== 0) throw new Error('the remainder operator needs constant operands');
    return CONST(left.b % right.b);
  }
  if (op === '*') {
    if (left.a !== 0 && right.a !== 0) throw new Error('x multiplied by itself is not linear');
    if (left.a === 0) return { a: left.b * right.a, b: left.b * right.b };
    return { a: right.b * left.a, b: right.b * left.b };
  }
  if (op === '/') {
    if (right.a !== 0) throw new Error('dividing by x is not linear');
    if (right.b === 0) throw new Error('division by zero');
    return { a: left.a / right.b, b: left.b / right.b };
  }
  throw new Error(`unhandled operator ${op}`);
}

/** Solve "2x + 5 = 17" / "3(x - 2) = 9" / "4x/3 = 8" for a single unknown. */
export function solveEquation(eqText) {
  const parts = String(eqText).split('=');
  if (parts.length !== 2) throw new Error('pass an equation with exactly one "=", e.g. `2x + 5 = 17`');
  const variable = /y/.test(String(eqText)) && !/x/i.test(String(eqText)) ? 'y' : 'x';
  const leftParser = new LinearParser(tokenize(parts[0]), variable);
  const left = leftParser.expression();
  if (leftParser.peek()) throw new Error(`unexpected "${leftParser.peek().value}" in the left-hand side`);
  const rightParser = new LinearParser(tokenize(parts[1]), variable);
  const right = rightParser.expression();
  if (rightParser.peek()) throw new Error(`unexpected "${rightParser.peek().value}" in the right-hand side`);
  let a = left.a - right.a;
  let b = left.b - right.b;
  if (a === 0) {
    return {
      method: 'linear-equation',
      solutions: b === 0 ? 'infinite' : 'none',
      steps: [
        `Left side: ${fmt(left.a)}${variable} ${left.b >= 0 ? '+' : '-'} ${fmt(Math.abs(left.b))}`,
        `Right side: ${fmt(right.a)}${variable} ${right.b >= 0 ? '+' : '-'} ${fmt(Math.abs(right.b))}`,
        b === 0
          ? 'Both sides reduce to the same expression — infinitely many solutions.'
          : `The ${variable} terms cancel and the constants disagree (${fmt(b)} ≠ 0) — there is no solution.`,
      ],
    };
  }
  const value = -b / a;
  const steps = [
    `Collect terms: ${fmt(a)}${variable} ${b >= 0 ? '+' : '-'} ${fmt(Math.abs(b))} = 0`,
    `Move the constant: ${fmt(a)}${variable} = ${fmt(-b)}`,
    `Divide by the coefficient: ${variable} = ${fmt(-b)} / ${fmt(a)} = ${fmt(value)}`,
    `Check: ${fmt(left.a)}·${fmt(value)} ${left.b >= 0 ? '+' : '-'} ${fmt(Math.abs(left.b))} = ${fmt(left.a * value + left.b)} ✓`,
  ];
  return { method: 'linear-equation', value, solutions: 'unique', coefficients: { a, b }, steps };
}

/** Percentages, unit conversions and "X% of Y" style word problems. */
export function wordProblem(text) {
  const t = String(text).toLowerCase().replace(/,/g, '');

  const pctOf = t.match(/([\d.]+)\s*%\s*(?:of|off)\s*([\d.]+)/);
  if (pctOf) {
    const p = Number(pctOf[1]);
    const n = Number(pctOf[2]);
    const part = (p / 100) * n;
    const steps = [`${p}% as a decimal = ${fmt(p / 100)}`, `${fmt(p / 100)} × ${fmt(n)} = ${fmt(part)}`];
    if (/off|discount|sale/.test(t)) steps.push(`Discount applied: ${fmt(n)} − ${fmt(part)} = ${fmt(n - part)}`);
    return { value: /off|discount|sale/.test(t) ? n - part : part, steps, kind: 'percent' };
  }

  const change = t.match(/(?:from|was|increased from|decreased from)\s*([\d.]+)\s*(?:to|now)\s*([\d.]+)/);
  if (change) {
    const from = Number(change[1]);
    const to = Number(change[2]);
    const delta = to - from;
    const pct = (delta / from) * 100;
    return {
      value: Number(pct.toFixed(4)),
      steps: [
        `Change = ${fmt(to)} − ${fmt(from)} = ${fmt(delta)}`,
        `Percent change = (${fmt(delta)} / ${fmt(from)}) × 100 = ${fmt(Number(pct.toFixed(4)))}%`,
        `${pct >= 0 ? 'Increase' : 'Decrease'}`,
      ],
      kind: 'percent-change',
    };
  }

  const conversions = [
    [/([\d.]+)\s*(?:km|kilometers?)\b.*?(?:miles?|mi\b)/, 0.621371, 'km → miles'],
    [/([\d.]+)\s*(?:miles?|mi)\b.*?(?:km|kilometers?)/, 1.609344, 'miles → km'],
    [/([\d.]+)\s*(?:kg|kilograms?)\b.*?(?:pounds?|lbs?\b)/, 2.2046226, 'kg → lb'],
    [/([\d.]+)\s*(?:pounds?|lbs?)\b.*?(?:kg|kilograms?)/, 0.45359237, 'lb → kg'],
    [/([\d.]+)\s*(?:gb|gigabytes?)\b.*?(?:mb|megabytes?)/, 1024, 'GB → MB'],
    [/([\d.]+)\s*(?:hours?|hrs?)\b.*?(?:minutes?|mins?)/, 60, 'hours → minutes'],
    [/([\d.]+)\s*(?:days?)\b.*?(?:hours?|hrs?)/, 24, 'days → hours'],
  ];
  for (const [re, factor, label] of conversions) {
    const m = t.match(re);
    if (m) {
      const v = Number(m[1]);
      return { value: v * factor, steps: [`${v} × ${factor} = ${fmt(v * factor)}`], kind: 'convert', label };
    }
  }

  const cf = t.match(/(-?[\d.]+)\s*(?:°\s*)?(c|celsius|f|fahrenheit)\b/);
  if (cf && /(?:to|in|into)/.test(t)) {
    const v = Number(cf[1]);
    const unit = cf[2][0];
    const out = unit === 'c' ? (v * 9) / 5 + 32 : ((v - 32) * 5) / 9;
    const target = unit === 'c' ? 'F' : 'C';
    const formula = unit === 'c' ? `(${v} × 9/5) + 32` : `(${v} − 32) × 5/9`;
    return { value: Number(out.toFixed(4)), steps: [`${formula} = ${fmt(Number(out.toFixed(4)))}°${target}`], kind: 'convert' };
  }

  return null;
}

/**
 * Handle a mixed prompt: variable assignments then a final expression.
 * "a = 3, b = 4, compute sqrt(a^2 + b^2)"
 */
export function multiStep(input) {
  const text = String(input);
  const scope = {};
  const trace = [];
  const assignmentRe = /(?:^|[,;\n]|\band\b|\bthen\b)\s*([a-z][a-z0-9_]*)\s*=\s*([^,;\n]+?)(?=(?:[,;\n]|\band\b|\bthen\b|$))/gi;
  let last = -1;
  const consumed = [];
  let m;
  while ((m = assignmentRe.exec(text))) {
    const name = m[1].toLowerCase();
    if (['x'].includes(name) && /=/.test(text)) {
      // single unknown — treat as an equation to solve, not an assignment
      return null;
    }
    const expr = m[2].trim();
    if (/[a-z]/i.test(expr.replace(/[a-z]*(pi|e)\b/gi, '')) && !/\(/.test(expr)) {
      // contains a bare unknown word: not a clean assignment
      const unknown = expr.match(/[a-z][a-z0-9_]*/i);
      if (unknown && !(unknown[0].toLowerCase() in scope) && !(unknown[0].toLowerCase() in CONSTANTS) && !FUNCS[unknown[0].toLowerCase()]) {
        continue;
      }
    }
    try {
      const { value } = evaluate(expr, scope);
      scope[name] = value;
      trace.push(`${name} = ${expr} → ${fmt(value)}`);
      consumed.push([m.index, m.index + m[0].length]);
      last = Math.max(last, m.index + m[0].length);
    } catch {
      /* not an assignment we can evaluate — skip */
    }
  }
  if (!Object.keys(scope).length) return null;

  // Strip connective words repeatedly: ", compute sqrt(...)" → "sqrt(...)"
  let tail = text.slice(last);
  let previous;
  do {
    previous = tail;
    tail = tail.replace(/^\s*(?:[,;.]|\band\b|\bthen\b|\bcompute\b|\bcalculate\b|\bevaluate\b|\bwhat\s+is\b|\bwhich\s+is\b|\bis\b|[:=\-–—])\s*/i, '');
  } while (tail !== previous);
  tail = tail.trim();
  tail = tail.replace(/[?.!]+$/, '');
  if (!tail) {
    const exprs = [...text.matchAll(/([a-z0-9_^*/+%().\- ]+)/gi)].map((x) => x[1]).filter((s) => s.includes('('));
    tail = exprs.length ? exprs[exprs.length - 1] : '';
  }
  if (!tail || !/[-+*/^%]|\(/.test(tail)) return null;
  try {
    const { value, steps } = evaluate(tail, scope);
    return { value, scope, trace, steps: [...trace, ...steps.filter((s) => !trace.includes(s))], expression: tail };
  } catch (err) {
    return { error: err.message, scope, trace };
  }
}

/** Route a natural-language math prompt through the right solver. */
export function solve(prompt) {
  const text = String(prompt);
  const cleaned = text
    .replace(/^(?:please\s+)?(?:can you\s+)?(?:calculate|compute|evaluate|solve(?:\s+for\s+[a-z])?|what\s+is|what's|how much is|work out|find)\b[: ]*/i, '')
    .replace(/[?.!]+\s*$/, '')
    .trim();

  const looksLikeEquation = /=/.test(cleaned) && /\b[xy]\b|[0-9]\s*[xy]|[xy]\s*[0-9(]/i.test(cleaned) && !/\b(?:true|false|null|undefined)\b/i.test(cleaned);
  if (looksLikeEquation) {
    try {
      return { ...solveEquation(cleaned), expression: cleaned };
    } catch (err) {
      return {
        method: 'linear-equation',
        error: err.message,
        expression: cleaned,
        hint: 'Forge solves a single unknown in one linear equation. Quadratic, transcendental and multi-unknown systems are out of scope for the local solver — use the sandbox with sympy instead.',
      };
    }
  }

  const wp = wordProblem(cleaned);
  if (wp) return { method: `word-problem:${wp.kind}`, ...wp, expression: cleaned };

  const multi = multiStep(cleaned);
  if (multi) return { method: 'multi-step', ...multi, expression: cleaned };

  try {
    const { value, steps } = evaluate(cleaned);
    return { method: 'expression', value, steps, expression: cleaned };
  } catch (err) {
    return { method: 'failed', error: err.message, expression: cleaned };
  }
}
