// Document discount (quotations / invoices): [discount_type, discount_value,
// discount_amount] from a request body or a source row. The client works out
// the amount (it is part of the totals it sends); here it is only sanitised.
function discountOf(src) {
  const amount = Math.max(0, Number(src && src.discount_amount) || 0);
  if (!amount) return [null, 0, 0];
  const type = src.discount_type === 'percent' ? 'percent' : 'amount';
  const value = Math.max(0, Number(src.discount_value) || 0);
  return [type, value, amount];
}

// Push discount columns onto an UPDATE's field list when the body has them.
function pushDiscountFields(body, fields, values) {
  if (body.discount_amount === undefined && body.discount_type === undefined && body.discount_value === undefined) return;
  const [t, v, a] = discountOf(body);
  fields.push('discount_type = ?', 'discount_value = ?', 'discount_amount = ?');
  values.push(t, v, a);
}

const SET_DISCOUNT_SQL = (table) => `UPDATE ${table} SET discount_type = ?, discount_value = ?, discount_amount = ? WHERE id = ?`;

module.exports = { discountOf, pushDiscountFields, SET_DISCOUNT_SQL };
