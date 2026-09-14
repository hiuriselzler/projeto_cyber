import type { TFunction } from 'i18next';

import type { FormattedQuantity } from '../format/quantities';

/** A quantity as a screen reader should say it — "62,5 quilogramas", never "62,5 kg" (07 §8). */
export function spokenQuantity(t: TFunction, quantity: FormattedQuantity): string {
  return t('a11y.quantity', {
    value: quantity.text,
    unit: t(`unit_spoken.${quantity.unit}`, { count: quantity.amount }),
  });
}
