import { initNav } from './nav';
import { initCart, clear } from './cart';
import { initCustom } from './custom';
import { initPending } from './pending';
import { initProduct } from './product';
import { initBrowse } from './browse';
import { initSubscribe } from './subscribe';
import { initDoor } from './door';
import { runIntro } from './intro';

initNav();
initCart();
initCustom();
initProduct();
initPending({ clearBag: clear, afterThanks: () => document.getElementById('stage')?.scrollIntoView({ behavior: 'auto' }) });
initSubscribe();
initDoor();
initBrowse();
runIntro();
