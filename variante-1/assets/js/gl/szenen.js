/**
 * Scene registry of the WebGL layer (S1): name -> scene definition (`{ name, layer, kind, create }`).
 * Delivered: the figure of the home page. The probe pages (site/proben/, not delivered) register their own
 * scenes before the core boots (proben/js/boot.js: the back-layer scene "raster" of spike S1).
 * No three.js here: scenes get THREE from the world through create({ THREE, el, store }).
 */
import figur from './scenes/figur.js';

const SCENES = new Map([[figur.name, figur]]);

export function registerScene(def) {
  if (def && def.name && !SCENES.has(def.name)) SCENES.set(def.name, def);
}

export function sceneDef(name) {
  return SCENES.get(name) || null;
}
