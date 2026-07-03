import type {FriendlyType} from 'ts-runtypes';
import {createFriendlyI18n} from 'ts-runtypes';
import type {Order} from './i18n-currency-type';

const friendlyOrder: FriendlyType<Order> = {
  rt$label: 'Order',
  rt$errors: {type: ''},
  total: {rt$label: 'Total', rt$errors: {type: '', max: 'at most $[val]'}},
};
const de_friendlyOrder: FriendlyType<Order> = {
  rt$label: 'Bestellung',
  rt$errors: {type: ''},
  total: {rt$label: 'Summe', rt$errors: {type: '', max: 'höchstens $[val]'}},
};

export const friendly = createFriendlyI18n<Order>(friendlyOrder, {
  locale: 'de',
  translations: {de: de_friendlyOrder},
  currency: 'EUR',
});

// a violated max renders as "10.000,00 €" in German and "$10,000.00" in English:
// symbol, separators and decimals all follow the locale and the currency
