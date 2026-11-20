/**
 * Entry point of every page: <script type="module" src="assets/js/boot.js"></script> in the head.
 * Module scripts are deferred, so the document is parsed before the core starts.
 */
import { core } from './core/core.js';

core.boot();
