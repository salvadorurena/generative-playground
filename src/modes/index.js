// Each mode has a param schema and create(env) -> { step() } where step
// draws one frame and returns true when the piece is finished.
// Order here is the order in the Mode menu.

import flow from './flow.js';
import attractor from './attractor.js';
import bloom from './bloom.js';
import circles from './circles.js';
import voronoi from './voronoi.js';
import truchet from './truchet.js';
import diffusion from './diffusion.js';

export const MODES = { flow, attractor, bloom, circles, voronoi, truchet, diffusion };
