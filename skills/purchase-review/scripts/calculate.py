"""Deterministic procurement arithmetic; standard library only, no network."""
import argparse
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

def amount(data, key):
    value = data.get(key)
    if isinstance(value, bool) or value is None:
        raise ValueError(f'{key}: a known non-negative number is required')
    try:
        n = Decimal(str(value))
    except InvalidOperation:
        raise ValueError(f'{key}: invalid number') from None
    if not n.is_finite() or n < 0:
        raise ValueError(f'{key}: must be finite and non-negative')
    return n

def label(data, key):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{key}: non-empty text is required')
    return value.strip()

def rows(data, key):
    value = data.get(key)
    if not isinstance(value, list) or not value or not all(isinstance(v, dict) for v in value):
        raise ValueError(f'{key}: a non-empty list of objects is required')
    names = [label(v, 'name') for v in value]
    if len(set(names)) != len(names):
        raise ValueError(f'{key}: names must be unique')
    return value

def out(value):
    return format(value.quantize(Decimal('0.000001')).normalize(), 'f')

def calculate(data):
    if not isinstance(data, dict):
        raise ValueError('input must be a JSON object')
    result = {k: label(data, k) for k in ('mode', 'currency', 'period', 'tax_basis')}
    if result['mode'] == 'resale':
        result['unit'] = label(data, 'unit')
        qty = amount(data, 'purchase_qty')
        landed = amount(data, 'unit_purchase_cost') + amount(data, 'unit_inbound_cost')
        costs = sum(amount(data, k) for k in ('fixed_cost', 'exit_cost', 'holding_cost'))
        result['procurement_cash_requirement'] = out(qty * landed + costs)
        result['scenarios'] = []
        for item in rows(data, 'scenarios'):
            sold, rate = amount(item, 'sold_qty'), amount(item, 'substitution_rate')
            if sold > qty:
                raise ValueError('sold_qty cannot exceed purchase_qty in this batch model')
            if rate > 1:
                raise ValueError('substitution_rate must be between 0 and 1')
            unit = amount(item, 'net_unit_revenue') - landed - amount(item, 'unit_sales_cost')
            incremental = unit - rate * amount(item, 'old_unit_contribution')
            result['scenarios'].append({
                'name': label(item, 'name'), 'sold_qty': out(sold),
                'unit_contribution': out(unit), 'incremental_unit_contribution': out(incremental),
                'incremental_contribution': out(sold * incremental - costs),
                'break_even_qty': out(costs / incremental) if incremental > 0 else None,
                'remaining_qty': out(qty - sold),
                'remaining_inventory_at_cost': out((qty - sold) * landed),
            })
    elif result['mode'] == 'tco':
        result['discounted'] = False
        result['options'] = []
        for item in rows(data, 'options'):
            total = sum(amount(item, k) for k in ('acquisition', 'implementation', 'operating_total', 'maintenance_total', 'exit_cost'))
            total -= amount(item, 'residual_value')
            result['options'].append({'name': label(item, 'name'), 'tco': out(total)})
    else:
        raise ValueError('mode must be resale or tco; use a separate model for other economics')
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.input.read_text(encoding='utf-8-sig'), parse_float=Decimal)
        content = json.dumps(calculate(data), ensure_ascii=False, indent=2)
        if args.output:
            if args.input.resolve() == args.output.resolve():
                raise ValueError('output must not overwrite the input')
            args.output.write_text(content + '\n', encoding='utf-8')
        else:
            print(content)
    except (ValueError, OSError, InvalidOperation) as exc:
        print(f'Invalid procurement input: {exc}', file=sys.stderr)
        return 2
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
