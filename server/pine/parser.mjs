/**
 * Block-aware statement parser for Wolf Pine.
 * Produces a simple AST: statements with nested body arrays.
 */

import { lexLines } from './lexer.mjs';

function parseBlock(lines, start, baseIndent) {
  const body = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) {
      // orphan deeper indent with no parent header — skip (should be rare)
      i += 1;
      continue;
    }
    const stmt = parseStatement(lines, i, baseIndent);
    body.push(stmt.node);
    i = stmt.next;
  }
  return { body, next: i };
}

function parseStatement(lines, i, baseIndent) {
  const { text, lineNo } = lines[i];
  const nextIndent = lines[i + 1]?.indent ?? -1;
  const childIndent = nextIndent > baseIndent ? nextIndent : baseIndent + 1;

  // type Name
  let m = /^type\s+([A-Za-z_][\w]*)\s*$/i.exec(text);
  if (m) {
    const name = m[1];
    const blk = parseBlock(lines, i + 1, nextIndent);
    const fields = (blk.body || []).map((st) => {
      if (st.kind === 'assign' || st.kind === 'var') {
        return { name: st.target || st.name, def: st.expr || null };
      }
      const t = String(st.text || '').trim();
      // float[] p  |  float o = open  |  color css
      const fm =
        /^(?:[\w.]+(?:\s*\[\s*\])?\s+)+([A-Za-z_][\w]*)\s*(?:=\s*(.+))?$/.exec(t) ||
        /^([A-Za-z_][\w]*)\s*(?:=\s*(.+))?$/.exec(t);
      if (fm) return { name: fm[1], def: fm[2] || null };
      return { name: t, def: null };
    }).filter((f) => f.name && !/^(if|for|switch)$/i.test(f.name));
    return {
      node: { kind: 'type', name, fields, lineNo },
      next: blk.next,
    };
  }

  // method returnType name(args) =>  OR method name(Type this, ...)
  m = /^method\s+(?:[\w.\[\]]+\s+)?([A-Za-z_][\w]*)\s*\((.*)\)\s*(?:=>)?\s*$/i.exec(text);
  if (m && nextIndent > baseIndent) {
    const name = m[1];
    const rawParams = m[2]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const params = rawParams.map((p) => {
      const parts = p.replace(/\[\]/g, '[]').split(/\s+/).filter(Boolean);
      return parts[parts.length - 1].replace(/[,)]/g, '');
    });
    const paramTypes = rawParams.map((p) => {
      const parts = p.replace(/\s*\[\s*\]/g, '[]').split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return parts[0];
      return '';
    });
    const blk = parseBlock(lines, i + 1, nextIndent);
    return {
      node: { kind: 'method', name, params, paramTypes, body: blk.body, lineNo },
      next: blk.next,
    };
  }

  // one-liner method: method darkcss(color css, float factor, bool bull) => expr
  m = /^method\s+(?:[\w.\[\]]+\s+)?([A-Za-z_][\w]*)\s*\((.*)\)\s*=>\s*(.+)$/i.exec(text);
  if (m) {
    const rawParams = m[2].split(',').map((p) => p.trim()).filter(Boolean);
    return {
      node: {
        kind: 'method',
        name: m[1],
        params: rawParams.map((p) => p.split(/\s+/).pop()),
        paramTypes: rawParams.map((p) => {
          const parts = p.replace(/\s*\[\s*\]/g, '[]').split(/\s+/).filter(Boolean);
          return parts.length >= 2 ? parts[0] : '';
        }),
        body: [{ kind: 'expr', text: m[3].trim(), lineNo }],
        lineNo,
      },
      next: i + 1,
    };
  }

  // function foo(a, b) =>  / foo() =
  m = /^(?:export\s+)?([A-Za-z_][\w]*)\s*\((.*)\)\s*(?:=>|=)\s*$/i.exec(text);
  if (m && nextIndent > baseIndent && !/^(if|for|while|switch|type|method)$/i.test(m[1])) {
    const name = m[1];
    const params = m[2]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const parts = p.split(/\s+/);
        return parts[parts.length - 1].replace(/[,)]/g, '');
      });
    const blk = parseBlock(lines, i + 1, nextIndent);
    return {
      node: { kind: 'func', name, params, body: blk.body, lineNo },
      next: blk.next,
    };
  }

  // one-liner OR signature-only: foo() => expr   / foo() =>
  m = /^([A-Za-z_][\w]*)\s*\((.*)\)\s*=>\s*(.*)$/i.exec(text);
  if (m && !/^(if|for|while|switch|method)$/i.test(m[1])) {
    const rest = (m[3] || '').trim();
    if (rest) {
      return {
        node: {
          kind: 'func',
          name: m[1],
          params: m[2]
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => p.split(/\s+/).pop()),
          body: [{ kind: 'expr', text: rest, lineNo }],
          lineNo,
        },
        next: i + 1,
      };
    }
    // signature with body on following indent (also handled above when nextIndent>)
    if (nextIndent > baseIndent) {
      const params = m[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.split(/\s+/).pop());
      const blk = parseBlock(lines, i + 1, nextIndent);
      return {
        node: { kind: 'func', name: m[1], params, body: blk.body, lineNo },
        next: blk.next,
      };
    }
  }

  // if / else if / else
  m = /^if\s+(.+)$/i.exec(text);
  if (m) {
    const cond = m[1].trim();
    const thenBlk = parseBlock(lines, i + 1, nextIndent);
    let next = thenBlk.next;
    const elseIfs = [];
    let elseBody = null;
    while (next < lines.length && lines[next].indent === baseIndent) {
      const t = lines[next].text;
      const elif = /^else\s+if\s+(.+)$/i.exec(t);
      if (elif) {
        const eblk = parseBlock(lines, next + 1, lines[next+1]?.indent ?? (baseIndent + 1));
        elseIfs.push({ cond: elif[1].trim(), body: eblk.body });
        next = eblk.next;
        continue;
      }
      if (/^else\s*$/i.test(t)) {
        const eblk = parseBlock(lines, next + 1, lines[next+1]?.indent ?? (baseIndent + 1));
        elseBody = eblk.body;
        next = eblk.next;
        break;
      }
      break;
    }
    return {
      node: {
        kind: 'if',
        cond,
        then: thenBlk.body,
        elseIfs,
        else: elseBody,
        lineNo,
      },
      next,
    };
  }

  // for i = a to b
  m = /^for\s+([A-Za-z_][\w]*)\s*=\s*(.+?)\s+to\s+(.+)$/i.exec(text);
  if (m) {
    const blk = parseBlock(lines, i + 1, nextIndent);
    return {
      node: {
        kind: 'for',
        iter: m[1],
        from: m[2].trim(),
        to: m[3].trim(),
        body: blk.body,
        lineNo,
      },
      next: blk.next,
    };
  }

  // switch expr  (expr may be empty → condition switch)
  m = /^switch\s*(.*)$/i.exec(text);
  if (m && nextIndent > baseIndent) {
    const expr = m[1].trim();
    const blk = parseBlock(lines, i + 1, nextIndent);
    const cases = [];
    let defaultBody = null;
    for (const st of blk.body) {
      if (st.kind === 'case') {
        if (st.isDefault) defaultBody = st.body;
        else cases.push(st);
      } else if (st.kind === 'expr' || st.kind === 'assign') {
        const cm = /^(.+?)\s*=>\s*(.*)$/.exec(st.text || `${st.target || ''} = ${st.expr || ''}`);
        if (cm) {
          const key = cm[1].trim();
          const rhs = cm[2].trim();
          const body = rhs
            ? [{ kind: 'expr', text: rhs, lineNo: st.lineNo }]
            : [];
          if (key === '_' || key === 'default' || key === '=>') {
            defaultBody = body.length ? body : defaultBody;
          } else {
            cases.push({ kind: 'case', match: key, body, lineNo: st.lineNo });
          }
        } else if (st.kind === 'case') {
          cases.push(st);
        }
      }
    }
    return {
      node: {
        kind: 'switch',
        expr,
        isConditionSwitch: !expr,
        cases,
        defaultBody,
        lineNo,
      },
      next: blk.next,
    };
  }

  // while
  m = /^while\s+(.+)$/i.exec(text);
  if (m) {
    const blk = parseBlock(lines, i + 1, nextIndent);
    return {
      node: { kind: 'while', cond: m[1].trim(), body: blk.body, lineNo },
      next: blk.next,
    };
  }

  // var / varip assign (optional type: var float x = … / var ms up = …)
  m = /^(varip|var)\s+(.+)$/i.exec(text);
  if (m) {
    const rest = m[2].trim();
    const am =
      /^(?:(?:int|float|bool|string|color|line|box|label|array|table|[A-Za-z_][\w]*)\s+)?([A-Za-z_][\w]*)\s*(?::\s*[\w.]+)?\s*(?:=|:=)\s*(.+)$/.exec(
        rest,
      );
    if (am) {
      return {
        node: {
          kind: 'var',
          mode: m[1].toLowerCase(),
          name: am[1],
          expr: am[2].trim(),
          lineNo,
        },
        next: i + 1,
      };
    }
  }

  // tuple destructure: [a, b] = expr
  m = /^\[([^\]]+)\]\s*(:=|=)\s*(.+)$/.exec(text);
  if (m) {
    const names = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    return {
      node: { kind: 'destructure', names, expr: m[3].trim(), lineNo },
      next: i + 1,
    };
  }

  // assignment (= := += -= *= /=), optionally typed
  m = /^(?:(?:int|float|bool|string|color|line|box|label|array|table|[A-Za-z_][\w]*)\s+)?([A-Za-z_][\w]*(?:\[[^\]]+\])?(?:\.[A-Za-z_][\w]*(?:\[[^\]]+\])?)*)\s*(?::\s*[\w.]+)?\s*(:=|\+=|-=|\*=|\/=|=)\s*(.+)$/.exec(
    text,
  );
  if (m && !/^(if|for|while|switch|type|method|export|import|var|varip)\b/i.test(text)) {
    const target = m[1];
    if (!/^(if|for|while|switch)$/i.test(target)) {
      return {
        node: { kind: 'assign', target, op: m[2], expr: m[3].trim(), lineNo },
        next: i + 1,
      };
    }
  }

  // case for switch bodies written as "x =>"
  m = /^(.+?)\s*=>\s*$/.exec(text);
  if (m && nextIndent > baseIndent) {
    const blk = parseBlock(lines, i + 1, nextIndent);
    const key = m[1].trim();
    return {
      node: {
        kind: 'case',
        match: key,
        isDefault: key === '_' || key === 'default',
        body: blk.body,
        lineNo,
      },
      next: blk.next,
    };
  }

  return {
    node: { kind: 'expr', text, lineNo },
    next: i + 1,
  };
}

export function parseProgram(source) {
  const lines = lexLines(source);
  const { body } = parseBlock(lines, 0, 0);
  return { kind: 'program', body, lineCount: lines.length };
}
