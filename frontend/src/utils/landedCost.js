// Landed cost per unit for a product made in one origin and shipped to one
// destination:
//   factory price
// + duty (base % + second layer %, both of the factory price)
// + (container price for the route [+ warehouse delivery fee]) / units per container
// Margin is on the selling price: (price - cost) / price.

export const TARGET_MARGIN = 20; // percent

export function routePrice(rates, originId, destinationId) {
  return rates.routes.find((r) => r.originId === originId && r.destinationId === destinationId)?.containerPrice ?? 0;
}

export function landedCost({ factoryPrice, dutyRate = 0, extraDutyRate = 0, unitsPerContainer, containerPrice = 0, warehouseFee = 0 }) {
  const factory = Number(factoryPrice) || 0;
  const duty = factory * ((Number(dutyRate) || 0) + (Number(extraDutyRate) || 0)) / 100;
  const units = Number(unitsPerContainer) || 0;
  const freight = units > 0 ? (Number(containerPrice) + Number(warehouseFee)) / units : 0;
  return { factory, duty, freight, total: factory + duty + freight };
}

// Cost of a stored sourcing row for a destination, with or without warehouse delivery
export function sourcingCost(sourcing, rates, destinationId, includeWarehouse) {
  const destination = rates.destinations.find((d) => d.id === destinationId);
  return landedCost({
    ...sourcing,
    containerPrice: routePrice(rates, sourcing.originId, destinationId),
    warehouseFee: includeWarehouse ? destination?.warehouseFee ?? 0 : 0,
  });
}

export function margin(price, cost) {
  const p = Number(price);
  if (!p || cost == null) return null;
  return ((p - cost) / p) * 100;
}

export const usd = (n, digits = 2) => (n == null ? "—" : `$${Number(n).toFixed(digits)}`);
