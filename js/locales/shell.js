// @ts-check
// tarn · shell texts: adds the shell part of every language to the kit catalog (core catalogs: js/locales/<lang>.js).
// Imported by the shell files that use these texts and by the barrel js/tarn.js; the core entry point js/core.js does not carry them.
import { addKitMessages } from '../i18n.js';
import en from './en-shell.js';
import de from './de-shell.js';
import es from './es-shell.js';
import fr from './fr-shell.js';

addKitMessages({ en, de, es, fr });
