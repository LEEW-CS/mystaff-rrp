// Map category name → tbody id suffix
// =====================================================
// FORMULA EVALUATION ENGINE
// =====================================================
// Evaluates formula_expression strings from benefits_config table
// Available variables: baseSalary, nightDiffHours, nightDiffRate, minWage
// Supports: IF(cond, trueVal, falseVal), arithmetic, comparisons
function evaluateBenefitFormula(expression, vars) {
    if (!expression || expression === '0') return 0;
    if (expression === 'LOOKUP_NIGHT_MEALS') return vars._nightMealsCOP || 0;
    if (expression === 'LOOKUP_HMO') return vars._hmoCOP || 0;

    try {
        // Tokenize and parse the expression safely
        return _evalExpr(expression, vars);
    } catch(e) {
        console.warn('Formula eval error for "' + expression + '":', e.message);
        return 0;
    }
}

function _evalExpr(expr, vars) {
    expr = expr.trim();
    // Handle IF(condition, trueVal, falseVal)
    if (expr.startsWith('IF(') || expr.startsWith('if(')) {
        return _evalIF(expr, vars);
    }
    // Replace variable names with values
    let resolved = expr;
    const varNames = Object.keys(vars).filter(k => !k.startsWith('_')).sort((a,b) => b.length - a.length);
    for (const vn of varNames) {
        resolved = resolved.replace(new RegExp('\\b' + vn + '\\b', 'g'), String(vars[vn]));
    }
    // Validate: only allow numbers, operators, parens, spaces, dots
    if (/[^0-9+\-*/().eE\s]/.test(resolved)) {
        throw new Error('Invalid chars in expression: ' + resolved);
    }
    // Evaluate using Function (safe — only numbers and math ops)
    const fn = new Function('return (' + resolved + ')');
    const result = fn();
    return isNaN(result) ? 0 : result;
}

function _evalIF(expr, vars) {
    // Parse IF(condition, trueVal, falseVal)
    // Find the matching closing paren
    const start = expr.indexOf('(');
    if (start < 0) throw new Error('Malformed IF');
    let depth = 0;
    let end = -1;
    for (let i = start; i < expr.length; i++) {
        if (expr[i] === '(') depth++;
        if (expr[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error('Unmatched paren in IF');
    const inner = expr.substring(start + 1, end);

    // Split on commas at depth 0
    const parts = [];
    let partStart = 0;
    depth = 0;
    for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '(') depth++;
        if (inner[i] === ')') depth--;
        if (inner[i] === ',' && depth === 0) {
            parts.push(inner.substring(partStart, i).trim());
            partStart = i + 1;
        }
    }
    parts.push(inner.substring(partStart).trim());

    if (parts.length !== 3) throw new Error('IF needs 3 args, got ' + parts.length);

    const condResult = _evalCondition(parts[0], vars);
    return condResult ? _evalExpr(parts[1], vars) : _evalExpr(parts[2], vars);
}

function _evalCondition(cond, vars) {
    // Support: >=, <=, >, <, ==, !=
    const ops = ['>=', '<=', '!=', '==', '>', '<'];
    for (const op of ops) {
        const idx = cond.indexOf(op);
        if (idx >= 0) {
            const left = _evalExpr(cond.substring(0, idx), vars);
            const right = _evalExpr(cond.substring(idx + op.length), vars);
            switch(op) {
                case '>=': return left >= right;
                case '<=': return left <= right;
                case '>':  return left > right;
                case '<':  return left < right;
                case '==': return left === right;
                case '!=': return left !== right;
            }
        }
    }
    // If no comparison operator, evaluate as truthy
    return !!_evalExpr(cond, vars);
}
