/**
 * Entry point of the probe pages (site/proben/, development only, not delivered; stage 7 moved them out of
 * the web root's pages). Registers the development modules and the S1 back-layer scene, then boots the same
 * core as every delivered page (module identity is the URL, so tests import the same /assets/js/... files).
 */
import { register } from '../../assets/js/modules/registry.js';
import { registerScene } from '../../assets/js/gl/szenen.js';
import raster from './raster.js';
import { core } from '../../assets/js/core/core.js';

register('textrise', () => import('./modules/textrise.js'));
register('theme-picker', () => import('./modules/theme-picker.js'));
register('form-regler', () => import('./modules/form-regler.js'));
register('gl-pruefung', () => import('./modules/gl-pruefung.js'));
register('figure-stand-in', () => import('./modules/figure-stand-in.js'));
register('scene-stand-in', () => import('./modules/scene-stand-in.js'));
registerScene(raster);

core.boot();
