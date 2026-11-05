"""Behavior checks for the independent skill calculator (standard library only)."""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('calculate', Path(__file__).parent/'skills/purchase-review/scripts/calculate.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
base = dict(mode='resale', currency='CNY', period='90 days', tax_basis='demo', unit='piece',
            purchase_qty=100, unit_purchase_cost=50, unit_inbound_cost=5, fixed_cost=400,
            exit_cost=0, holding_cost=0, scenarios=[dict(name='base', sold_qty=80,
            net_unit_revenue=100, unit_sales_cost=10, substitution_rate='.25', old_unit_contribution=20)])
result = module.calculate(base)
assert result['procurement_cash_requirement'] == '5900'
assert result['scenarios'][0]['incremental_contribution'] == '2000'
assert result['scenarios'][0]['remaining_inventory_at_cost'] == '1100'
tco = dict(mode='tco', currency='EUR', period='36 months', tax_basis='consistent',
           options=[dict(name='equipment', acquisition=20000, implementation=3000,
           operating_total=9000, maintenance_total=2000, exit_cost=1000, residual_value=3000)])
assert module.calculate(tco)['options'][0]['tco'] == '32000'
assert module.calculate({**base, 'scenarios': [{**base['scenarios'][0], 'net_unit_revenue': 1}]})['scenarios'][0]['break_even_qty'] is None
for bad in [None, True, 'NaN', 'Infinity', -1]:
    try:
        module.calculate({**base, 'unit_purchase_cost': bad})
    except ValueError:
        pass
    else:
        raise AssertionError(f'accepted invalid amount: {bad}')
for bad in [{'sold_qty':101}, {'substitution_rate':1.1}]:
    try:
        module.calculate({**base,'scenarios':[{**base['scenarios'][0],**bad}]})
    except ValueError:
        pass
    else:
        raise AssertionError('accepted invalid scenario')
print('PASS: resale, inventory, TCO, non-positive margin, unknown and invalid inputs')
